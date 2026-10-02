import { and, asc, desc, eq, gte, ilike, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { periodStart } from '@/lib/budget'
import { todayInPrague } from '@/lib/today'
import { planOfficialPrice, type OfficialPriceAction, type OfficialPriceSnapshot } from '@/lib/ingestion/official-price'
import { ingestionDate } from '@/lib/ingestion/today'
import type { IngestionSource as ProductSource } from '@/lib/ingestion/types'
import { currentWeekStart, parseSavedPlan, type WeeklyMealPlan } from '@/lib/meal-plans'
import type { StandaloneOffer } from '@/lib/offers'
import { createHouseholdNotification } from '@/lib/notify'
import { checkinSubcategoryKey, inferPantryLocation } from '@/lib/pantry'
import { restockedQuantity } from '@/lib/pantry-estimate'
import { formatOpeningHours } from '@/lib/stores/osm'
import type { ProductPrice } from '@/lib/prices'
import { inferPackageSize, resolveCatalogPackageSize, resolveNamedPackageSize } from '@/lib/recipes/packaging'
import { distinctProductName, resolveProductForSku, type ProductCatalogEntry } from '@/lib/products'
import { normalizeSearchText } from '@/lib/product-search'
import { isReceiptStalled } from '@/lib/receipt-progress'
import { invalidateProductCatalogCache } from '@/lib/db/cache-invalidation'
import type { RecurringInterval, RecurringOccurrence, RecurringPayment } from '@/lib/recurring-payments'
import type { ReceiptLineItem } from '@/lib/receipts'
import type {
  CategoryBudgets,
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
  PantryPlace,
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
  categoryBudgets: CategoryBudgets
  /** The household's recurring payments that are still running, and their due dates dealt with in
   *  the last year (lib/recurring-payments.ts). */
  recurringPayments: RecurringPayment[]
  recurringOccurrences: RecurringOccurrence[]
  notifications: Notification[]
  purchaseHistory: PurchaseRecord[]
  mealPlan: SavedMealPlan | null
  isOwner: boolean
  pendingInvitations: PendingInvitation[]
  pantryItems: PantryItem[]
  /** The household's own storage places, beyond the fixed `PantryLocation` list (lib/pantry.ts). */
  pantryPlaces: PantryPlace[]
  /** The household's own per-category pantry check-in interval overrides (lib/pantry.ts's
   *  CHECKIN_DAYS_BY_CATEGORY is the fixed default a category without one falls back to). */
  pantryCheckinDays: Partial<Record<ItemCategory, number>>
  /** The same per subcategory, keyed by `checkinSubcategoryKey(category, subcategory)` (lib/pantry.ts). */
  pantryCheckinSubcategoryDays: Record<string, number>
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
 *  the unique index on `household_members.user_id` decides who won. The loser deletes the *  household it just built (nothing else references it yet; children cascade) and returns the
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
/** The first day of the household's current budget period. */
function currentBudgetPeriodStart(startDay = 1): string {
  return periodStart(todayInPrague(), startDay)
}

function toExpense(expense: typeof schema.expenses.$inferSelect): Expense {
  return {
    id: expense.id,
    amount: Number(expense.amount),
    note: expense.note,
    category: expense.category,
    subcategory: expense.subcategory,
    date: expense.date,
    purchaseId: expense.purchaseId,
  }
}

function toNotification(notification: typeof schema.notifications.$inferSelect): Notification {
  return { id: notification.id, title: notification.title, detail: notification.detail, unread: notification.unread }
}

/** The household's expenses exactly as the page loads them. Server actions that change expenses in
 *  bulk (splitting a purchase item, recording a purchase) return this instead of revalidating the
 *  whole page, so a small save does not re-download every other area from the database. */
export async function getHouseholdExpenses(householdId: string, startDay = 1, includePurchaseId?: string | null): Promise<Expense[]> {
  const db = getDb()
  const effectiveStartDay = includePurchaseId
    ? (await db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { budgetPeriodStartDay: true } }))?.budgetPeriodStartDay ?? startDay
    : startDay
  const rows = await db.query.expenses.findMany({
    where: and(
      eq(schema.expenses.householdId, householdId),
      includePurchaseId
        ? sql`(${schema.expenses.date} >= ${currentBudgetPeriodStart(effectiveStartDay)} OR ${schema.expenses.purchaseId} = ${includePurchaseId})`
        : gte(schema.expenses.date, currentBudgetPeriodStart(effectiveStartDay)),
    ),
    orderBy: asc(schema.expenses.date),
  })
  return rows.map(toExpense)
}

