import { and, asc, desc, eq, gte, ilike, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'
import { planOfficialPrice, type OfficialPriceAction, type OfficialPriceSnapshot } from '@/lib/ingestion/official-price'
import { ingestionDate } from '@/lib/ingestion/today'
import type { IngestionSource as ProductSource } from '@/lib/ingestion/types'
import { currentWeekStart, parseSavedPlan, type WeeklyMealPlan } from '@/lib/meal-plans'
import type { StandaloneOffer } from '@/lib/offers'
import { createHouseholdNotification } from '@/lib/notify'
import { inferPantryLocation } from '@/lib/pantry'
import { restockedQuantity } from '@/lib/pantry-estimate'
import { formatOpeningHours } from '@/lib/stores/osm'
import type { ProductPrice } from '@/lib/prices'
import { distinctProductName, resolveProductForSku, type ProductCatalogEntry } from '@/lib/products'
import { normalizeSearchText } from '@/lib/product-search'
import { isReceiptStalled } from '@/lib/receipt-progress'
import type { ReceiptLineItem } from '@/lib/receipts'
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
  PantryLocation,
  PriceSensitivity,
  PurchaseRecord,
  QualityPreference,
  Store,
} from '@/lib/types'

// Decorative only — not modeled in the schema, keyed by chain to match the previous mock styling.
const CHAIN_COLOR: Record<string, string> = {
  Lidl: 'bg-[#d7f36b]',
  Albert: 'bg-[#f4b183]',
  'Albert Hypermarket': 'bg-[#f4b183]',
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

/** A receipt import the household still needs to act on — awaiting review, blocked on a duplicate
 *  decision, or failed — per docs/08_OCR_RECEIPT_PIPELINE.md sections 13/14/19. A `completed`/
 *  `cancelled`/manual-entry row never needs to appear here; it's already reflected in
 *  `purchaseHistory`. */
export type ReceiptImportState = {
  id: string
  status: (typeof schema.receiptStatusEnum.enumValues)[number]
  // Whether an original photo/PDF is stored. The private blob URL itself is deliberately not sent
  // to the client — the image is only reachable through app/api/receipts/[id]/image, which checks
  // household ownership.
  hasImage: boolean
  // Raw OCR text, so a reviewer can compare the recognized items with what the OCR actually read
  // (docs/08_OCR_RECEIPT_PIPELINE.md section 14). Null until OCR has succeeded.
  rawOcrText: string | null
  ocrProvider: string | null
  errorMessage: string | null
  extracted: { date: string | null; total: number | null; items: ReceiptLineItem[] } | null
  purchaseId: string | null
  // A non-final import that has not changed for long enough to be considered abandoned (server
  // restart mid-run, browser closed between upload and processing) — the UI then offers to start
  // it again instead of showing "Zpracovává se…" forever.
  stalled: boolean
}

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
  pendingReceiptImports: ReceiptImportState[]
}

const RECEIPT_STATES_NEEDING_ATTENTION: (typeof schema.receiptStatusEnum.enumValues)[number][] = [
  'uploaded',
  'ocr_processing',
  'ocr_completed',
  'ocr_failed',
  'parsing',
  'parsed',
  'parsing_failed',
  'validating',
  'review_required',
  'duplicate_review',
]

/** Receipt imports the household still needs to act on (see `ReceiptImportState`). Shared between
 *  `getHouseholdData()` (initial page load) and `app/actions/receipts.ts`'s mutations, which
 *  return a single updated row through the same mapping via `toReceiptImportState`. */
export async function getPendingReceiptImports(householdId: string): Promise<ReceiptImportState[]> {
  const db = getDb()
  // Filtered by status in the database: this runs on every page render, and loading every receipt
  // ever imported (with its OCR text) only to drop the finished ones grew with each receipt.
  const rows = await db.query.receiptImports.findMany({
    where: and(eq(schema.receiptImports.householdId, householdId), eq(schema.receiptImports.source, 'ocr'), inArray(schema.receiptImports.status, RECEIPT_STATES_NEEDING_ATTENTION)),
    columns: { id: true, status: true, imageUrl: true, rawOcrText: true, ocrProvider: true, errorMessage: true, items: true, date: true, total: true, purchaseId: true, updatedAt: true },
    orderBy: desc(schema.receiptImports.createdAt),
  })
  return rows.map(toReceiptImportState)
}

type ReceiptStateRow = Pick<
  typeof schema.receiptImports.$inferSelect,
  'id' | 'status' | 'imageUrl' | 'rawOcrText' | 'ocrProvider' | 'errorMessage' | 'items' | 'date' | 'total' | 'purchaseId' | 'updatedAt'
>

export function toReceiptImportState(row: ReceiptStateRow): ReceiptImportState {
  return {
    id: row.id,
    status: row.status,
    hasImage: row.imageUrl != null,
    rawOcrText: row.rawOcrText,
    ocrProvider: row.ocrProvider,
    errorMessage: row.errorMessage,
    extracted: row.items
      ? { date: row.date, total: row.total != null ? Number(row.total) : null, items: JSON.parse(row.items) as ReceiptLineItem[] }
      : null,
    purchaseId: row.purchaseId,
    stalled: isReceiptStalled(row.status, row.updatedAt),
  }
}

/** The household's saved plan for the current week, if one has been generated yet. */
async function getCurrentMealPlan(householdId: string): Promise<SavedMealPlan | null> {
  const db = getDb()
  const weekStart = currentWeekStart(todayInPrague())
  const row = await db.query.mealPlans.findFirst({
    where: and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)),
  })
  if (!row) return null
  // Upgrades a plan saved in an older shape (no cookedMeals, no ingredient quantity/unit); a plan
  // that can't be upgraded is treated as "not generated yet" so the household just regenerates.
  const plan = parseSavedPlan(row.plan)
  if (!plan) return null
  return { weekStart: row.weekStart, budgetLimit: Number(row.budgetLimit), plan }
}

/** The household the user is a member of, or `undefined`. One account belongs to exactly one
 *  household (unique index `household_members_user_id_unique`, migration 0014), so no ordering is
 *  needed. */
async function findHouseholdForUser(userId: string) {
  const db = getDb()
  const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, userId) })
  return member ? db.query.households.findFirst({ where: eq(schema.households.id, member.householdId) }) : undefined
}

/** Creates a new household with the signed-in user as its owner (first login after sign-up, no pending invite).
 *
 *  Safe against concurrent first logins: a page render and a `router.refresh()` can both find "no
 *  membership yet" and both get here (a real browser pass produced two households for one sign-up).
 *  The membership row is therefore written LAST and is the commit point — nobody can find the
 *  household until it exists, so a request that loses the race never sees a half-built one — and
 *  the unique index on `household_members.user_id` decides who won. The loser deletes the
 *  household it just built (nothing else references it yet; children cascade) and returns the
 *  winner's. */
