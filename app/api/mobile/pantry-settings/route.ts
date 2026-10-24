import { and, asc, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { ITEM_UNITS } from '@anitka/shared/units'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { CHECKIN_DAYS_BY_CATEGORY, CHECKIN_DAYS_BY_SUBCATEGORY, PANTRY_AREAS, PANTRY_LOCATIONS, checkLocationRemoval, checkinSubcategoryKey, customPlaceIdFromKey, pantryPlaceOptions } from '@/lib/pantry'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import { productTypeByKey } from '@/lib/product-types'
import { validateStockLevels, type StockLevel } from '@/lib/pantry-restock'
import { getStockLevels } from '@/lib/db/restock'
import type { ItemCategory, PantryArea, PantryLocation } from '@/lib/types'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

async function settingsForHousehold(householdId: string) {
  const db = getDb()
  const [places, hiddenRows, checkinRows, subcategoryRows, stockLevels, itemRows] = await Promise.all([
    db.query.pantryPlaces.findMany({ where: eq(schema.pantryPlaces.householdId, householdId), orderBy: asc(schema.pantryPlaces.createdAt) }),
    db.select({ location: schema.pantryHiddenLocations.location }).from(schema.pantryHiddenLocations).where(eq(schema.pantryHiddenLocations.householdId, householdId)),
    db.query.pantryCheckinIntervals.findMany({ where: eq(schema.pantryCheckinIntervals.householdId, householdId) }),
    db.query.pantryCheckinSubcategoryIntervals.findMany({ where: eq(schema.pantryCheckinSubcategoryIntervals.householdId, householdId) }),
    getStockLevels(householdId),
    db.select({ location: schema.pantryItems.location, customPlaceId: schema.pantryItems.customPlaceId }).from(schema.pantryItems).where(eq(schema.pantryItems.householdId, householdId)),
  ])
  const hiddenLocations = hiddenRows.map((row) => row.location)
  const customPlaces = places.map((place) => ({ id: place.id, area: place.area, name: place.name }))
  const placeOptions = pantryPlaceOptions(customPlaces, hiddenLocations, itemRows)
  const checkinDays = Object.fromEntries(checkinRows.map((row) => [row.category, row.days])) as Partial<Record<ItemCategory, number>>
  const subcategoryCheckinDays = Object.fromEntries(subcategoryRows.map((row) => [checkinSubcategoryKey(row.category, row.subcategory), row.days])) as Record<string, number>
  const locationCounts = Object.fromEntries(PANTRY_LOCATIONS.map((location) => [location, itemRows.filter((row) => !row.customPlaceId && row.location === location).length])) as Record<PantryLocation, number>
  return { customPlaces, hiddenLocations, placeOptions, locationCounts, checkinDays, subcategoryCheckinDays, stockLevels }
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    return json(await settingsForHousehold(member.householdId))
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile pantry settings read]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let raw: unknown
    try { raw = await request.json() } catch { raw = null }
    if (!isRecord(raw) || typeof raw.action !== 'string') return json({ error: 'invalid_request' }, 400)

    const db = getDb()
    switch (raw.action) {
      case 'add-place': {
        if (Object.keys(raw).some((key) => !['action', 'area', 'name'].includes(key))) return json({ error: 'invalid_request' }, 400)
        if (typeof raw.area !== 'string' || !(PANTRY_AREAS as string[]).includes(raw.area) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 60) return json({ error: 'invalid_place', message: 'Vyberte oblast a zadejte název místa do 60 znaků.' }, 400)
        const existing = await db.query.pantryPlaces.findFirst({ where: and(eq(schema.pantryPlaces.householdId, member.householdId), eq(schema.pantryPlaces.area, raw.area as PantryArea), eq(schema.pantryPlaces.name, raw.name.trim())), columns: { id: true } })
        if (existing) return json({ error: 'place_exists', message: 'Toto místo už v dané oblasti existuje.' }, 409)
        await db.insert(schema.pantryPlaces).values({ householdId: member.householdId, area: raw.area as PantryArea, name: raw.name.trim() })
        break
      }
      case 'remove-place': {
        if (Object.keys(raw).some((key) => !['action', 'placeId'].includes(key)) || typeof raw.placeId !== 'string') return json({ error: 'invalid_request' }, 400)
        const place = await db.query.pantryPlaces.findFirst({ where: and(eq(schema.pantryPlaces.id, raw.placeId), eq(schema.pantryPlaces.householdId, member.householdId)), columns: { id: true } })
        if (!place) return json({ error: 'not_found' }, 404)
        const [held] = await db.select({ id: schema.pantryItems.id }).from(schema.pantryItems).where(and(eq(schema.pantryItems.householdId, member.householdId), eq(schema.pantryItems.customPlaceId, raw.placeId))).limit(1)
        if (held) return json({ error: 'place_not_empty', message: 'Nejdřív přesuňte položky z tohoto místa jinam.' }, 409)
        await db.delete(schema.pantryPlaces).where(and(eq(schema.pantryPlaces.id, raw.placeId), eq(schema.pantryPlaces.householdId, member.householdId)))
        break
      }
      case 'restore-location': {
        if (Object.keys(raw).some((key) => !['action', 'location'].includes(key)) || typeof raw.location !== 'string' || !(PANTRY_LOCATIONS as string[]).includes(raw.location)) return json({ error: 'invalid_location' }, 400)
        await db.delete(schema.pantryHiddenLocations).where(and(eq(schema.pantryHiddenLocations.householdId, member.householdId), eq(schema.pantryHiddenLocations.location, raw.location as PantryLocation)))
        break
      }
      case 'remove-location': {
        if (Object.keys(raw).some((key) => !['action', 'location', 'targetKey'].includes(key)) || typeof raw.location !== 'string' || !(PANTRY_LOCATIONS as string[]).includes(raw.location) || (raw.targetKey !== undefined && typeof raw.targetKey !== 'string')) return json({ error: 'invalid_location' }, 400)
        const location = raw.location as PantryLocation
        const [hiddenRows, placeRows, itemRows] = await Promise.all([
          db.select({ location: schema.pantryHiddenLocations.location }).from(schema.pantryHiddenLocations).where(eq(schema.pantryHiddenLocations.householdId, member.householdId)),
          db.query.pantryPlaces.findMany({ where: eq(schema.pantryPlaces.householdId, member.householdId), columns: { id: true, area: true, name: true } }),
          db.select({ location: schema.pantryItems.location, customPlaceId: schema.pantryItems.customPlaceId }).from(schema.pantryItems).where(and(eq(schema.pantryItems.householdId, member.householdId), eq(schema.pantryItems.location, location))),
        ])
        const hiddenLocations = hiddenRows.map((row) => row.location)
        const targetKey = typeof raw.targetKey === 'string' ? raw.targetKey : null
        const check = checkLocationRemoval({ location, hiddenLocations, customPlaces: placeRows, items: itemRows, targetKey })
        if ('error' in check) return json({ error: 'location_removal_invalid', message: check.error }, 409)
        if (check.itemCount > 0) {
          const customPlaceId = targetKey ? customPlaceIdFromKey(targetKey) : null
          if (customPlaceId) {
            const target = await db.query.pantryPlaces.findFirst({ where: and(eq(schema.pantryPlaces.id, customPlaceId), eq(schema.pantryPlaces.householdId, member.householdId)), columns: { id: true } })
            if (!target) return json({ error: 'invalid_target' }, 400)
            await db.update(schema.pantryItems).set({ customPlaceId }).where(and(eq(schema.pantryItems.householdId, member.householdId), eq(schema.pantryItems.location, location), isNull(schema.pantryItems.customPlaceId)))
          } else {
            if (!targetKey || !(PANTRY_LOCATIONS as string[]).includes(targetKey) || hiddenLocations.includes(targetKey as PantryLocation)) return json({ error: 'invalid_target' }, 400)
            await db.update(schema.pantryItems).set({ location: targetKey as PantryLocation }).where(and(eq(schema.pantryItems.householdId, member.householdId), eq(schema.pantryItems.location, location), isNull(schema.pantryItems.customPlaceId)))
          }
        }
        await db.insert(schema.pantryHiddenLocations).values({ householdId: member.householdId, location }).onConflictDoNothing()
        break
      }
      case 'set-checkin': {
        if (Object.keys(raw).some((key) => !['action', 'category', 'subcategory', 'days'].includes(key)) || typeof raw.category !== 'string' || !Object.prototype.hasOwnProperty.call(CHECKIN_DAYS_BY_CATEGORY, raw.category) || (raw.days !== null && (typeof raw.days !== 'number' || !Number.isInteger(raw.days) || raw.days < 1 || raw.days > 365))) return json({ error: 'invalid_checkin', message: 'Počet dní musí být celé číslo mezi 1 a 365.' }, 400)
        const category = raw.category as ItemCategory
        if (raw.subcategory === undefined) {
          const where = and(eq(schema.pantryCheckinIntervals.householdId, member.householdId), eq(schema.pantryCheckinIntervals.category, category))
          if (raw.days === null) await db.delete(schema.pantryCheckinIntervals).where(where)
          else await db.insert(schema.pantryCheckinIntervals).values({ householdId: member.householdId, category, days: raw.days as number }).onConflictDoUpdate({ target: [schema.pantryCheckinIntervals.householdId, schema.pantryCheckinIntervals.category], set: { days: raw.days as number, updatedAt: new Date() } })
        } else {
          if (typeof raw.subcategory !== 'string' || !(subcategoriesOfItem(category) as readonly string[]).includes(raw.subcategory) || !CHECKIN_DAYS_BY_SUBCATEGORY[category]?.[raw.subcategory]) return json({ error: 'invalid_subcategory' }, 400)
          const subcategory = raw.subcategory
          const where = and(eq(schema.pantryCheckinSubcategoryIntervals.householdId, member.householdId), eq(schema.pantryCheckinSubcategoryIntervals.category, category), eq(schema.pantryCheckinSubcategoryIntervals.subcategory, subcategory))
          if (raw.days === null) await db.delete(schema.pantryCheckinSubcategoryIntervals).where(where)
          else await db.insert(schema.pantryCheckinSubcategoryIntervals).values({ householdId: member.householdId, category, subcategory, days: raw.days as number }).onConflictDoUpdate({ target: [schema.pantryCheckinSubcategoryIntervals.householdId, schema.pantryCheckinSubcategoryIntervals.category, schema.pantryCheckinSubcategoryIntervals.subcategory], set: { days: raw.days as number, updatedAt: new Date() } })
        }
        break
      }
      case 'set-stock-level': {
        if (Object.keys(raw).some((key) => !['action', 'productTypeKey', 'minQuantity', 'maxQuantity', 'unit'].includes(key)) || typeof raw.productTypeKey !== 'string' || !productTypeByKey(raw.productTypeKey) || typeof raw.minQuantity !== 'number' || typeof raw.maxQuantity !== 'number' || typeof raw.unit !== 'string' || !(ITEM_UNITS as readonly string[]).includes(raw.unit)) return json({ error: 'invalid_stock_level', message: 'Vyplňte platný druh zboží, minimum, maximum a jednotku.' }, 400)
        const problem = validateStockLevels(raw.minQuantity, raw.maxQuantity)
        if (problem) return json({ error: 'invalid_stock_level', message: problem }, 400)
        const type = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, raw.productTypeKey), columns: { id: true } })
        if (!type) return json({ error: 'invalid_stock_level' }, 400)
        await db.insert(schema.householdStockLevels).values({ householdId: member.householdId, productTypeId: type.id, minQuantity: raw.minQuantity, maxQuantity: raw.maxQuantity, unit: raw.unit as StockLevel['unit'] }).onConflictDoUpdate({ target: [schema.householdStockLevels.householdId, schema.householdStockLevels.productTypeId], set: { minQuantity: raw.minQuantity, maxQuantity: raw.maxQuantity, unit: raw.unit as StockLevel['unit'] } })
        break
      }
      case 'remove-stock-level': {
        if (Object.keys(raw).some((key) => !['action', 'levelId'].includes(key)) || typeof raw.levelId !== 'string') return json({ error: 'invalid_request' }, 400)
        await db.delete(schema.householdStockLevels).where(and(eq(schema.householdStockLevels.id, raw.levelId), eq(schema.householdStockLevels.householdId, member.householdId)))
        break
      }
      default: return json({ error: 'invalid_action' }, 400)
    }
    return json(await settingsForHousehold(member.householdId))
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile pantry settings update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