/** The newest notifications, oldest first, exactly as the page loads them (see getHouseholdExpenses). */
export async function getHouseholdNotifications(householdId: string): Promise<Notification[]> {
  const rows = await getDb().query.notifications.findMany({
    where: eq(schema.notifications.householdId, householdId),
    orderBy: desc(schema.notifications.createdAt),
    limit: NOTIFICATIONS_SHOWN,
  })
  return rows.slice().reverse().map(toNotification)
}

/** The last year of purchases, with only the columns the history, usual items and pantry estimate
 *  read. The whole history with every related row (branch addresses, opening hours…) was sent on
 *  every render. */
function queryPurchaseRows(householdId: string, startDay = 1, includePurchaseId?: string | null) {
  return getDb().query.purchases.findMany({
    where: and(
      eq(schema.purchases.householdId, householdId),
      includePurchaseId
        ? sql`(${schema.purchases.date} >= ${currentBudgetPeriodStart(startDay)} OR ${schema.purchases.id} = ${includePurchaseId})`
        : gte(schema.purchases.date, currentBudgetPeriodStart(startDay)),
    ),
    columns: { id: true, date: true, total: true, discount: true },
    with: {
      items: { columns: { id: true, name: true, quantity: true, unit: true, price: true, category: true }, with: { expenseSplits: { columns: { category: true, subcategory: true, amount: true } } } },
      store: { columns: { chain: true } },
      storeLocation: { columns: { id: true }, with: { store: { columns: { chain: true } } } },
      // Whether this purchase came from a receipt at all — only those can be recorded into the
      // budget retroactively (see `needsBudgetRecording` in toPurchaseRecords); a completed-shopping-list
      // purchase's prices are estimates, never counted (owner's choice, 2026-09-26).
      receiptImports: { columns: { id: true } },
    },
    orderBy: asc(schema.purchases.date),
  })
}

function toPurchaseRecords(purchaseRows: Awaited<ReturnType<typeof queryPurchaseRows>>, expenseRows: Array<{ purchaseId: string | null }>): PurchaseRecord[] {
  const purchaseIdsWithExpenses = new Set(expenseRows.map((expense) => expense.purchaseId).filter((id): id is string => id != null))
  return purchaseRows.map(
    (purchase): PurchaseRecord => ({
      id: purchase.id,
      date: purchase.date,
      // Was `?? 'Lidl'` — silently mislabeling a purchase with no known store as Lidl. Found
      // while wiring up completePurchaseAction, the first thing that can actually produce a
      // purchase with no store. Per docs/03_DATABASE.md ("never invent data"), leave it unknown.
      store: purchase.storeLocation?.store.chain ?? purchase.store?.chain,
      total: Number(purchase.total),
      discount: purchase.discount != null ? Number(purchase.discount) : undefined,
      items: purchase.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: Number(item.price),
        category: item.category,
        expenseSplits: item.expenseSplits.map((split) => ({ category: split.category, subcategory: split.subcategory, amount: Number(split.amount) })),
      })),
      // A receipt-derived purchase with nothing in the budget yet (imported before receipts
      // started counting as expenses, 2026-09-26, or otherwise missed) can be recorded now
      // (owner request, 2026-09-27) — never a completed-shopping-list purchase, whose prices are
      // estimates, not what was actually paid. Also never one with no categorized item at all: a
      // purchase imported before purchase_items.category existed (migration 0042,
      // 2026-09-27) has nothing recordable (recordPurchaseAsExpense would only refuse it with
      // NothingToRecordError) — offering the button would just be a dead end.
      needsBudgetRecording:
        purchase.receiptImports.length > 0 &&
        !purchaseIdsWithExpenses.has(purchase.id) &&
        purchase.items.some((item) => item.category != null),
    }),
  )
}