async function createHouseholdForUser(userId: string, userName: string) {
  const db = getDb()
  const [household] = await db.insert(schema.households).values({ name: `Domácnost – ${userName}` }).returning()
  await db.insert(schema.preferences).values({ householdId: household.id })
  await db.insert(schema.shoppingLists).values({ householdId: household.id, name: 'Hlavní seznam' })
  const claimed = await db
    .insert(schema.householdMembers)
    .values({ householdId: household.id, userId, name: userName, role: 'owner' })
    .onConflictDoNothing({ target: schema.householdMembers.userId })
    .returning({ id: schema.householdMembers.id })
  if (claimed.length > 0) return household

  await db.delete(schema.households).where(eq(schema.households.id, household.id))
  const winner = await findHouseholdForUser(userId)
  if (!winner) throw new Error(`Lost the household-creation race for user ${userId} but found no household`)
  return winner
}

/** Joins the household a pending invitation points to, as a member, marks the invitation
 *  accepted, and raises the "household events" notification (Phase D/8) so existing members find
 *  out a new person joined. Shared by both places a join can happen: the auto-join branch of
 *  `getHouseholdData` below (first login with a pending invite) and the explicit
 *  `acceptInvitationAction` (the public `/invite/[token]` landing page) — each has its own
 *  invitation-validity checks upstream, but the join itself must not be implemented twice. */
export async function joinHouseholdViaInvitation(userId: string, userName: string, invitation: typeof schema.invitations.$inferSelect) {
  const db = getDb()
  // A concurrent join for the same account (two renders, a double click) hits the unique index on
  // `household_members.user_id`; the loser must not raise a second "new member" notification, so
  // it stops here and returns the household the account is already in.
  const claimed = await db
    .insert(schema.householdMembers)
    .values({ householdId: invitation.householdId, userId, name: userName, role: 'member' })
    .onConflictDoNothing({ target: schema.householdMembers.userId })
    .returning({ id: schema.householdMembers.id })
  if (claimed.length === 0) {
    const existing = await findHouseholdForUser(userId)
    if (!existing) throw new Error(`Join for user ${userId} conflicted but found no household`)
    return existing
  }
  await db.update(schema.invitations).set({ status: 'accepted' }).where(eq(schema.invitations.id, invitation.id))
  await createHouseholdNotification(db, invitation.householdId, {
    title: 'Nový člen domácnosti',
    detail: `${userName} se právě připojil/a k domácnosti.`,
  }, { tab: 'Profil', excludeUserId: userId })
  const household = await db.query.households.findFirst({ where: eq(schema.households.id, invitation.householdId) })
  if (!household) throw new Error(`Household ${invitation.householdId} referenced by invitation but missing`)
  return household
}

/** How many notifications the page loads (the newest). */
const NOTIFICATIONS_SHOWN = 50
/** How far back expenses and purchases are loaded for the page. */
const HISTORY_DAYS = 365

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

  // Expenses and purchases are sent for the last year (the budget screens compare months, the
  // purchase stats describe current habits); older records stay in the database.
  const historySince = new Date(Date.parse(`${todayInPrague()}T00:00:00Z`) - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
  const [members, children, preferencesRow, lists, expenseRows, notificationRows, purchaseRows, mealPlan, invitationRows, pantryRows, pendingReceiptImports] =
    await Promise.all([
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
      db.query.expenses.findMany({ where: and(eq(schema.expenses.householdId, household.id), gte(schema.expenses.date, historySince)), orderBy: asc(schema.expenses.date) }),
      // The newest 50 are what the bell panel can usefully show; all of them grew with every week.
      db.query.notifications.findMany({ where: eq(schema.notifications.householdId, household.id), orderBy: desc(schema.notifications.createdAt), limit: NOTIFICATIONS_SHOWN }),
      // The last year, with only the columns the history, usual items and pantry estimate read. The
      // whole history with every related row (branch addresses, opening hours…) was sent on every render.
      db.query.purchases.findMany({
        where: and(eq(schema.purchases.householdId, household.id), gte(schema.purchases.date, historySince)),
        columns: { id: true, date: true, total: true, discount: true },
        with: {
          items: { columns: { name: true, quantity: true, unit: true, price: true } },
          store: { columns: { chain: true } },
          storeLocation: { columns: { id: true }, with: { store: { columns: { chain: true } } } },
        },
        orderBy: asc(schema.purchases.date),
      }),
      getCurrentMealPlan(household.id),
      db.query.invitations.findMany({
        where: and(eq(schema.invitations.householdId, household.id), eq(schema.invitations.status, 'pending')),
        orderBy: desc(schema.invitations.createdAt),
      }),
      db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, household.id), orderBy: asc(schema.pantryItems.addedAt) }),
      getPendingReceiptImports(household.id),
    ])

  const myRawMember = members.find((member) => member.userId === userId)
  const isOwner = myRawMember?.role === 'owner'

  const mainListId = lists[0]?.id
  if (!mainListId) throw new Error('Household has no shopping list — run the seed script.')

  const items = await db.query.shoppingListItems.findMany({
    where: eq(schema.shoppingListItems.listId, mainListId),
    with: { preferredStoreLocation: { columns: { id: true }, with: { store: { columns: { chain: true } } } } },
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
        subcategory: expense.subcategory,
        date: expense.date,
      }),
    ),
    // Loaded newest first (for the limit), shown oldest first as before.
    notifications: notificationRows.slice().reverse().map(
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
        store: purchase.storeLocation?.store.chain ?? purchase.store?.chain,
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
        // ISO strings: the pantry estimate and the check's order read the date part (YYYY-MM-DD).
        // `Date.toString()` ("Thu Sep 24 2026 …") made every estimate come out empty.
        addedAt: item.addedAt.toISOString(),
        askedAt: item.askedAt?.toISOString(),
        tracking: item.tracking,
      }),
    ),
    pendingReceiptImports,
  }
}

/** Restocks (or creates) a pantry row for a purchased item — matched by `productId` when known,
 *  otherwise by name (case-insensitive, no fuzzy matching, same philosophy as
 *  `lib/products.ts`'s `matchProductByName`). Sums quantity into the existing row rather than
 *  overwriting it, per the product owner's explicit call ("sčítat množství"), and resets
 *  `addedAt`/`askedAt` so the check-in interval (`lib/pantry.ts`) restarts from a fresh restock.
 *  Shared by every purchase-creating path (`completePurchaseAction`, `importReceiptAction`) so the
 *  restocking rule lives in exactly one place. A brand-new row's location is `item.location` when
 *  the caller already resolved one (e.g. a receipt import's catalog/keyword resolution, or a
 *  household-confirmed review answer) — otherwise `inferPantryLocation()`, falling back to 'Spíž'
 *  only as an absolute last resort for a caller with no placement logic of its own (e.g. a plain
 *  shopping-list purchase with an item genuinely too generic to classify — there's no review step
 *  on that path to ask the household instead). An existing row's location is always left untouched
 *  regardless, so a manual move (e.g. chilled meat into the freezer) survives the next purchase of
 *  the same item. */
