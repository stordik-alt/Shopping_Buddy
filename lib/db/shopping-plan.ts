import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { getMemberStoreSelection, getStoreChains } from '@/lib/db/member-store-preferences'
import { getHitsForProducts, getHitsForProductTypes, searchProductHitsBatch } from '@/lib/db/product-search'
import * as schema from '@/lib/db/schema'
import { EMPTY_STORE_SELECTION, hasStoreSelection, MAX_SHOP_STORES } from '@/lib/nearby-stores'
import { searchTokens, type ProductSearchHit } from '@/lib/product-search'
import { resolveListItemTypes } from '@/lib/product-types'
import { costForNeed, packageSize, pickAutoHit, pickTypedHit, type NeedSpec } from '@/lib/shopping-offers'
import { planShopping, type PlanOffer, type ShoppingPlan } from '@/lib/shopping-plan'

// Everything the shopping planner needs from the database: a household's list items, the stores the
// user allows, the products they pinned, and what each item costs at each store — turned into the
// pure planner's input (lib/shopping-plan.ts). The caller resolves who is asking (session); nothing
// here trusts a client-supplied household or member id.

export class PlanInputError extends Error {}

/** The item, if it belongs to the household (via its list); otherwise `null`. Used before every pin
 *  change so one household cannot touch another's items. */
async function findOwnedItem(householdId: string, itemId: string) {
  const db = getDb()
  const item = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, itemId), with: { list: true } })
  return item && item.list.householdId === householdId ? item : null
}

/** Pins `productId` as the product to buy for `itemId` at chain `storeId`, replacing any earlier pin
 *  for that item and chain. The product must actually have a price at that chain — pinning something
 *  the chain does not sell would only produce a plan line that can never be priced. */
export async function pinProduct(householdId: string, itemId: string, storeId: string, productId: string): Promise<void> {
  const db = getDb()
  if (!(await findOwnedItem(householdId, itemId))) throw new PlanInputError('Položka nenalezena.')
  const hits = await getHitsForProducts([productId], [storeId])
  if (hits.length === 0) throw new PlanInputError('Tento produkt nemá v tomto obchodě cenu.')
  await db
    .insert(schema.shoppingListItemPins)
    .values({ itemId, storeId, productId })
    .onConflictDoUpdate({ target: [schema.shoppingListItemPins.itemId, schema.shoppingListItemPins.storeId], set: { productId, createdAt: new Date() } })
}

/** Removes the pin for an item at a chain (no-op when there is none). */
export async function unpinProduct(householdId: string, itemId: string, storeId: string): Promise<void> {
  const db = getDb()
  if (!(await findOwnedItem(householdId, itemId))) throw new PlanInputError('Položka nenalezena.')
  await db.delete(schema.shoppingListItemPins).where(and(eq(schema.shoppingListItemPins.itemId, itemId), eq(schema.shoppingListItemPins.storeId, storeId)))
}

/** The pins of the given items: `itemId -> storeId -> productId`. Only for items of the household. */
export async function getPinsForItems(householdId: string, itemIds: string[]): Promise<Map<string, Map<string, string>>> {
  const pins = new Map<string, Map<string, string>>()
  if (itemIds.length === 0) return pins
  const db = getDb()
  const rows = await db
    .select({ itemId: schema.shoppingListItemPins.itemId, storeId: schema.shoppingListItemPins.storeId, productId: schema.shoppingListItemPins.productId })
    .from(schema.shoppingListItemPins)
    .innerJoin(schema.shoppingListItems, eq(schema.shoppingListItems.id, schema.shoppingListItemPins.itemId))
    .innerJoin(schema.shoppingLists, eq(schema.shoppingLists.id, schema.shoppingListItems.listId))
    .where(and(inArray(schema.shoppingListItemPins.itemId, itemIds), eq(schema.shoppingLists.householdId, householdId)))
  for (const row of rows) pins.set(row.itemId, (pins.get(row.itemId) ?? new Map()).set(row.storeId, row.productId))
  return pins
}

export type PinRecord = { itemId: string; storeId: string; productId: string }