function queryPantryRows(householdId: string) {
  return getDb().query.pantryItems.findMany({
    where: eq(schema.pantryItems.householdId, householdId),
    orderBy: asc(schema.pantryItems.addedAt),
    with: { subcategory: { columns: { name: true } } },
  })
}

function toPantryItem(item: Awaited<ReturnType<typeof queryPantryRows>>[number]): PantryItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    subcategory: item.subcategory?.name ?? null,
    location: item.location,
    customPlaceId: item.customPlaceId,
    quantity: item.quantity,
    unit: item.unit,
    // ISO strings: the pantry estimate and the check's order read the date part (YYYY-MM-DD).
    // `Date.toString()` ("Thu Sep 24 2026 …") made every estimate come out empty.
    addedAt: item.addedAt.toISOString(),
    askedAt: item.askedAt?.toISOString(),
    tracking: item.tracking,
  }
}

/** The household's pantry exactly as the page loads it (see getHouseholdExpenses). */
export async function getPantryItems(householdId: string): Promise<PantryItem[]> {
  return (await queryPantryRows(householdId)).map(toPantryItem)
}

/** What a purchase-creating action changed, in the shape the page holds it: the purchase history,
 *  the pantry (restocked), the expenses (a receipt records them) and the notifications (a budget
 *  threshold may have fired). Returned by those actions instead of revalidating the whole page, so
 *  finishing a trip or importing a receipt does not re-download the rest of the household. */export type PurchaseAftermath = {
  purchaseHistory: PurchaseRecord[]
  pantryItems: PantryItem[]
  expenses: Expense[]
  notifications: Notification[]
  /** Shopping-list items the purchase ticked off (a receipt matching the open list), with the real
   *  quantity and price — merged onto the list the page already holds. */
  tickedListItems: TickedListItem[]
}

export type TickedListItem = Pick<Item, 'id' | 'done' | 'quantity' | 'unit' | 'price'>

/** The household's list items a purchase ticked off (see receipt-list.ts). Scoped through the list
 *  to the household, so a purchase id from another household yields nothing. */
export async function getTickedListItems(householdId: string, purchaseId: string): Promise<TickedListItem[]> {
  const rows = await getDb()
    .select({
      id: schema.shoppingListItems.id,
      done: schema.shoppingListItems.done,
      quantity: schema.shoppingListItems.quantity,
      unit: schema.shoppingListItems.unit,
      price: schema.shoppingListItems.price,
    })
    .from(schema.shoppingListItems)
    .innerJoin(schema.shoppingLists, eq(schema.shoppingLists.id, schema.shoppingListItems.listId))
    .where(and(eq(schema.shoppingLists.householdId, householdId), eq(schema.shoppingListItems.checkedByPurchaseId, purchaseId)))
  return rows.map((row) => ({ ...row, price: Number(row.price) }))
}

/** Full purchase history used by the Nákupy tab. Kept separate from the initial page loader so
 * the Dashboard does not pay for a year's worth of purchase rows and expense splits. */
export async function getHouseholdPurchaseHistory(householdId: string, startDay = 1): Promise<PurchaseRecord[]> {
  const [purchaseRows, expenseRows] = await Promise.all([
    queryPurchaseRows(householdId, startDay),
    getHouseholdExpenses(householdId, startDay),
  ])
  return toPurchaseRecords(purchaseRows, expenseRows)
}

