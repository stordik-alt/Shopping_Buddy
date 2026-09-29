import type { ExpenseCategory } from '@/lib/expense-categories'

export type Tab = 'Domů' | 'Akce' | 'Nákup' | 'Zásoby' | 'Obchody' | 'Rozpočet' | 'AI' | 'Profil'

export type ItemCategory = 'Potraviny' | 'Drogerie' | 'Děti' | 'Domácnost' | 'Ostatní'
export type ItemUnit = 'ks' | 'kg' | 'g' | 'l' | 'ml'
export type ItemPriority = 'Nízká' | 'Normální' | 'Vysoká'

export type Item = {
  id: string
  name: string
  detail: string
  price: number
  quantity: number
  unit: ItemUnit
  category: ItemCategory
  done: boolean
  color: string
  priority: ItemPriority
  note?: string
  store?: string
  onSale?: boolean
}

export type Notification = {
  id: string
  title: string
  detail: string
  unread: boolean
}

export type Expense = {
  id: string
  amount: number
  note: string
  category: ExpenseCategory
  /** One of the category's subcategories (lib/expense-categories.ts), or null. */
  subcategory: string | null
  date: string
  /** The receipt purchase this expense counts (lib/purchase-expenses.ts); null for one typed in. */
  purchaseId: string | null
}

/** A household's monthly limit per expense category; a category without one has no limit. */
export type CategoryBudgets = Partial<Record<ExpenseCategory, number>>

export type HouseholdMember = {
  id: string
  name: string
  role: 'Správce domácnosti' | 'Člen domácnosti'
  age: number
  preferences: string
  favoriteFoods: string[]
  dislikedFoods: string[]
  allergies: string[]
}

export type Child = {
  id: string
  name: string
  age: number
  preferences: string
  specialNeeds?: string
}

export type PriceSensitivity = 'Nejlevnější' | 'Vyvážené' | 'Kvalita především'
export type QualityPreference = 'Standardní' | 'Prémiová'

export type HouseholdPreferences = {
  preferredBrands: string[]
  preferredStores: string[]
  preferredProducts: string[]
  excludedProducts: string[]
  priceSensitivity: PriceSensitivity
  qualityPreference: QualityPreference
  preferCzechProducts: boolean
}

export type StoreChain = string

export type Store = {
  id: string
  /** The chain's `stores.id`. Present for stores read from the database; the fixtures have none. */
  storeId?: string
  chain: string
  name: string
  address: string
  city: string
  country: string
  gps: { lat: number; lng: number } | null
  hours: string | null
  /** Promotions running today at the branch's whole chain — retailers publish them chain-wide, and
   *  whether each branch honours them is not known, so the UI says "v řetězci". */
  dealsCount: number
  color: string
}

export type PurchaseItem = {
  // Optional: mock/seed fixtures build a PurchaseItem without a real database row behind it. Real
  // purchases (lib/db/queries.ts, app/actions/receipts.ts, app/actions/purchases.ts) always set it —
  // required to reassign the item's expense category (components/budget/purchase-history.tsx).
  id?: string
  name: string
  quantity: number
  unit: ItemUnit
  price: number
  // Undefined/null for a purchase made before these columns existed — its expense split cannot be
  // recomputed (nothing to recompute it from), so such an item offers no "reassign category" control.
  category?: ItemCategory | null
  /** The household's own split of this line's amount across expense targets, overriding the
   *  automatic mapping (lib/purchase-expenses.ts) — empty/undefined means "use the automatic
   *  mapping"; one entry a plain reassignment (e.g. a gift bought during a grocery trip); more than
   *  one a genuine split (e.g. clothing that was actually half adult, half a child's). */
  expenseSplits?: { category: ExpenseCategory; subcategory: string | null; amount: number }[]
}

export type PurchaseRecord = {
  id: string
  storeId?: string
  date: string
  // Optional, matching purchases.storeLocationId's real nullability — not every purchase has a
  // known store (e.g. items with no preferred store set when the purchase was completed).
  store?: string
  items: PurchaseItem[]
  total: number
  discount?: number
  /** A receipt-derived purchase with no expenses yet (imported before receipts started counting
   *  towards the budget, or otherwise missed) — offers "Zapsat do rozpočtu" (owner request,
   *  2026-09-27). Undefined/false everywhere else, including a purchase completePurchaseAction made
   *  from a shopping list, which never counts towards the budget at all. */
  needsBudgetRecording?: boolean
}

/** Where a pantry item is physically kept. Drives what "restock a purchase" defaults to
 *  (`lib/pantry.ts`'s `inferPantryLocation()`) and can be reassigned by hand — e.g. moving
 *  freshly bought chilled meat into the freezer for later use. */
export type PantryLocation = 'Spíž' | 'Lednice' | 'Mrazák' | 'Domácnost' | 'Lékárnička' | 'Drogérka'

/** The broader zone a household-created pantry place (below) belongs to — wider than `ItemCategory`
 *  on purpose, since a household stores things at home that are not a product category at all (a
 *  car, a garage). See lib/db/schema.ts's `pantryAreaEnum` comment for why this is a separate system
 *  from `ItemCategory` rather than reusing it. */
export type PantryArea = 'Potraviny' | 'Drogerie' | 'Domácnost' | 'Děti' | 'Auto' | 'Bydlení' | 'Zvířata' | 'Ostatní'

/** A place a household added itself, beyond the fixed `PantryLocation` list (spec: "Uživatel musí
 *  mít možnost vytvořit vlastní místo"), e.g. "Kufr auta" under the Auto area. */
export type PantryPlace = {
  id: string
  area: PantryArea
  name: string
}

export type PantryItem = {
  id: string
  name: string
  category: ItemCategory
  /** The item's subcategory within `category` (lib/product-subcategories.ts) — null when the
   *  categorization pipeline never placed it confidently. Powers the Zásoby location + subcategory
   *  filtering (components/shopping/pantry.tsx). */
  subcategory?: string | null
  location: PantryLocation
  /** A household's own place (`PantryPlace` above) that overrides `location` for display/grouping
   *  when set; null/undefined means the item lives at its fixed `location` as before this existed. */
  customPlaceId?: string | null
  quantity: number
  unit: ItemUnit
  addedAt: string
  askedAt?: string
  /** How closely it is watched (lib/pantry.ts PANTRY_TRACKING); absent in old fixtures = 'normal'. */
  tracking?: PantryTracking
}

export type PantryTracking = 'normal' | 'rare' | 'off'

export type Household = {
  id: string
  name: string
  monthlyBudget: number
  members: HouseholdMember[]
  children: Child[]
  preferences: HouseholdPreferences
  restrictions: string[]
}