/** Every pin of the household's items, for showing which products are already chosen. */
export async function listPinsForHousehold(householdId: string): Promise<PinRecord[]> {
  const db = getDb()
  return db
    .select({ itemId: schema.shoppingListItemPins.itemId, storeId: schema.shoppingListItemPins.storeId, productId: schema.shoppingListItemPins.productId })
    .from(schema.shoppingListItemPins)
    .innerJoin(schema.shoppingListItems, eq(schema.shoppingListItems.id, schema.shoppingListItemPins.itemId))
    .innerJoin(schema.shoppingLists, eq(schema.shoppingLists.id, schema.shoppingListItems.listId))
    .where(eq(schema.shoppingLists.householdId, householdId))
}

export type PlanRequest = {
  /** Chains to prefer; those not allowed are ignored. */
  priorityChainIds: string[]
  maxStores: number
}

export type PlanResult = {
  plan: ShoppingPlan
  /** The chains the plan may use (the user's stores in their area, or every chain when they chose none). */
  allowedChains: { id: string; chain: string }[]
  /** Whether the allowed chains are the user's own selection. */
  usedNearbySelection: boolean
  /** The package size of each offered product ("1 l"), keyed `needId|storeId`; null for piece-priced products. */
  packageSizes: Record<string, { value: number; unit: string } | null>
  /** Number of whole retail packages required for each offered item. */
  packageCounts: Record<string, number>  /** Hypothetical cost of buying the entire open list at one chain, using the same offers as the planner. */
  singleStoreTotals: { storeId: string; chain: string; total: number; itemsPriced: number; itemsEstimated: number }[]
}

/** Builds a shopping plan for the household's not-yet-done shopping items (all its lists — the app
 *  shows them as one list).
 *
 *  For every item and every allowed chain there is at most one offer: the product the user pinned
 *  for that chain, else the automatic pick. An item that names a product type or group ("Máslo",
 *  "Kuřecí maso" — lib/product-types.ts) is offered only products of those types, the cheapest for
 *  the need (`pickTypedHit`); a chain with none of them has no offer, never a product that merely
 *  shares a word ("Kuřecí šunka"). Any other item is matched by its name as before (`pickAutoHit`).
 *  A pinned product that no longer has a price at its chain falls back to the automatic pick and is
 *  reported in `notes`. The plan itself is the pure `planShopping()`. */