export async function getPurchaseAftermath(householdId: string, purchaseId?: string | null): Promise<PurchaseAftermath> {
  const db = getDb()
  const household = await db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { budgetPeriodStartDay: true } })
  if (!household) throw new Error(`Household ${householdId} not found`)
  const startDay = household.budgetPeriodStartDay
  const [purchaseRows, pantryRows, expenseRows, notifications, tickedListItems] = await Promise.all([
    queryPurchaseRows(householdId, startDay, purchaseId),
    queryPantryRows(householdId),
    getDb().query.expenses.findMany({
      where: and(
        eq(schema.expenses.householdId, householdId),
        purchaseId
          ? sql`(${schema.expenses.date} >= ${currentBudgetPeriodStart(startDay)} OR ${schema.expenses.purchaseId} = ${purchaseId})`
          : gte(schema.expenses.date, currentBudgetPeriodStart(startDay)),
      ),
      orderBy: asc(schema.expenses.date),
    }),
    getHouseholdNotifications(householdId),
    purchaseId ? getTickedListItems(householdId, purchaseId) : Promise.resolve([]),
  ])
  return {
    purchaseHistory: toPurchaseRecords(purchaseRows, expenseRows),
    pantryItems: pantryRows.map(toPantryItem),
    expenses: expenseRows.map(toExpense),
    notifications,
    tickedListItems,
  }
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

  // History is scoped to the household's configured budget period. Older records remain in the database
  // but are not loaded on normal page renders, which keeps the common read path bounded.
  const historySince = currentBudgetPeriodStart(household.budgetPeriodStartDay)
  const [members, children, preferencesRow, lists, expenseRows, notificationRows, purchaseRows, mealPlan, invitationRows, pantryRows, pantryPlaceRows, pantryCheckinRows, pantryCheckinSubcategoryRows, pendingReceiptImports, categoryBudgetRows, recurringRows, occurrenceRows] =
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
      queryPurchaseRows(household.id, household.budgetPeriodStartDay),
      getCurrentMealPlan(household.id),
      db.query.invitations.findMany({
        where: and(eq(schema.invitations.householdId, household.id), eq(schema.invitations.status, 'pending')),
        orderBy: desc(schema.invitations.createdAt),
      }),
      queryPantryRows(household.id),
      db.query.pantryPlaces.findMany({ where: eq(schema.pantryPlaces.householdId, household.id), orderBy: asc(schema.pantryPlaces.createdAt) }),
      db.query.pantryCheckinIntervals.findMany({ where: eq(schema.pantryCheckinIntervals.householdId, household.id) }),
      db.query.pantryCheckinSubcategoryIntervals.findMany({ where: eq(schema.pantryCheckinSubcategoryIntervals.householdId, household.id) }),
      getPendingReceiptImports(household.id),
      db.query.expenseCategoryBudgets.findMany({ where: eq(schema.expenseCategoryBudgets.householdId, household.id), columns: { category: true, amount: true } }),
      db.query.recurringPayments.findMany({
        where: and(eq(schema.recurringPayments.householdId, household.id), eq(schema.recurringPayments.active, true)),
        orderBy: asc(schema.recurringPayments.name),
      }),
      db
        .select({
          recurringPaymentId: schema.recurringPaymentOccurrences.recurringPaymentId,
          dueDate: schema.recurringPaymentOccurrences.dueDate,
          status: schema.recurringPaymentOccurrences.status,
        })
        .from(schema.recurringPaymentOccurrences)
        .innerJoin(schema.recurringPayments, eq(schema.recurringPayments.id, schema.recurringPaymentOccurrences.recurringPaymentId))
        .where(and(eq(schema.recurringPayments.householdId, household.id), gte(schema.recurringPaymentOccurrences.dueDate, historySince))),
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
    budgetPeriodStartDay: household.budgetPeriodStartDay,
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
        done: item.done,        color: colorForIndex(index),
        priority: item.priority,
        note: item.note ?? undefined,
        store: item.preferredStoreLocation?.store.chain,
        onSale: item.onSale,
      }),
    ),
    categoryBudgets: Object.fromEntries(categoryBudgetRows.map((row) => [row.category, Number(row.amount)])),
    recurringPayments: recurringRows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      amount: Number(row.amount),
      intervalMonths: row.intervalMonths as RecurringInterval,
      startDate: row.startDate,
      active: row.active,
    })),
    recurringOccurrences: occurrenceRows.map((row) => ({ ...row, status: row.status === 'skipped' ? 'skipped' : 'paid' })),
    expenses: expenseRows.map(toExpense),
    // Loaded newest first (for the limit), shown oldest first as before.
    notifications: notificationRows.slice().reverse().map(toNotification),
    purchaseHistory: toPurchaseRecords(purchaseRows, expenseRows),
    mealPlan,
    isOwner,
    pendingInvitations: invitationRows.map(
      (invitation): PendingInvitation => ({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt.toString() }),
    ),
    pantryItems: pantryRows.map(toPantryItem),
    pantryPlaces: pantryPlaceRows.map((place): PantryPlace => ({ id: place.id, area: place.area, name: place.name })),
    pantryCheckinDays: Object.fromEntries(pantryCheckinRows.map((row) => [row.category, row.days])),
    pantryCheckinSubcategoryDays: Object.fromEntries(pantryCheckinSubcategoryRows.map((row) => [checkinSubcategoryKey(row.category, row.subcategory), row.days])),
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
  item: { productId: string | null; name: string; category: ItemCategory; quantity: number; unit: ItemUnit; location?: PantryLocation; customPlaceId?: string | null; subcategoryId?: string | null },
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
      .set({
        quantity,
        addedAt: new Date(),
        askedAt: null,
        productId: existing.productId ?? item.productId,
        // A newly-resolved subcategory fills in a row that never had one; an existing row's own
        // subcategory is never overwritten by a later, possibly less certain restock (same
        // "don't undo a settled value" rule `location` already follows on restock).
        subcategoryId: existing.subcategoryId ?? item.subcategoryId ?? null,
      })
      .where(eq(schema.pantryItems.id, existing.id))
  } else {
    await db.insert(schema.pantryItems).values({
      householdId,
      productId: item.productId,
      name: item.name,
      category: item.category,
      subcategoryId: item.subcategoryId ?? null,
      location: item.location ?? inferPantryLocation(item.category, item.name) ?? 'Spíž',
      quantity: item.quantity,
      unit: item.unit,
      customPlaceId: item.customPlaceId ?? null,
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
    // One join: the relational `with: { store }` asked for the chain once per branch (~1,800 small
    // queries' worth of scans on every refresh of the cache).
    db
      .select({
        id: schema.storeLocations.id,
        storeId: schema.storeLocations.storeId,
        chain: schema.stores.chain,
        name: schema.storeLocations.name,
        address: schema.storeLocations.address,
        city: schema.storeLocations.city,
        country: schema.storeLocations.country,
        lat: schema.storeLocations.lat,
        lng: schema.storeLocations.lng,
        hours: schema.storeLocations.hours,
        openingHours: schema.storeLocations.openingHours,
      })
      .from(schema.storeLocations)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.storeLocations.storeId)),
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
    chain: location.chain,
    name: location.name,
    address: location.address,
    city: location.city,
    country: location.country,
    gps: location.lat != null && location.lng != null ? { lat: Number(location.lat), lng: Number(location.lng) } : null,
    // Opening hours from the map (OpenStreetMap syntax, shown in Czech) win over the free-text ones of
    // seeded and receipt branches.
    hours: location.openingHours ? formatOpeningHours(location.openingHours) : location.hours,
    dealsCount: dealsByChain.get(location.storeId) ?? 0,
    color: CHAIN_COLOR[location.chain] ?? 'bg-muted',
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
    columns: { id: true, name: true, defaultUnit: true, defaultLocation: true, isChildOriented: true, isNonInventory: true },
    with: { category: { columns: { name: true } }, subcategory: { columns: { name: true } } },
    ...(forms ? { where: inArray(schema.products.searchName, forms) } : {}),
  })
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category.name,
    defaultUnit: product.defaultUnit,
    defaultLocation: product.defaultLocation,
    subcategory: product.subcategory?.name ?? null,
    isChildOriented: product.isChildOriented,
    isNonInventory: product.isNonInventory,
  }))
}

