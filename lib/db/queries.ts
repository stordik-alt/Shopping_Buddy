import { and, asc, desc, eq, ilike } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { TODAY } from '@/lib/budget'
import { currentWeekStart, type WeeklyMealPlan } from '@/lib/meal-plans'
import { inferPantryLocation } from '@/lib/pantry'
import type { ProductPrice } from '@/lib/prices'
import type { ProductCatalogEntry } from '@/lib/products'
import type {
  Child,
  Expense,
  Household,
  HouseholdMember,
  Item,
  ItemCategory,
  ItemUnit,
  Notification,
  PantryItem,
  PriceSensitivity,
  PurchaseRecord,
  QualityPreference,
  Store,
} from '@/lib/types'

// Decorative only — not modeled in the schema, keyed by chain to match the previous mock styling.
const CHAIN_COLOR: Record<string, string> = {
  Lidl: 'bg-[#d7f36b]',
  Albert: 'bg-[#f4b183]',
  Kaufland: 'bg-[#b9d8f5]',
  Billa: 'bg-[#f3c0d3]',
  Penny: 'bg-[#f6d38b]',
  JIP: 'bg-[#c9b8ef]',
}

const PRICE_SENSITIVITY_LABEL: Record<string, PriceSensitivity> = {
  cheapest: 'Nejlevnější',
  balanced: 'Vyvážené',
  quality_first: 'Kvalita především',
}

const QUALITY_PREFERENCE_LABEL: Record<string, QualityPreference> = {
  standard: 'Standardní',
  premium: 'Prémiová',
}

const ITEM_COLORS = ['bg-sky-100 text-sky-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700']
const colorForIndex = (index: number) => ITEM_COLORS[index % ITEM_COLORS.length]

export type SavedMealPlan = { weekStart: string; budgetLimit: number; plan: WeeklyMealPlan }
export type PendingInvitation = { id: string; email: string; expiresAt: string }

export type HouseholdData = {
  household: Household
  mainListId: string
  shoppingLists: string[]
  items: Item[]
  expenses: Expense[]
  notifications: Notification[]
  purchaseHistory: PurchaseRecord[]
  mealPlan: SavedMealPlan | null
  isOwner: boolean
  pendingInvitations: PendingInvitation[]
  pantryItems: PantryItem[]
}

/** The household's saved plan for the current week, if one has been generated yet. */
async function getCurrentMealPlan(householdId: string): Promise<SavedMealPlan | null> {
  const db = getDb()
  const weekStart = currentWeekStart(TODAY)
  const row = await db.query.mealPlans.findFirst({
    where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)),
  })
  if (!row) return null
  // Backfills cookedMeals for a plan saved before that field existed — JSON.parse simply omits it,
  // even though the type says it's always there.
  const parsed = JSON.parse(row.plan) as WeeklyMealPlan
  const plan: WeeklyMealPlan = { ...parsed, cookedMeals: parsed.cookedMeals ?? [] }
  return { weekStart: row.weekStart, budgetLimit: Number(row.budgetLimit), plan }
}

/** Creates a new household with the signed-in user as its owner (first login after sign-up, no pending invite). */
async function createHouseholdForUser(userId: string, userName: string) {
  const db = getDb()
  const [household] = await db.insert(schema.households).values({ name: `Domácnost – ${userName}` }).returning()
  await db.insert(schema.householdMembers).values({ householdId: household.id, userId, name: userName, role: 'owner' })
  await db.insert(schema.preferences).values({ householdId: household.id })
  await db.insert(schema.shoppingLists).values({ householdId: household.id, name: 'Hlavní seznam' })
  return household
}

/** Joins the household a pending invitation points to, as a member, marks the invitation
 *  accepted, and raises the "household events" notification (Phase D/8) so existing members find
 *  out a new person joined. Shared by both places a join can happen: the auto-join branch of
 *  `getHouseholdData` below (first login with a pending invite) and the explicit
 *  `acceptInvitationAction` (the public `/invite/[token]` landing page) — each has its own
 *  invitation-validity checks upstream, but the join itself must not be implemented twice. */
export async function joinHouseholdViaInvitation(userId: string, userName: string, invitation: typeof schema.invitations.$inferSelect) {
  const db = getDb()
  await db.insert(schema.householdMembers).values({ householdId: invitation.householdId, userId, name: userName, role: 'member' })
  await db.update(schema.invitations).set({ status: 'accepted' }).where(eq(schema.invitations.id, invitation.id))
  await db.insert(schema.notifications).values({
    householdId: invitation.householdId,
    title: 'Nový člen domácnosti',
    detail: `${userName} se právě připojil/a k domácnosti.`,
  })
  const household = await db.query.households.findFirst({ where: eq(schema.households.id, invitation.householdId) })
  if (!household) throw new Error(`Household ${invitation.householdId} referenced by invitation but missing`)
  return household
}

