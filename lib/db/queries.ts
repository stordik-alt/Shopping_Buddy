import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type {
  Child,
  Expense,
  Household,
  HouseholdMember,
  Item,
  Notification,
  PriceSensitivity,
  PurchaseRecord,
  QualityPreference,
  StoreChain,
} from '@/lib/types'

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

export type HouseholdData = {
  household: Household
  mainListId: string
  shoppingLists: string[]
  items: Item[]
  expenses: Expense[]
  notifications: Notification[]
  purchaseHistory: PurchaseRecord[]
}

/** Loads the (single, demo) household with every domain area the app needs on first render. */
export async function getHouseholdData(): Promise<HouseholdData> {
  const db = getDb()

  const household = await db.query.households.findFirst()
  if (!household) throw new Error('No household found — run `npx dotenv -e .env.local -- npx tsx lib/db/seed.ts` first.')

  const [members, children, preferencesRow, lists, expenseRows, notificationRows, purchaseRows] = await Promise.all([
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
  ])

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
        store: (purchase.storeLocation?.store.chain ?? 'Lidl') as StoreChain,
        total: Number(purchase.total),
        discount: purchase.discount != null ? Number(purchase.discount) : undefined,
        items: purchase.items.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, price: Number(item.price) })),
      }),
    ),
  }
}
