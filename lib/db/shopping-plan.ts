import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { getMemberStoreSelection, getStoreChains } from '@/lib/db/member-store-preferences'
import { getHitsForProducts, searchProductHits } from '@/lib/db/product-search'
import * as schema from '@/lib/db/schema'
import { EMPTY_STORE_SELECTION, hasStoreSelection, MAX_SHOP_STORES } from '@/lib/nearby-stores'
import { searchTokens, type ProductSearchHit } from '@/lib/product-search'
import { costForNeed, packageSize, pickAutoHit, type NeedSpec } from '@/lib/shopping-offers'
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
}

/** Runs a few async jobs at a time, keeping the order of results. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await work(items[index])
      }
    }),
  )
  return results
}

/** Builds a shopping plan for the household's not-yet-done shopping items (all its lists — the app
 *  shows them as one list).
 *
 *  For every item and every allowed chain there is at most one offer: the product the user pinned
 *  for that chain, else the automatic pick (`pickAutoHit`) among products found by the item's name.
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

  // Automatic candidates for every item, over all allowed chains at once. 'Ostatní' means the category
  // is unknown, so it must not restrict the search.
  const autoHits = await mapWithConcurrency(needs, 5, async (need) => {
    const tokens = searchTokens(need.name)
    if (tokens.length === 0 || allowedIds.length === 0) return [] as ProductSearchHit[]
    return searchProductHits(tokens, { storeIds: allowedIds, ...(need.category !== 'Ostatní' ? { category: need.category } : {}) })
  })

  const offers: PlanOffer[] = []
  const packageSizes: PlanResult['packageSizes'] = {}
  needs.forEach((need, index) => {
    const byChain = new Map<string, ProductSearchHit[]>()
    for (const hit of autoHits[index]) byChain.set(hit.storeId, [...(byChain.get(hit.storeId) ?? []), hit])
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
        const auto = pickAutoHit(need, byChain.get(storeId) ?? [])
        if (auto) chosen = { hit: auto.hit, cost: auto.cost.cost, source: 'auto' }
      }
      if (!chosen) continue
      offers.push({ needId: need.id, storeId, chain: chosen.hit.chain, productId: chosen.hit.productId, productName: chosen.hit.name, cost: chosen.cost, source: chosen.source })
      packageSizes[`${need.id}|${storeId}`] = packageSize(chosen.hit)
    }
  })

  const plan = planShopping(
    needs.map((need) => ({ id: need.id, name: need.name })),
    offers,
    { maxStores: request.maxStores, priorityStoreIds: request.priorityChainIds, allowedStoreIds: allowedIds },
  )
  plan.notes.push(...notes)
  return { plan, allowedChains, usedNearbySelection, packageSizes }
}