/** Loads (or, on first login, creates or joins-via-invitation) the signed-in user's household with every domain area the app needs on first render. */
export async function getHouseholdData(userId: string, userName: string, userEmail: string): Promise<HouseholdData> {
  const db = getDb()

  const ownMember = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, userId) })
  let household: typeof schema.households.$inferSelect | undefined
  if (ownMember) {
    household = await db.query.households.findFirst({ where: eq(schema.households.id, ownMember.householdId) })
  } else {
    const pendingInvitation = await db.query.invitations.findFirst({
      where: and(eq(schema.invitations.email, userEmail.toLowerCase()), eq(schema.invitations.status, 'pending')),
      orderBy: desc(schema.invitations.createdAt),
    })
    household =
      pendingInvitation && new Date(pendingInvitation.expiresAt) > new Date()
        ? await joinHouseholdViaInvitation(userId, userName, pendingInvitation)
        : await createHouseholdForUser(userId, userName)
  }
  if (!household) throw new Error(`Household ${ownMember!.householdId} referenced by household_members but missing`)

  const [members, children, preferencesRow, lists, expenseRows, notificationRows, purchaseRows, mealPlan, invitationRows, pantryRows] = await Promise.all([
    db.query.householdMembers.findMany({
      where: eq(schema.householdMembers.householdId, household.id),
      with: { profile: true },
      orderBy: asc(schema.householdMembers.joinedAt),
    }),
    db.query.children.findMany({ where: eq(schema.children.householdId, household.id) }),
    db.query.preferences.findFirst({ where: eq(schema.preferences.householdId, household.id) }),
    db.query.shoppingLists.findMany({
      where: eq(schema.shoppingLists.householdId, household.id),
      orderBy: asc(schema.shoppingLists.createdAt),
    }),
    db.query.expenses.findMany({ where: eq(schema.expenses.householdId, household.id), orderBy: asc(schema.expenses.date) }),
    db.query.notifications.findMany({ where: eq(schema.notifications.householdId, household.id), orderBy: asc(schema.notifications.createdAt) }),
    db.query.purchases.findMany({
      where: eq(schema.purchases.householdId, household.id),
      with: { items: true, storeLocation: { with: { store: true } } },
      orderBy: asc(schema.purchases.date),
    }),
    getCurrentMealPlan(household.id),
    db.query.invitations.findMany({
      where: and(eq(schema.invitations.householdId, household.id), eq(schema.invitations.status, 'pending')),
      orderBy: desc(schema.invitations.createdAt),
    }),
    db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, household.id), orderBy: asc(schema.pantryItems.addedAt) }),
  ])

  const myRawMember = members.find((member) => member.userId === userId)
  const isOwner = myRawMember?.role === 'owner'

  const mainListId = lists[0]?.id
  if (!mainListId) throw new Error('Household has no shopping list — run the seed script.')

  const items = await db.query.shoppingListItems.findMany({
    where: eq(schema.shoppingListItems.listId, mainListId),
    with: { preferredStoreLocation: { with: { store: true } } },
    orderBy: asc(schema.shoppingListItems.createdAt),
  })

  const mappedHousehold: Household = {
    id: household.id,
    name: household.name,
    monthlyBudget: Number(household.monthlyBudget),
    members: members.map(
      (member): HouseholdMember => ({
        id: member.id,
        name: member.name,
        role: member.role === 'owner' ? 'Správce domácnosti' : 'Člen domácnosti',
        age: member.profile?.age ?? 0,
        preferences: '',
        favoriteFoods: member.profile?.favoriteFoods ?? [],
        dislikedFoods: member.profile?.dislikedFoods ?? [],
        allergies: member.profile?.allergies ?? [],
      }),
    ),
    children: children.map(
      (child): Child => ({
        id: child.id,
        name: child.name,
        age: child.age,
        preferences: child.preferences,
        specialNeeds: child.specialNeeds ?? undefined,
      }),
    ),
    preferences: {
      preferredBrands: preferencesRow?.preferredBrands ?? [],
      preferredStores: preferencesRow?.preferredStores ?? [],
      preferredProducts: preferencesRow?.preferredProducts ?? [],
      excludedProducts: preferencesRow?.excludedProducts ?? [],
      priceSensitivity: PRICE_SENSITIVITY_LABEL[preferencesRow?.priceSensitivity ?? 'balanced'],
      qualityPreference: QUALITY_PREFERENCE_LABEL[preferencesRow?.qualityPreference ?? 'standard'],
      preferCzechProducts: preferencesRow?.preferCzechProducts ?? false,
    },
    restrictions: preferencesRow?.restrictions ?? [],
  }

  return {
    household: mappedHousehold,
    mainListId,
    shoppingLists: lists.map((list) => list.name),
    items: items.map(
      (item, index): Item => ({
        id: item.id,
        name: item.name,
        detail: item.detail,
        price: Number(item.price),
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        done: item.done,
        color: colorForIndex(index),
        priority: item.priority,
        note: item.note ?? undefined,
        store: item.preferredStoreLocation?.store.chain,
        onSale: item.onSale,
      }),
    ),
    expenses: expenseRows.map(
      (expense): Expense => ({
        id: expense.id,
        amount: Number(expense.amount),
        note: expense.note,
        category: expense.category,
        date: expense.date,
      }),
    ),
    notifications: notificationRows.map(
      (notification): Notification => ({
        id: notification.id,
        title: notification.title,
        detail: notification.detail,
        unread: notification.unread,
      }),
    ),
    purchaseHistory: purchaseRows.map(
      (purchase): PurchaseRecord => ({
        id: purchase.id,
        date: purchase.date,
        // Was `?? 'Lidl'` — silently mislabeling a purchase with no known store as Lidl. Found
        // while wiring up completePurchaseAction, the first thing that can actually produce a
        // purchase with no store. Per docs/03_DATABASE.md ("never invent data"), leave it unknown.
        store: purchase.storeLocation?.store.chain,
        total: Number(purchase.total),
        discount: purchase.discount != null ? Number(purchase.discount) : undefined,
        items: purchase.items.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, price: Number(item.price) })),
      }),
    ),
    mealPlan,
    isOwner,
    pendingInvitations: invitationRows.map(
      (invitation): PendingInvitation => ({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt.toString() }),
    ),
    pantryItems: pantryRows.map(
      (item): PantryItem => ({
        id: item.id,
        name: item.name,
        category: item.category,
        location: item.location,
        quantity: item.quantity,
        unit: item.unit,
        addedAt: item.addedAt.toString(),
        askedAt: item.askedAt?.toString(),
      }),
    ),
  }
}