export async function restockPantryItem(
  householdId: string,
  item: { productId: string | null; name: string; category: ItemCategory; quantity: number; unit: ItemUnit; location?: PantryLocation },
) {
  const db = getDb()
  const byProductId = item.productId
    ? await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.productId, item.productId)) })
    : null
  // Falls back to a name match even when productId is known, in case this pantry row predates the
  // product's own catalog entry (e.g. it was first restocked before `upsertProductCatalogDefaults`
  // ever cataloged this product) — otherwise a later restock would silently create a second,
  // never-merged row instead of summing into the existing one.
  const existing =
    byProductId ??
    (await db.query.pantryItems.findFirst({
      where: and(eq(schema.pantryItems.householdId, householdId), ilike(schema.pantryItems.name, item.name.trim())),
    }))

  if (existing) {
    // Summed with what was left, unless the old stock is probably used up (lib/pantry-estimate.ts).
    const quantity = restockedQuantity({ ...existing, addedAt: existing.addedAt.toISOString() }, item.quantity, todayInPrague())
    await db
      .update(schema.pantryItems)
      .set({ quantity, addedAt: new Date(), askedAt: null, productId: existing.productId ?? item.productId })
      .where(eq(schema.pantryItems.id, existing.id))
  } else {
    await db.insert(schema.pantryItems).values({
      householdId,
      productId: item.productId,
      name: item.name,
      category: item.category,
      location: item.location ?? inferPantryLocation(item.category, item.name) ?? 'Spíž',
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

/** Store directory: every store location, with its chain's active-deal count and the products the
 *  branch has real price rows for. */
export async function getStores(): Promise<Store[]> {
  const db = getDb()
  const today = todayInPrague()
  const [locations, chainDeals] = await Promise.all([
    // Branches only. This used to load every price of every branch with its whole product row
    // just to list product names in the branch detail — after the OSM import (~1,800 branches) that
    // was most of what the 20-second refresh pulled from the database and used up Neon's monthly
    // network transfer. The names now load when a branch's detail is opened (getStoreProductNames).
    db.query.storeLocations.findMany({ with: { store: { columns: { chain: true } } } }),
    // Counted per chain, not per branch: ingestion attaches a chain's web promotions to one
    // canonical branch (getCanonicalStoreLocationId), so a per-branch count showed all 29 Penny
    // offers on one of its 9 branches and none on the others. One product with two overlapping
    // promotions counts once.
    db
      .select({ storeId: schema.deals.storeId, count: sql<number>`count(DISTINCT ${schema.deals.productId})::int` })
      .from(schema.deals)
      .where(and(sql`${schema.deals.validFrom} <= ${today}`, sql`${schema.deals.validUntil} >= ${today}`))
      .groupBy(schema.deals.storeId),
  ])
  const dealsByChain = new Map(chainDeals.map((row) => [row.storeId, Number(row.count)]))
  return locations.map((location) => ({
    id: location.id,
    storeId: location.storeId,
    chain: location.store.chain,
    name: location.name,
    address: location.address,
    city: location.city,
    country: location.country,
    gps: location.lat != null && location.lng != null ? { lat: Number(location.lat), lng: Number(location.lng) } : null,
    // Opening hours from the map (OpenStreetMap syntax, shown in Czech) win over the free-text ones of
    // seeded and receipt branches.
    hours: location.openingHours ? formatOpeningHours(location.openingHours) : location.hours,
    dealsCount: dealsByChain.get(location.storeId) ?? 0,
    color: CHAIN_COLOR[location.store.chain] ?? 'bg-muted',
  }))
}

/** How many product names a branch detail lists at most. */
const STORE_PRODUCT_NAMES_LIMIT = 60

/** Names of products with a recorded price at one branch, alphabetically, at most 60 — for the
 *  branch detail in the store directory, loaded only when it is opened. Store data is global (not
 *  household-scoped); the caller decides who may ask. */
export async function getStoreProductNames(storeLocationId: string): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .selectDistinct({ name: schema.products.name })
    .from(schema.prices)
    .innerJoin(schema.products, eq(schema.products.id, schema.prices.productId))
    .where(eq(schema.prices.storeLocationId, storeLocationId))
    .orderBy(asc(schema.products.name))
    .limit(STORE_PRODUCT_NAMES_LIMIT)
  return rows.map((row) => row.name)
}

/** The full product catalog as id/name/category/defaultUnit/defaultLocation rows — used to resolve
 *  a free-text shopping-list or receipt item name to a real `productId` and its remembered
 *  defaults (see `lib/products.ts`'s `matchProductByName()`, `lib/receipts.ts`'s
 *  `resolveItemPlacement()`). The category is included so a matched product's real category can
 *  flow onto the shopping-list item instead of the schema default ('Ostatní') — found missing
 *  while testing the pantry-location heuristic (`lib/pantry.ts`'s `inferPantryLocation()`), which
 *  depends on the item actually being categorized 'Potraviny' to ever route it to Lednice/Mrazák.
 *  Deliberately not filtered to only priced products, unlike `getProductPrices()` below: an item
 *  can identify a real product even before that product has any price data. */
export async function getProductCatalog(names?: string[]): Promise<ProductCatalogEntry[]> {
  const db = getDb()
  // With `names`: only the products those names can match. The whole catalog is ~47,000 products
  // (~5 MB); loading it to match one list item or one receipt was a large share of the database
  // network transfer. `matchProductByName()` compares trimmed, lower-cased names, so every product it
  // could match has the same accent-free lower-case form (`search_name`) — the filter below returns
  // those candidates (a superset: it also ignores accents) and the caller's exact match decides.
  if (names && names.length === 0) return []
  const forms = names ? [...new Set(names.map((name) => normalizeSearchText(name.trim())))] : null
  const products = await db.query.products.findMany({
    columns: { id: true, name: true, defaultUnit: true, defaultLocation: true },
    with: { category: { columns: { name: true } } },
    ...(forms ? { where: inArray(sql`btrim(${schema.products.searchName})`, forms) } : {}),
  })
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category.name,
    defaultUnit: product.defaultUnit,
    defaultLocation: product.defaultLocation,
  }))
}

