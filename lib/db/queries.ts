import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { TODAY } from '@/lib/budget'
import { planOfficialPrice, type OfficialPriceAction, type OfficialPriceSnapshot } from '@/lib/ingestion/official-price'
import type { IngestionSource as ProductSource } from '@/lib/ingestion/types'
import { currentWeekStart, parseSavedPlan, type WeeklyMealPlan } from '@/lib/meal-plans'
import { inferPantryLocation } from '@/lib/pantry'
import type { ProductPrice } from '@/lib/prices'
import { resolveProductForSku, type ProductCatalogEntry } from '@/lib/products'
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
  const rows = await db.query.receiptImports.findMany({
    where: and(eq(schema.receiptImports.householdId, householdId), eq(schema.receiptImports.source, 'ocr')),
    orderBy: desc(schema.receiptImports.createdAt),
  })
  return rows.filter((row) => RECEIPT_STATES_NEEDING_ATTENTION.includes(row.status)).map(toReceiptImportState)
}

export function toReceiptImportState(row: typeof schema.receiptImports.$inferSelect): ReceiptImportState {
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
  const weekStart = currentWeekStart(TODAY)
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
      db.query.expenses.findMany({ where: eq(schema.expenses.householdId, household.id), orderBy: asc(schema.expenses.date) }),
      db.query.notifications.findMany({ where: eq(schema.notifications.householdId, household.id), orderBy: asc(schema.notifications.createdAt) }),
      db.query.purchases.findMany({
        where: eq(schema.purchases.householdId, household.id),
        with: { items: true, store: true, storeLocation: { with: { store: true } } },
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
        addedAt: item.addedAt.toString(),
        askedAt: item.askedAt?.toString(),
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
    await db
      .update(schema.pantryItems)
      .set({ quantity: existing.quantity + item.quantity, addedAt: new Date(), askedAt: null, productId: existing.productId ?? item.productId })
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

/** Store directory: every store location, with active-deal count and available products derived from real price rows. */
export async function getStores(): Promise<Store[]> {
  const db = getDb()
  const locations = await db.query.storeLocations.findMany({
    with: { store: true, prices: { with: { product: true } }, deals: true },
  })
  return locations.map((location) => ({
    id: location.id,
    storeId: location.storeId,
    chain: location.store.chain,
    name: location.name,
    address: location.address,
    city: location.city,
    country: location.country,
    gps: location.lat != null && location.lng != null ? { lat: Number(location.lat), lng: Number(location.lng) } : null,
    hours: location.hours,
    dealsCount: location.deals.filter((deal) => deal.validUntil >= TODAY).length,
    availableProducts: Array.from(new Set(location.prices.map((price) => price.product.name))),
    color: CHAIN_COLOR[location.store.chain] ?? 'bg-muted',
  }))
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
export async function getProductCatalog(): Promise<ProductCatalogEntry[]> {
  const db = getDb()
  const products = await db.query.products.findMany({
    columns: { id: true, name: true, defaultUnit: true, defaultLocation: true },
    with: { category: { columns: { name: true } } },
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

/** Per-product prices across stores, with any currently active deal folded in. One entry per store's latest recorded price. */
export async function getProductPrices(): Promise<ProductPrice[]> {
  const db = getDb()
  const products = await db.query.products.findMany({
    with: {
      category: true,
      prices: {
        with: { store: true, storeLocation: { with: { store: true } } },
        orderBy: asc(schema.prices.observedAt),
      },
      deals: { with: { storeLocation: { with: { store: true } } } },
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
        product.deals.filter((deal) => deal.validUntil >= TODAY).map((deal) => [deal.storeLocationId, deal]),
      )

      return {
        productName: product.name,
        category: product.category.name,
        prices: Array.from(observationsByContext.values()).map((observations) => {
          const price = observations[observations.length - 1]
          const deal = price.storeLocationId ? activeDealByLocation.get(price.storeLocationId) : undefined
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
export async function loadLatestOfficialPrices(storeId: string): Promise<Map<string, OfficialPriceSnapshot>> {
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
    })
    .from(schema.prices)
    .where(and(eq(schema.prices.storeId, storeId), eq(schema.prices.priceScope, 'CHAIN'), eq(schema.prices.sourceType, 'OFFICIAL')))
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
 *  repeat run the same day refreshes that day's row instead of duplicating it; older data never
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

export async function loadExternalProductContext(source: ProductSource): Promise<ExternalProductContext> {
  const db = getDb()
  const [refRows, catalog, categoryRows] = await Promise.all([
    db
      .select({ externalId: schema.productExternalRefs.externalId, productId: schema.productExternalRefs.productId })
      .from(schema.productExternalRefs)
      .where(eq(schema.productExternalRefs.source, source)),
    getProductCatalog(),
    db.select({ id: schema.productCategories.id, name: schema.productCategories.name }).from(schema.productCategories),
  ])
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
  const db = getDb()
  const storeRow = await db.query.stores.findFirst({ where: eq(schema.stores.chain, chain) })
  if (!storeRow) throw new Error(`No seeded store for chain: ${chain}`)
  return storeRow.id
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
  storeLocationId: string
  dealPrice: number
  currency?: string
  validFrom: string
  validUntil: string
}) {
  const db = getDb()
  const existing = await db.query.deals.findFirst({
    where: and(eq(schema.deals.productId, deal.productId), eq(schema.deals.storeLocationId, deal.storeLocationId), sql`${schema.deals.validUntil} >= ${TODAY}`),
  })
  if (existing) {
    await db
      .update(schema.deals)
      .set({ dealPrice: deal.dealPrice.toString(), currency: deal.currency ?? 'CZK', validFrom: deal.validFrom, validUntil: deal.validUntil })
      .where(eq(schema.deals.id, existing.id))
  } else {
    await db.insert(schema.deals).values({
      productId: deal.productId,
      storeLocationId: deal.storeLocationId,
      dealPrice: deal.dealPrice.toString(),
      currency: deal.currency ?? 'CZK',
      validFrom: deal.validFrom,
      validUntil: deal.validUntil,
    })
  }
}