export async function buildShoppingPlan(householdId: string, memberId: string | null, request: PlanRequest): Promise<PlanResult> {
  const db = getDb()
  if (!Number.isInteger(request.maxStores) || request.maxStores < 1 || request.maxStores > MAX_SHOP_STORES) {
    throw new PlanInputError(`Počet obchodů musí být celé číslo od 1 do ${MAX_SHOP_STORES}.`)
  }

  const [items, chains, selection] = await Promise.all([
    db
      .select({
        id: schema.shoppingListItems.id,
        name: schema.shoppingListItems.name,
        quantity: schema.shoppingListItems.quantity,
        unit: schema.shoppingListItems.unit,
        category: schema.shoppingListItems.category,
        productTypes: schema.shoppingListItems.productTypes,
      })
      .from(schema.shoppingListItems)
      .innerJoin(schema.shoppingLists, eq(schema.shoppingLists.id, schema.shoppingListItems.listId))
      .where(and(eq(schema.shoppingLists.householdId, householdId), eq(schema.shoppingListItems.done, false)))
      .orderBy(schema.shoppingListItems.createdAt, schema.shoppingListItems.id),
    getStoreChains(),
    memberId ? getMemberStoreSelection(memberId) : Promise.resolve(EMPTY_STORE_SELECTION),
  ])
  const usedNearbySelection = hasStoreSelection(selection)
  const allowedChains = usedNearbySelection ? chains.filter((chain) => selection.chainIds.includes(chain.id)) : chains
  const allowedIds = allowedChains.map((chain) => chain.id)
  const chainName = new Map(allowedChains.map((chain) => [chain.id, chain.chain]))

  const needs: NeedSpec[] = items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, category: item.category }))
  const notes: string[] = []

  const pins = await getPinsForItems(householdId, needs.map((need) => need.id))
  const pinnedProductIds = [...new Set([...pins.values()].flatMap((byStore) => [...byStore.values()]))]
  const pinnedHits = await getHitsForProducts(pinnedProductIds, allowedIds)
  const pinnedByKey = new Map(pinnedHits.map((hit) => [`${hit.productId}|${hit.storeId}`, hit]))

  // Items that name a product type or group (docs/12_PRODUCT_TYPES.md, phase 2): their candidates are
  // the products of those types, all fetched in one go.
  // The household's own choice of types wins over what the name resolves to (phase 3).
  const typed = items.map((item) => (item.productTypes && item.productTypes.length > 0 ? { types: item.productTypes } : resolveListItemTypes(item.name)))
  const typedHits = await getHitsForProductTypes([...new Set(typed.flatMap((entry) => entry?.types ?? []))], allowedIds)

  // Automatic candidates for every other item, over all allowed chains in one database query. 'Ostatní'
  // means the category is unknown, so it must not restrict the search. The batch function returns one
  // hit list per need with the same matching, scoring and 400-row cap as searchProductHits(); a typed
  // item gets an empty request (no tokens), which the batch skips.
  const autoHits = await searchProductHitsBatch(
    needs.map((need, index) => ({
      tokens: typed[index] ? [] : searchTokens(need.name),
      storeIds: allowedIds,
      ...(need.category !== 'Ostatní' ? { category: need.category } : {}),
    })),
  )

  const offers: PlanOffer[] = []
  const packageSizes: PlanResult['packageSizes'] = {}
  const packageCounts: PlanResult['packageCounts'] = {}
  needs.forEach((need, index) => {
    const accepted = typed[index] ? new Set(typed[index].types) : null
    const candidates = accepted ? typedHits.filter((entry) => accepted.has(entry.typeKey)).map((entry) => entry.hit) : autoHits[index]
    const byChain = new Map<string, ProductSearchHit[]>()
    for (const hit of candidates) byChain.set(hit.storeId, [...(byChain.get(hit.storeId) ?? []), hit])
    for (const storeId of allowedIds) {
      let chosen: { hit: ProductSearchHit; cost: number; source: 'pinned' | 'auto' } | null = null
      const pinnedProductId = pins.get(need.id)?.get(storeId)
      if (pinnedProductId) {
        const hit = pinnedByKey.get(`${pinnedProductId}|${storeId}`)
        const priced = hit ? costForNeed(need, hit) : null
        if (hit && priced) chosen = { hit, cost: priced.cost, source: 'pinned' }
        else notes.push(`U položky „${need.name}“ už připnutý produkt v obchodě ${chainName.get(storeId) ?? ''} nelze ocenit, použit byl automatický výběr.`)
      }
      if (!chosen) {
        const auto = accepted ? pickTypedHit(need, byChain.get(storeId) ?? []) : pickAutoHit(need, byChain.get(storeId) ?? [])
        if (auto) chosen = { hit: auto.hit, cost: auto.cost.cost, source: 'auto' }
      }
      if (!chosen) continue
      offers.push({ needId: need.id, storeId, chain: chosen.hit.chain, productId: chosen.hit.productId, productName: chosen.hit.name, cost: chosen.cost, packages: costForNeed(need, chosen.hit)?.packages ?? 1, source: chosen.source })
      const pricedChosen = costForNeed(need, chosen.hit)
      packageSizes[`${need.id}|${storeId}`] = packageSize(chosen.hit)
      packageCounts[`${need.id}|${storeId}`] = pricedChosen?.packages ?? 1
    }
  })

  const plan = planShopping(
    needs.map((need) => ({ id: need.id, name: need.name, quantity: need.quantity, unit: need.unit })),
    offers,
    { maxStores: request.maxStores, priorityStoreIds: request.priorityChainIds, allowedStoreIds: allowedIds },
  )
  plan.notes.push(...notes)

  // Full-basket comparison per allowed chain, separate from the optimized multi-store plan.
  // Reuses the same package-aware offers; missing prices fall back to the item's stored estimate.
  const singleStoreTotals = allowedChains.map((chain) => {
    let total = 0
    let itemsPriced = 0
    let itemsEstimated = 0
    for (const need of needs) {
      const offer = offers.find((entry) => entry.needId === need.id && entry.storeId === chain.id)
      if (offer) {
        total += offer.cost
        itemsPriced++
      } else {
        const item = items.find((entry) => entry.id === need.id)
        total += (item?.price ?? 0) * (item?.quantity ?? 0)
        itemsEstimated++
      }
    }
    return { storeId: chain.id, chain: chain.chain, total: Math.round(total * 100) / 100, itemsPriced, itemsEstimated }
  })

  return { plan, allowedChains, usedNearbySelection, packageSizes, packageCounts, singleStoreTotals }
}