/** Remembers a household-confirmed product correction in the catalog — category, default unit,
 *  and pantry location — so the *next* receipt of the same product resolves it automatically
 *  instead of asking again (per the owner's "BIO KUŘE" example: corrected once to Mrazák, every
 *  later receipt of the same product should land there without review). Only ever called from a
 *  path where a human actually confirmed the data (manual entry, or a completed review) — never
 *  from an unreviewed automatic OCR pass, so the catalog only ever learns from verified corrections,
 *  never AI guesses. Creates the product if it doesn't exist yet (matched case-insensitively, same
 *  as `matchProductByName`) — the mechanism that lets a *first-time* correction still be remembered,
 *  not just a correction to an already-cataloged product.
 *
 *  `defaultUnit` is deliberately NOT overwritten on an already-cataloged product. Unlike category
 *  and pantry location, a receipt's unit describes how *that specific purchase* was rung up (e.g.
 *  "2 ks" vs. "2 l" of the same milk are both legitimate depending on how it was bought that time),
 *  not a correction to the product's own identity — so it's not a reliable signal for the catalog's
 *  canonical measurement unit the way a human explicitly fixing a wrong category/location is.
 *  Overwriting it here previously let a manual-entry form's unit dropdown (which defaults new rows
 *  to 'ks') silently downgrade an already-correct unit like 'l' to 'ks' on an unrelated purchase.
 *  Still set on first insert, since a brand-new product has no existing value to protect. */
export async function upsertProductCatalogDefaults(entry: { name: string; category: ItemCategory; unit: ItemUnit; location: PantryLocation }) {
  const db = getDb()
  const name = entry.name.trim()
  if (!name) return
  const categoryRow = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, entry.category) })
  if (!categoryRow) return // the 5 category rows are seeded 1:1 with itemCategoryEnum; defensive no-op if that's somehow not the case
  const existing = await db.query.products.findFirst({ where: ilike(schema.products.name, name) })
  if (existing) {
    await db
      .update(schema.products)
      .set({ categoryId: categoryRow.id, defaultLocation: entry.location })
      .where(eq(schema.products.id, existing.id))
  } else {
    await db.insert(schema.products).values({ name, categoryId: categoryRow.id, defaultUnit: entry.unit, defaultLocation: entry.location })
  }
}

/** Creates or enriches a physical store branch from a trusted directory/source.
 * Matching is by chain + normalized address + normalized city. Non-null source fields enrich an
 * OCR-created row; an external source must never erase an already known value by sending NULL. */
export async function upsertStoreLocationFromSource(input: {
  storeId: string
  name?: string | null
  address: string
  city?: string | null
  country?: string | null
  lat?: number | null
  lng?: number | null
  hours?: string | null
}) {
  const db = getDb()
  const normalize = (value: string | null | undefined) => value?.trim().toLocaleLowerCase('cs-CZ').replace(/\s+/g, ' ') ?? ''
  const wantedAddress = normalize(input.address)
  const wantedCity = normalize(input.city)

  if (!wantedAddress) throw new Error('Store location address is required.')

  const locations = await db.query.storeLocations.findMany({
    where: eq(schema.storeLocations.storeId, input.storeId),
  })
  const existing = locations.find(
    (location) =>
      normalize(location.address) === wantedAddress &&
      normalize(location.city) === wantedCity,
  )

  if (existing) {
    const updates = {
      name: input.name?.trim() || existing.name,
      address: existing.address,
      city: existing.city,
      country: input.country?.trim() || existing.country,
      lat: input.lat != null ? input.lat.toString() : existing.lat,
      lng: input.lng != null ? input.lng.toString() : existing.lng,
      hours: input.hours?.trim() || existing.hours,
    }

    await db
      .update(schema.storeLocations)
      .set(updates)
      .where(eq(schema.storeLocations.id, existing.id))

    return existing.id
  }

  const [created] = await db
    .insert(schema.storeLocations)
    .values({
      storeId: input.storeId,
      name: input.name?.trim() || input.address.trim(),
      address: input.address.trim(),
      city: input.city?.trim() ?? '',
      country: input.country?.trim() || 'Česká republika',
      lat: input.lat != null ? input.lat.toString() : null,
      lng: input.lng != null ? input.lng.toString() : null,
      hours: input.hours?.trim() || null,
    })
    .returning({ id: schema.storeLocations.id })

  return created.id
}

/** Which products `getProductPrices()` loads. The client never needs the whole catalog — after the
 *  full-catalog backfill that is ~47,000 products, which took ~25 s and ~22 MB per page render, and
 *  the app re-renders on its periodic refresh (app-shell). It needs the prices of what is on the
 *  household's list (price and store comparison — matched by exact name, as `comparePrices()` does)
 *  and of the products on promotion today (price watch, "Dnes je důležité"). */
export type ProductPriceScope = {
  /** Products with exactly these names. */
  names: string[]
  /** Also every product with a promotion running today. */
  runningDeals: boolean
}