/** Restocks (or creates) a pantry row for a purchased item — matched by `productId` when known,
 *  otherwise by name (case-insensitive, no fuzzy matching, same philosophy as
 *  `lib/products.ts`'s `matchProductByName`). Sums quantity into the existing row rather than
 *  overwriting it, per the product owner's explicit call ("sčítat množství"), and resets
 *  `addedAt`/`askedAt` so the check-in interval (`lib/pantry.ts`) restarts from a fresh restock.
 *  Shared by every purchase-creating path (`completePurchaseAction`, `importReceiptAction`) so the
 *  restocking rule lives in exactly one place. A brand-new row's location is seeded from
 *  `inferPantryLocation()`; an existing row's location is left untouched, so a manual move (e.g.
 *  chilled meat into the freezer) survives the next purchase of the same item. */
export async function restockPantryItem(
  householdId: string,
  item: { productId: string | null; name: string; category: ItemCategory; quantity: number; unit: ItemUnit },
) {
  const db = getDb()
  const existing = item.productId
    ? await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.productId, item.productId)) })
    : await db.query.pantryItems.findFirst({
        where: and(eq(schema.pantryItems.householdId, householdId), ilike(schema.pantryItems.name, item.name.trim())),
      })

  if (existing) {
    await db
      .update(schema.pantryItems)
      .set({ quantity: existing.quantity + item.quantity, addedAt: new Date(), askedAt: null })
      .where(eq(schema.pantryItems.id, existing.id))
  } else {
    await db.insert(schema.pantryItems).values({
      householdId,
      productId: item.productId,
      name: item.name,
      category: item.category,
      location: inferPantryLocation(item.category, item.name),
      quantity: item.quantity,
      unit: item.unit,
    })
  }
}

export type InvitationInfo = {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: string
  householdName: string
  invitedByName: string | null
}

/** Looks up an invitation by its share-link token, for the public /invite/[token] landing page. */
export async function getInvitationByToken(token: string): Promise<InvitationInfo | null> {
  const db = getDb()
  const invitation = await db.query.invitations.findFirst({
    where: eq(schema.invitations.token, token),
    with: { household: true, invitedByMember: true },
  })
  if (!invitation) return null
  return {
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toString(),
    householdName: invitation.household.name,
    invitedByName: invitation.invitedByMember?.name ?? null,
  }
}