/** The fixed subcategory rows (lib/product-subcategories.ts seeds them via migration 0044) — a
 *  small, rarely-changing table (~35 rows), so callers that need id ↔ name lookups (e.g. writing a
 *  product's recognized subcategory) fetch it whole rather than one row at a time. */
export async function getSubcategoryCatalog(): Promise<Array<{ id: string; category: ItemCategory; name: string }>> {
  const db = getDb()
  const rows = await db.query.productSubcategories.findMany({ columns: { id: true, category: true, name: true } })
  return rows
}

/** Sets a product's recognized subcategory/child-oriented/non-inventory flags — the categorization
 *  pipeline's write path, called only after a confident automatic match or an explicit household
 *  correction (never an unreviewed low-confidence guess). `subcategoryName` must be one of
 *  `category`'s fixed names (lib/product-subcategories.ts); an unknown name is a no-op rather than
 *  writing a dangling/incorrect reference, since the caller is expected to have already validated it. */
export async function setProductSubcategory(
  productId: string,
  category: ItemCategory,
  subcategoryName: string | null,
  flags: { isChildOriented?: boolean; isNonInventory?: boolean } = {},
): Promise<void> {
  const db = getDb()
  let subcategoryId: string | null = null
  if (subcategoryName) {
    const row = await db.query.productSubcategories.findFirst({
      where: and(eq(schema.productSubcategories.category, category), eq(schema.productSubcategories.name, subcategoryName)),
      columns: { id: true },
    })
    if (!row) return // unknown subcategory name — refuse to write a guess (CLAUDE.md section 11)
    subcategoryId = row.id
  }
  await db
    .update(schema.products)
    .set({ subcategoryId, ...flags })
    .where(eq(schema.products.id, productId))
  invalidateProductCatalogCache()
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
export async function upsertProductCatalogDefaults(entry: {
  name: string
  category: ItemCategory
  unit: ItemUnit
  location: PantryLocation
  // Optional: a confidently-resolved subcategory/tag from the categorization pipeline
  // (lib/categorization.ts), applied the same "human-confirmed correction" way as category/location
  // above — never written from an unreviewed low-confidence guess by the caller's own contract.
  subcategory?: string | null
  isChildOriented?: boolean
  isNonInventory?: boolean
}) {
  const db = getDb()
  const name = entry.name.trim()
  if (!name) return
  const categoryRow = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, entry.category) })
  if (!categoryRow) return // the 5 category rows are seeded 1:1 with itemCategoryEnum; defensive no-op if that's somehow not the case
  let subcategoryId: string | undefined
  if (entry.subcategory) {
    const subcategoryRow = await db.query.productSubcategories.findFirst({
      where: and(eq(schema.productSubcategories.category, entry.category), eq(schema.productSubcategories.name, entry.subcategory)),
      columns: { id: true },
    })
    subcategoryId = subcategoryRow?.id
  }
  const flags = {
    ...(entry.isChildOriented != null && { isChildOriented: entry.isChildOriented }),
    ...(entry.isNonInventory != null && { isNonInventory: entry.isNonInventory }),
  }
  const existing = await db.query.products.findFirst({ where: ilike(schema.products.name, name) })
  if (existing) {
    await db
      .update(schema.products)
      // A category an administrator has decided is final: a receipt correction must not undo it.
      .set({ ...(!existing.categoryLocked && { categoryId: categoryRow.id }), defaultLocation: entry.location, ...(subcategoryId && { subcategoryId }), ...flags })
      .where(eq(schema.products.id, existing.id))
  } else {
    await db.insert(schema.products).values({ name, categoryId: categoryRow.id, defaultUnit: entry.unit, defaultLocation: entry.location, subcategoryId, ...flags })
  }
  invalidateProductCatalogCache()
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
 *  the app re-renders on its periodic refresh (app-shell). It needs the prices of what is on the *  household's list (price and store comparison — matched by exact name, as `comparePrices()` does)
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
  // When the caller already supplies product names (the normal shopping-list path), do not scan the
  // entire deals table just to discover promoted products. The product relation below can resolve
  // active deals for those named products directly. Only the global Deals/price discovery path needs
  // the full active-product-id set.
  const dealProductIds = scope.runningDeals && names.length === 0
    ? (
        await db
          .selectDistinct({ id: schema.deals.productId })
          .from(schema.deals)
          .where(and(sql`${schema.deals.validFrom} <= ${today}::date`, sql`${schema.deals.validUntil} >= ${today}::date`))
      ).map((row) => row.id)
    : []
  if (names.length === 0 && dealProductIds.length === 0) return []

  const products = await db.query.products.findMany({
    where: (products, { or, inArray }) =>
      or(names.length > 0 ? inArray(products.name, names) : undefined, dealProductIds.length > 0 ? inArray(products.id, dealProductIds) : undefined),
    // Only the columns the mapping below reads. Loading whole related rows (each price with its
    // store, branch and the branch's store again; each deal with its branch) multiplied the data
    // every 20-second refresh pulled from the database.
    columns: { id: true, name: true },
    with: {
      category: { columns: { name: true } },
      deals: { columns: { storeId: true, storeLocationId: true, dealPrice: true, validFrom: true, validUntil: true } },
    },
  })
  if (products.length === 0) return []

  const productIds = products.map((product) => product.id)
  const productIdList = sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)
  const cutoff = sql`${today}::date - interval '30 days'`

  // Price history is intentionally bounded. For every product/store/context keep:
  //   1. the latest observation (the current price),
  //   2. all observations from the recent 30-day window,
  //   3. one older observation with a different price, so previousPrice() still works when
  //      the last price change was more than 30 days ago.
  //
  // This preserves the semantics used by recentPriceLow(), priceSteps() and previousPrice() while
  // preventing an ever-growing prices table from being reloaded on every page refresh.
  const selectedPriceIds = await db.execute(sql`
    with latest as (
      select distinct on (p.product_id, p.store_id, p.store_location_id, p.price_scope)
        p.id,
        p.product_id,
        p.store_id,
        p.store_location_id,
        p.price_scope,
        p.regular_price
      from prices p
      where p.product_id in (${productIdList})
      order by
        p.product_id,
        p.store_id,
        p.store_location_id,
        p.price_scope,
        p.observed_at desc,
        p.id desc
    ),
    recent as (
      select p.id
      from prices p
      where p.product_id in (${productIdList})
        and p.observed_at >= (${cutoff})
    ),
    previous_distinct as (
      select distinct on (p.product_id, p.store_id, p.store_location_id, p.price_scope)
        p.id
      from prices p
      inner join latest l
        on l.product_id = p.product_id
        and l.store_id = p.store_id
        and l.store_location_id is not distinct from p.store_location_id
        and l.price_scope = p.price_scope
      where p.observed_at < (${cutoff})
        and p.regular_price <> l.regular_price
      order by
        p.product_id,
        p.store_id,
        p.store_location_id,
        p.price_scope,
        p.observed_at desc,
        p.id desc
    )
    select id from latest
    union
    select id from recent
    union
    select id from previous_distinct
  `)

  const priceIds = selectedPriceIds.rows.map((row) => String((row as { id: string }).id))
  const prices = priceIds.length === 0
    ? []
    : await db.query.prices.findMany({
        where: inArray(schema.prices.id, priceIds),
        columns: {
          id: true,
          productId: true,
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
      })

  const packageRows = productIds.length === 0
    ? []
    : await db
        .select({ productId: schema.productPackages.productId, quantity: schema.productPackages.quantity, unit: schema.productPackages.unit })
        .from(schema.productPackages)
        .where(inArray(schema.productPackages.productId, productIds))
  const packagesByProduct = new Map<string, { quantity: number; unit: 'ks' | 'kg' | 'l' }[]>()
  for (const row of packageRows) {
    const list = packagesByProduct.get(row.productId) ?? []
    if (row.unit === 'ks' || row.unit === 'kg' || row.unit === 'l') list.push({ quantity: Number(row.quantity), unit: row.unit })
    packagesByProduct.set(row.productId, list)
  }

  const pricesByProduct = new Map<string, typeof prices>()
  for (const price of prices) {
    const list = pricesByProduct.get(price.productId) ?? []
    list.push(price)
    pricesByProduct.set(price.productId, list)
  }

  return products
    .map((product) => {
      const productPrices = pricesByProduct.get(product.id) ?? []
      if (productPrices.length === 0) return null

      // A price context is the same product + scope + retailer + branch (when known). Multiple
      // sources may coexist in that context; the latest observation remains the current value,
      // while the bounded observation set stays available to historical-price logic.
      const observationsByContext = new Map<string, typeof productPrices>()
      for (const price of productPrices) {
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