/** Per-product prices across stores, with any currently active deal folded in. One entry per store's latest recorded price. */
export async function getProductPrices(scope: ProductPriceScope): Promise<ProductPrice[]> {
  const db = getDb()
  const today = todayInPrague()
  // Running today: started and not yet ended. A retailer can publish next week's offers ahead of
  // time, and those must not show as today's price.
  const isRunning = (deal: { validFrom: string; validUntil: string }) => deal.validFrom <= today && deal.validUntil >= today
  const names = [...new Set(scope.names)]
  if (names.length === 0 && !scope.runningDeals) return []
  const products = await db.query.products.findMany({
    where: (products, { or, inArray, sql: where }) =>
      or(
        names.length > 0 ? inArray(products.name, names) : undefined,
        scope.runningDeals
          ? where`EXISTS (SELECT 1 FROM deals d WHERE d.product_id = ${products.id} AND d.valid_from <= ${today}::date AND d.valid_until >= ${today}::date)`
          : undefined,
      ),
    // Only the columns the mapping below reads. Loading whole related rows (each price with its
    // store, branch and the branch's store again; each deal with its branch) multiplied the data
    // every 20-second refresh pulled from the database.
    columns: { id: true, name: true },
    with: {
      category: { columns: { name: true } },
      prices: {
        columns: {
          storeId: true,
          storeLocationId: true,
          priceScope: true,
          sourceType: true,
          locationResolution: true,
          regularPrice: true,
          unit: true,
          unitPrice: true,
          observedAt: true,
          validUntil: true,
        },
        with: { store: { columns: { chain: true } } },
        orderBy: asc(schema.prices.observedAt),
      },
      deals: { columns: { storeId: true, storeLocationId: true, dealPrice: true, validFrom: true, validUntil: true } },
    },
  })

  return products
    .filter((product) => product.prices.length > 0)
    .map((product) => {
      // A price context is the same product + scope + retailer + branch (when known). Multiple
      // sources may coexist in that context; the latest observation remains the current value,
      // while every observation stays available to historical-price logic.
      const observationsByContext = new Map<string, typeof product.prices>()
      for (const price of product.prices) {
        const contextKey = [
          price.priceScope,
          price.storeId,
          price.storeLocationId ?? 'NO_LOCATION',
        ].join(':')
        const list = observationsByContext.get(contextKey) ?? []
        list.push(price)
        observationsByContext.set(contextKey, list)
      }

      const activeDealByLocation = new Map(
        product.deals.filter((deal) => isRunning(deal) && deal.storeLocationId).map((deal) => [deal.storeLocationId, deal]),
      )
      // A chain-wide (CHAIN-scope) price has no branch, so it takes the chain's active promotion
      // whichever branch it is stored against: ingestion attaches a retailer's chain-wide promotion to
      // one canonical branch (getCanonicalStoreLocationId), and an online-only chain's has none at all.
      // The cheapest active one wins, so the result does not depend on row order. Without this a
      // retailer's ingested promotions never reached the price comparison for its chain-wide prices.
      const activeChainDealByStore = new Map<string, (typeof product.deals)[number]>()
      for (const deal of product.deals) {
        if (!isRunning(deal)) continue
        const current = activeChainDealByStore.get(deal.storeId)
        if (!current || Number(deal.dealPrice) < Number(current.dealPrice)) activeChainDealByStore.set(deal.storeId, deal)
      }

      return {
        productName: product.name,
        category: product.category.name,
        prices: Array.from(observationsByContext.values()).map((observations) => {
          const price = observations[observations.length - 1]
          const deal = price.storeLocationId
            ? activeDealByLocation.get(price.storeLocationId)
            : price.priceScope === 'CHAIN'
              ? activeChainDealByStore.get(price.storeId)
              : undefined
          return {
            store: price.store.chain,
            storeId: price.storeId,
            storeLocationId: price.storeLocationId,
            priceScope: price.priceScope,
            sourceType: price.sourceType,
            locationResolution: price.locationResolution,
            regularPrice: Number(price.regularPrice),
            dealPrice: deal ? Number(deal.dealPrice) : undefined,
            dealValidUntil: deal?.validUntil,
            unit: price.unit,
            unitPrice: Number(price.unitPrice),
            recordedAt: price.observedAt,
            priceHistory: observations.map((observation) => ({
              price: Number(observation.regularPrice),
              recordedAt: observation.observedAt,
              validUntil: observation.validUntil,
              sourceType: observation.sourceType,
              priceScope: observation.priceScope,
            })),
          }
        }),
      }
    })
}

/** Current offers at a chain for a product the app has no price for at that chain — what
 *  `getProductPrices()` cannot show, since it lists only products with a price. Some retailers publish
 *  only their offers (Penny), so their promotions have no regular price to compare with, and none is
 *  invented (CLAUDE.md sections 15 and 18). One row per product and chain: the cheapest offer running
 *  today. "Today" is the real date (Prague), like ingestion's, not the app's fixed demo date. */
export async function getStandaloneOffers(today: string = ingestionDate()): Promise<StandaloneOffer[]> {
  const db = getDb()
  const rows = await db.execute<{
    name: string
    category: string
    chain: string
    store_id: string
    deal_price: string
    unit: ItemUnit | null
    unit_price: string | null
    valid_until: string
  }>(sql`
    SELECT DISTINCT ON (p.id, s.id)
      p.name, c.name AS category, s.chain, s.id AS store_id, d.deal_price, d.unit, d.unit_price,
      max(d.valid_until) OVER (PARTITION BY p.id, s.id) AS valid_until
    FROM deals d
    JOIN products p ON p.id = d.product_id
    JOIN product_categories c ON c.id = p.category_id
    JOIN stores s ON s.id = d.store_id
    WHERE d.valid_from <= ${today}::date AND d.valid_until >= ${today}::date
      AND NOT EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = d.product_id AND pr.store_id = d.store_id)
    ORDER BY p.id, s.id, d.deal_price ASC, d.valid_until DESC
  `)
  return rows.rows.map((row) => ({
    productName: row.name,
    category: row.category as ItemCategory,
    store: row.chain,
    storeId: row.store_id,
    dealPrice: Number(row.deal_price),
    // The unit price is the cheapest offer's own, so it always describes the price shown.
    unit: row.unit,
    unitPrice: row.unit_price == null ? null : Number(row.unit_price),
    validUntil: String(row.valid_until).slice(0, 10),
  }))
}

/** Appends an immutable price observation. Current price is derived from the latest observation
 * for the same product/context; a new source must never overwrite an older observation, so `prices`
 * genuinely accumulates history over time (docs/04_ROADMAP.md "historical-price awareness").
 * Callers: receipt import (`app/actions/receipts.ts`) and `lib/ingestion/ingest.ts`'s Lidl price
 * ingestion (docs/01_CURRENT_STATE.md section 15). */
export async function recordPriceObservation(observation: {
  productId: string
  storeId: string
  storeLocationId?: string | null
  regularPrice: number
  currency?: string
  unit: (typeof schema.prices.$inferInsert)['unit']
  unitPrice: number
  observedAt: string
  validFrom?: string
  validUntil?: string | null
  priceScope?: (typeof schema.priceScopeEnum.enumValues)[number]
  sourceType?: (typeof schema.priceSourceTypeEnum.enumValues)[number]
  locationResolution?: (typeof schema.priceLocationResolutionEnum.enumValues)[number]
  sourceReference?: string | null
  confidence?: number | null
}) {
  const db = getDb()
  const priceScope = observation.priceScope ?? 'STORE'
  const storeLocationId = observation.storeLocationId ?? null
  const locationResolution =
    observation.locationResolution ??
    (priceScope === 'STORE' ? (storeLocationId ? 'RESOLVED' : 'UNKNOWN') : 'NOT_APPLICABLE')

  if (priceScope === 'STORE' && locationResolution === 'RESOLVED' && !storeLocationId) {
    throw new Error('Resolved STORE price observations require a store location.')
  }
  if (priceScope === 'STORE' && locationResolution === 'UNKNOWN' && storeLocationId) {
    throw new Error('UNKNOWN STORE price observations cannot have a store location.')
  }

  const [row] = await db
    .insert(schema.prices)
    .values({
      productId: observation.productId,
      storeId: observation.storeId,
      storeLocationId,
      priceScope,
      sourceType: observation.sourceType ?? 'OTHER',
      locationResolution,
      regularPrice: observation.regularPrice.toString(),
      currency: observation.currency ?? 'CZK',
      unit: observation.unit,
      unitPrice: observation.unitPrice.toString(),
      observedAt: observation.observedAt,
      validFrom: observation.validFrom ?? observation.observedAt,
      validUntil: observation.validUntil ?? null,
      sourceReference: observation.sourceReference ?? null,
      confidence: observation.confidence?.toString() ?? null,
    })
    .returning()
  return row
}