/** Store directory: every store location, with active-deal count and available products derived from real price rows. */
export async function getStores(): Promise<Store[]> {
  const db = getDb()
  const locations = await db.query.storeLocations.findMany({
    with: { store: true, prices: { with: { product: true } }, deals: true },
  })
  return locations.map((location) => ({
    id: location.id,
    chain: location.store.chain,
    name: location.name,
    address: location.address,
    city: location.city,
    country: location.country,
    gps: { lat: Number(location.lat), lng: Number(location.lng) },
    hours: location.hours,
    dealsCount: location.deals.filter((deal) => deal.validUntil >= TODAY).length,
    availableProducts: Array.from(new Set(location.prices.map((price) => price.product.name))),
    color: CHAIN_COLOR[location.store.chain] ?? 'bg-muted',
  }))
}

/** The full product catalog as id/name/category triples — used to resolve a free-text shopping-
 *  list item name to a real `productId` and its real category (see `lib/products.ts`'s
 *  `matchProductByName()`). The category is included so a matched product's real category can
 *  flow onto the shopping-list item instead of the schema default ('Ostatní') — found missing
 *  while testing the pantry-location heuristic (`lib/pantry.ts`'s `inferPantryLocation()`), which
 *  depends on the item actually being categorized 'Potraviny' to ever route it to Lednice/Mrazák.
 *  Deliberately not filtered to only priced products, unlike `getProductPrices()` below: an item
 *  can identify a real product even before that product has any price data. */
export async function getProductCatalog(): Promise<ProductCatalogEntry[]> {
  const db = getDb()
  const products = await db.query.products.findMany({ columns: { id: true, name: true }, with: { category: { columns: { name: true } } } })
  return products.map((product) => ({ id: product.id, name: product.name, category: product.category.name }))
}

/** Per-product prices across stores, with any currently active deal folded in. One entry per store's latest recorded price. */
export async function getProductPrices(): Promise<ProductPrice[]> {
  const db = getDb()
  const products = await db.query.products.findMany({
    with: {
      category: true,
      prices: { with: { storeLocation: { with: { store: true } } }, orderBy: asc(schema.prices.recordedAt) },
      deals: { with: { storeLocation: { with: { store: true } } } },
    },
  })

  return products
    .filter((product) => product.prices.length > 0)
    .map((product) => {
      // Grouped (not collapsed) by store location, ascending by recordedAt, so a store that's been
      // re-observed over time keeps its whole history — the last entry is always the latest.
      const observationsByLocation = new Map<string, typeof product.prices>()
      for (const price of product.prices) {
        const list = observationsByLocation.get(price.storeLocationId) ?? []
        list.push(price)
        observationsByLocation.set(price.storeLocationId, list)
      }

      const activeDealByLocation = new Map(
        product.deals.filter((deal) => deal.validUntil >= TODAY).map((deal) => [deal.storeLocationId, deal]),
      )

      return {
        productName: product.name,
        category: product.category.name,
        prices: Array.from(observationsByLocation.values()).map((observations) => {
          const price = observations[observations.length - 1]
          const deal = activeDealByLocation.get(price.storeLocationId)
          return {
            store: price.storeLocation.store.chain,
            regularPrice: Number(price.regularPrice),
            dealPrice: deal ? Number(deal.dealPrice) : undefined,
            dealValidUntil: deal?.validUntil,
            unit: price.unit,
            unitPrice: Number(price.unitPrice),
            recordedAt: price.recordedAt,
            priceHistory: observations.map((observation) => ({ price: Number(observation.regularPrice), recordedAt: observation.recordedAt })),
          }
        }),
      }
    })
}

/** Appends a new dated price observation for a product at a store — never overwrites an existing
 *  row, so `prices` genuinely accumulates history over time (docs/04_ROADMAP.md "historical-price
 *  awareness"; the read side above already picks the latest observation per product/store and now
 *  also surfaces the full history). This is the foundation only: nothing calls it yet, since there
 *  is no price-refresh/ingestion source wired up (`docs/01_CURRENT_STATE.md` — "External price
 *  ingestion" is a separate, later gap). */
export async function recordPriceObservation(observation: {
  productId: string
  storeLocationId: string
  regularPrice: number
  currency?: string
  unit: (typeof schema.prices.$inferInsert)['unit']
  unitPrice: number
  recordedAt: string
}) {
  const db = getDb()
  const [row] = await db
    .insert(schema.prices)
    .values({
      productId: observation.productId,
      storeLocationId: observation.storeLocationId,
      regularPrice: observation.regularPrice.toString(),
      currency: observation.currency ?? 'CZK',
      unit: observation.unit,
      unitPrice: observation.unitPrice.toString(),
      recordedAt: observation.recordedAt,
    })
    .returning()
  return row
}