/** The latest stored official observation per retailer SKU (`source_reference`) at one store —
 *  loaded once per ingestion run so `recordOfficialPrice()` needs no lookup of its own per product
 *  (each lookup is a database round trip). Keyed by the SKU. */
export async function loadLatestOfficialPrices(storeId: string, sourceReferences?: string[]): Promise<Map<string, OfficialPriceSnapshot>> {
  const latest = new Map<string, OfficialPriceSnapshot>()
  // With `sourceReferences`, only the SKUs this run writes — a run reads one part of a catalog of up
  // to ~13,000 SKUs, and loading them all every run was a large share of the network transfer.
  if (sourceReferences) {
    for (const refs of chunks([...new Set(sourceReferences)], 1000)) {
      for (const [key, value] of await loadLatestOfficialPricesWhere(storeId, refs)) latest.set(key, value)
    }
    return latest
  }
  for (const [key, value] of await loadLatestOfficialPricesWhere(storeId, null)) latest.set(key, value)
  return latest
}

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

async function loadLatestOfficialPricesWhere(storeId: string, sourceReferences: string[] | null): Promise<Map<string, OfficialPriceSnapshot>> {
  const db = getDb()
  const rows = await db
    .selectDistinctOn([schema.prices.sourceReference], {
      id: schema.prices.id,
      sourceReference: schema.prices.sourceReference,
      observedAt: schema.prices.observedAt,
      regularPrice: schema.prices.regularPrice,
      unit: schema.prices.unit,
      unitPrice: schema.prices.unitPrice,
      currency: schema.prices.currency,
      validUntil: schema.prices.validUntil,
      lastConfirmedAt: schema.prices.lastConfirmedAt,
    })
    .from(schema.prices)
    .where(
      and(
        eq(schema.prices.storeId, storeId),
        eq(schema.prices.priceScope, 'CHAIN'),
        eq(schema.prices.sourceType, 'OFFICIAL'),
        sourceReferences ? inArray(schema.prices.sourceReference, sourceReferences) : undefined,
      ),
    )
    .orderBy(schema.prices.sourceReference, desc(schema.prices.observedAt))

  const latest = new Map<string, OfficialPriceSnapshot>()
  for (const row of rows) {
    if (row.sourceReference == null) continue
    latest.set(row.sourceReference, {
      id: row.id,
      observedAt: row.observedAt,
      regularPrice: Number(row.regularPrice),
      unit: row.unit,
      unitPrice: Number(row.unitPrice),
      currency: row.currency,
      validUntil: row.validUntil,
      lastConfirmedAt: row.lastConfirmedAt,
    })
  }
  return latest
}

/** True for a Postgres unique-violation (SQLSTATE 23505), which the driver may report directly or
 *  wrapped as the `cause` of a query error. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  return code === '23505'
}

/** Writes a retailer-published (CHAIN scope, OFFICIAL) price under the rules in
 *  `lib/ingestion/official-price.ts`: the current price is the observation with the latest date; a
 *  repeat run the same day refreshes that day's row instead of duplicating it; an unchanged price on a
 *  later day only confirms the open row (`last_confirmed_at`) instead of adding one; older data never
 *  displaces newer; and when the price changed, the previous observation stays as the old price,
 *  closed with `valid_until` = the date the new price was first observed (never deleted or
 *  overwritten — CLAUDE.md section 16). `latest` is the SKU's latest stored observation from
 *  `loadLatestOfficialPrices()`. Returns what was done and the SKU's new latest observation, for the
 *  caller to keep its map current. Receipt-based prices keep using `recordPriceObservation()`. */
export async function recordOfficialPrice(
  observation: {
    productId: string
    storeId: string
    sourceReference: string
    regularPrice: number
    currency: string
    unit: ItemUnit
    unitPrice: number
    observedAt: string
  },
  latest: OfficialPriceSnapshot | undefined,
): Promise<{ action: OfficialPriceAction['kind']; latest: OfficialPriceSnapshot | undefined; closedPrevious: boolean }> {
  const db = getDb()
  const action = planOfficialPrice(observation, latest)
  if (action.kind === 'stale' || action.kind === 'unchanged') return { action: action.kind, latest, closedPrevious: false }

  if (action.kind === 'confirm') {
    await db.update(schema.prices).set({ lastConfirmedAt: observation.observedAt }).where(eq(schema.prices.id, latest!.id))
    return { action: 'confirm', latest: { ...latest!, lastConfirmedAt: observation.observedAt }, closedPrevious: false }
  }

  const values = {
    regularPrice: observation.regularPrice.toString(),
    currency: observation.currency,
    unit: observation.unit,
    unitPrice: observation.unitPrice.toString(),
  }
  const snapshot = (id: string): OfficialPriceSnapshot => ({
    id,
    observedAt: observation.observedAt,
    regularPrice: observation.regularPrice,
    unit: observation.unit,
    unitPrice: observation.unitPrice,
    currency: observation.currency,
    validUntil: null,
    lastConfirmedAt: null,
  })

  if (action.kind === 'update-same-day') {
    await db.update(schema.prices).set(values).where(eq(schema.prices.id, latest!.id))
    return { action: 'update-same-day', latest: snapshot(latest!.id), closedPrevious: false }
  }

  let id: string
  try {
    const [row] = await db
      .insert(schema.prices)
      .values({
        productId: observation.productId,
        storeId: observation.storeId,
        storeLocationId: null,
        priceScope: 'CHAIN',
        sourceType: 'OFFICIAL',
        locationResolution: 'NOT_APPLICABLE',
        ...values,
        observedAt: observation.observedAt,
        validFrom: observation.observedAt,
        validUntil: null,
        sourceReference: observation.sourceReference,
      })
      .returning({ id: schema.prices.id })
    id = row.id
  } catch (err) {
    // A concurrent run stored this SKU's price for the same day first (the unique index on
    // official prices per SKU and day). Refresh that row instead of failing or duplicating.
    if (!isUniqueViolation(err)) throw err
    const [row] = await db
      .update(schema.prices)
      .set(values)
      .where(
        and(
          eq(schema.prices.storeId, observation.storeId),
          eq(schema.prices.productId, observation.productId),
          eq(schema.prices.priceScope, 'CHAIN'),
          eq(schema.prices.sourceType, 'OFFICIAL'),
          eq(schema.prices.sourceReference, observation.sourceReference),
          eq(schema.prices.observedAt, observation.observedAt),
        ),
      )
      .returning({ id: schema.prices.id })
    return { action: 'update-same-day', latest: snapshot(row.id), closedPrevious: false }
  }

  // The previous price is now an old price: it ended when the new one was first observed.
  if (action.closePrevious && latest) {
    await db.update(schema.prices).set({ validUntil: observation.observedAt }).where(eq(schema.prices.id, latest.id))
  }
  return { action: 'insert', latest: snapshot(id), closedPrevious: action.closePrevious && latest != null }
}

/** Looks up a catalog product previously linked to an external source's own id (e.g. Lidl's
 *  `erpNumber`) — checked first on every ingestion run so a product already matched/created once
 *  is found directly, instead of re-matching by name (which could drift) or creating a duplicate.
 *  Per CLAUDE.md section 34 ("use stable external IDs... unique constraints"). */
export async function findProductIdByExternalRef(source: ProductSource, externalId: string): Promise<string | null> {
  const db = getDb()
  const ref = await db.query.productExternalRefs.findFirst({
    where: and(eq(schema.productExternalRefs.source, source), eq(schema.productExternalRefs.externalId, externalId)),
  })
  return ref?.productId ?? null
}

/** Everything `resolveOrCreateProductFromExternal()` needs to look up, loaded once per ingestion
 *  run instead of once per product: a run resolves ~80 products, and each individual lookup was a
 *  network round trip to the database (the catalog lookup alone is a join over every product), which
 *  is what made a run take minutes. The maps are mutated as products are created, so a later
 *  product in the same run sees an earlier one exactly as a fresh lookup would. */
export type ExternalProductContext = {
  /** externalId -> catalog product id, for this source. */
  refs: Map<string, string>
  catalog: ProductCatalogEntry[]
  /** category name -> product_categories.id */
  categoryIds: Map<string, string>
}

/** The context for one ingestion run. With `scope` (what the run is about to write), only what those
 *  products can touch is loaded: their own external refs, the catalog products their names (or the
 *  SKU-distinct names, see `resolveProductForSku`) can match, and the refs of those candidates, which
 *  `resolveProductForSku` needs to tell whether a candidate already belongs to another SKU of this
 *  source. Before, every run (~22 a day) loaded the whole catalog and every ref of the source —
 *  several MB each time, most of Neon's monthly network transfer. Without `scope`, everything. */
export async function loadExternalProductContext(source: ProductSource, scope?: { externalIds: string[]; names: string[] }): Promise<ExternalProductContext> {
  const db = getDb()
  const refColumns = { externalId: schema.productExternalRefs.externalId, productId: schema.productExternalRefs.productId }
  const categoryRowsPromise = db.select({ id: schema.productCategories.id, name: schema.productCategories.name }).from(schema.productCategories)

  let refRows: { externalId: string; productId: string }[]
  let catalog: ProductCatalogEntry[]
  if (!scope) {
    ;[refRows, catalog] = await Promise.all([db.select(refColumns).from(schema.productExternalRefs).where(eq(schema.productExternalRefs.source, source)), getProductCatalog()])
  } else {
    const candidateNames = scope.names.flatMap((name, index) => [name, distinctProductName(name, scope.externalIds[index] ?? '')])
    catalog = await getProductCatalog(candidateNames)
    const candidateIds = catalog.map((product) => product.id)
    refRows = []
    for (const ids of chunks(scope.externalIds, 1000)) {
      refRows.push(...(await db.select(refColumns).from(schema.productExternalRefs).where(and(eq(schema.productExternalRefs.source, source), inArray(schema.productExternalRefs.externalId, ids)))))
    }
    for (const ids of chunks(candidateIds, 1000)) {
      refRows.push(...(await db.select(refColumns).from(schema.productExternalRefs).where(and(eq(schema.productExternalRefs.source, source), inArray(schema.productExternalRefs.productId, ids)))))
    }
  }
  const categoryRows = await categoryRowsPromise
  return {
    refs: new Map(refRows.map((row) => [row.externalId, row.productId])),
    catalog,
    categoryIds: new Map(categoryRows.map((row) => [row.name, row.id])),
  }
}

/** Resolves a normalized external product to a real catalog `products.id`, creating both the
 *  product and its external-ref link on first sight. Priority, matching the rest of the app's
 *  product-identity handling:
 *  1. Already linked via `product_external_refs` (fastest, and immune to the source renaming a
 *     product slightly between runs).
 *  2. An exact/whitespace/case-insensitive name match against the existing catalog
 *     (`lib/products.ts`'s `resolveProductForSku()`) — the household's own "Mléko polotučné" should
 *     get this source's price attached to it, not a second duplicate product. Except that a
 *     product already linked to a different SKU of the same source is never reused: a source's
 *     SKUs are distinct products even when their names are identical.
 *  3. Neither: create a new catalog product from the external data (owner decision, 2026-09-23 —
 *     the catalog only had 11 hand-seeded products, and real ingested data is how it grows).
 *  Every path ends with an external-ref row recorded, so a repeat run of the same product always
 *  takes path 1 from then on. `lastSeenAt` of already-linked products is refreshed separately, in
 *  one batch, by `touchExternalRefs()`.
 *  `context` is what an ingestion run passes so the lookups are not repeated per product; without
 *  it (one-off callers, tests) a fresh one is loaded for this call. */
export async function resolveOrCreateProductFromExternal(
  product: {
    externalId: string
    source: ProductSource
    name: string
    category: ItemCategory
    unit: ItemUnit
  },
  context?: ExternalProductContext,
): Promise<string> {
  const db = getDb()
  const ctx = context ?? (await loadExternalProductContext(product.source))

  const existingRefProductId = ctx.refs.get(product.externalId)
  if (existingRefProductId) return existingRefProductId

  // Name match, unless that would merge two SKUs of this same source into one product.
  const { match: matched, name: productName } = resolveProductForSku(ctx.catalog, product.name, product.externalId, new Set(ctx.refs.values()))

  let productId: string
  if (matched) {
    productId = matched.id
  } else {
    const categoryId = ctx.categoryIds.get(product.category)
    if (!categoryId) throw new Error(`Unknown product category: ${product.category}`)
    const [row] = await db
      .insert(schema.products)
      .values({ name: productName, categoryId, defaultUnit: product.unit })
      .returning()
    productId = row.id
    ctx.catalog.push({ id: row.id, name: row.name, category: product.category, defaultUnit: row.defaultUnit, defaultLocation: row.defaultLocation })
  }

  await db.insert(schema.productExternalRefs).values({ productId, source: product.source, externalId: product.externalId })
  ctx.refs.set(product.externalId, productId)
  return productId
}

/** The part of a store's catalog the next rotating refresh should read (0 when none is stored yet).
 *  The caller wraps it into range, since the number of parts can change between deployments. */
export async function getIngestionCursor(source: ProductSource): Promise<number> {
  const db = getDb()
  const row = await db.query.ingestionCursors.findFirst({ where: eq(schema.ingestionCursors.source, source) })
  return row?.nextPart ?? 0
}

/** Stores the part the next rotating refresh of this store should read. */
export async function setIngestionCursor(source: ProductSource, nextPart: number): Promise<void> {
  const db = getDb()
  await db
    .insert(schema.ingestionCursors)
    .values({ source, nextPart, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.ingestionCursors.source, set: { nextPart, updatedAt: new Date() } })
}

export type FlyerPageRow = typeof schema.flyerPages.$inferSelect

/** The pages of these flyers a model has already read (lib/ingestion/albert.ts), keyed
 *  `flyerId|pageNumber`. */
export async function loadFlyerPages(source: ProductSource, flyerIds: string[]): Promise<Map<string, FlyerPageRow>> {
  if (flyerIds.length === 0) return new Map()
  const db = getDb()
  const rows = await db.query.flyerPages.findMany({
    where: and(eq(schema.flyerPages.source, source), inArray(schema.flyerPages.flyerId, flyerIds)),
  })
  return new Map(rows.map((row) => [`${row.flyerId}|${row.pageNumber}`, row]))
}

/** Stores what a model read off one flyer page. A page already stored (two runs extracting it at
 *  the same time) keeps its first result: the page itself does not change, and nothing is paid for
 *  twice on a later run. */
export async function saveFlyerPage(row: typeof schema.flyerPages.$inferInsert): Promise<void> {
  const db = getDb()
  await db.insert(schema.flyerPages).values(row).onConflictDoNothing()
}

/** Removes the cached pages of flyers that ended before `before` (`YYYY-MM-DD`). Their deals stay in
 *  `deals`; the cache is only needed while a flyer is current, and is kept a while longer as the
 *  deals' provenance. Returns how many pages were removed. */
export async function pruneFlyerPages(source: ProductSource, before: string): Promise<number> {
  const db = getDb()
  const removed = await db
    .delete(schema.flyerPages)
    .where(and(eq(schema.flyerPages.source, source), sql`${schema.flyerPages.validUntil} < ${before}::date`))
    .returning({ flyerId: schema.flyerPages.flyerId })
  return removed.length
}

/** Marks external products as seen just now, in one statement per chunk instead of one per product. */
export async function touchExternalRefs(source: ProductSource, externalIds: string[]): Promise<void> {
  const db = getDb()
  const CHUNK = 500
  for (let i = 0; i < externalIds.length; i += CHUNK) {
    await db
      .update(schema.productExternalRefs)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(schema.productExternalRefs.source, source), inArray(schema.productExternalRefs.externalId, externalIds.slice(i, i + CHUNK))))
  }
}

/** One representative store_location to attach a chain-wide price/deal observation to. Real prices
 *  from an online-published source like this apply nationwide, not to one specific physical
 *  branch, matching how `lib/db/seed.ts`'s original seed data already attached each chain's price
 *  to a single location rather than duplicating it across every branch. Picks the first location by
 *  id for determinism; throws rather than silently skipping if the chain has no seeded location at
 *  all, since that would otherwise silently drop every price for that chain. */
/** Resolves a seeded store chain (e.g. 'Lidl') to its `stores.id` — the chain-level key the price
 *  observation model needs for CHAIN-scope prices, which deliberately carry no physical branch. */
export async function getStoreIdByChain(chain: string): Promise<string> {
  return (await getStoreByChain(chain)).id
}

/** A seeded store chain with whether it is online-only (no physical branches, so its deals carry no
 *  branch). */
export async function getStoreByChain(chain: string): Promise<{ id: string; isOnline: boolean }> {
  const db = getDb()
  const storeRow = await db.query.stores.findFirst({ where: eq(schema.stores.chain, chain) })
  if (!storeRow) throw new Error(`No seeded store for chain: ${chain}`)
  return { id: storeRow.id, isOnline: storeRow.isOnline }
}

export async function getCanonicalStoreLocationId(chain: string): Promise<string> {
  const db = getDb()
  const storeRow = await db.query.stores.findFirst({ where: eq(schema.stores.chain, chain) })
  if (!storeRow) throw new Error(`No seeded store for chain: ${chain}`)
  const location = await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.storeId, storeRow.id) })
  if (!location) throw new Error(`No seeded store location for chain: ${chain}`)
  return location.id
}

/** Upserts the currently-active deal for a product at a store — "currently active" meaning any
 *  existing row whose validity window hasn't ended yet. Re-running ingestion for the same ongoing
 *  promotion updates that one row (price or dates may have shifted slightly) instead of creating a
 *  duplicate every day; a genuinely new promotion (no still-active row) gets its own new row, so
 *  the history of past promotions in `deals` isn't overwritten. Per CLAUDE.md section 16 ("do not
 *  silently overwrite historical price information") — only the *active* row is touched. */
export async function upsertActiveDeal(deal: {
  productId: string
  /** The chain the promotion belongs to. */
  storeId: string
  /** The branch it applies at; null for an online-only chain, whose deals have none. */
  storeLocationId: string | null
  dealPrice: number
  /** The promotion's price per `unit`. Optional so a caller that has none does not invent one; both
   *  are stored together or not at all (a database check enforces the pair). */
  unit?: (typeof schema.deals.$inferInsert)['unit']
  unitPrice?: number
  currency?: string
  validFrom: string
  validUntil: string
}) {
  const db = getDb()
  if ((deal.unit == null) !== (deal.unitPrice == null)) throw new Error('A deal needs both unit and unitPrice, or neither')
  const unitColumns = deal.unit != null && deal.unitPrice != null ? { unit: deal.unit, unitPrice: deal.unitPrice.toString() } : {}
  const existing = await db.query.deals.findFirst({
    where: and(
      eq(schema.deals.productId, deal.productId),
      eq(schema.deals.storeId, deal.storeId),
      deal.storeLocationId ? eq(schema.deals.storeLocationId, deal.storeLocationId) : isNull(schema.deals.storeLocationId),
      sql`${schema.deals.validUntil} >= ${todayInPrague()}`,
    ),
  })
  if (existing) {
    await db
      .update(schema.deals)
      .set({ dealPrice: deal.dealPrice.toString(), ...unitColumns, currency: deal.currency ?? 'CZK', validFrom: deal.validFrom, validUntil: deal.validUntil })
      .where(eq(schema.deals.id, existing.id))
  } else {
    await db.insert(schema.deals).values({
      productId: deal.productId,
      storeId: deal.storeId,
      storeLocationId: deal.storeLocationId,
      dealPrice: deal.dealPrice.toString(),
      ...unitColumns,
      currency: deal.currency ?? 'CZK',
      validFrom: deal.validFrom,
      validUntil: deal.validUntil,
    })
  }
}
