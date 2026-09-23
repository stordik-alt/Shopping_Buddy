export type Tab = 'Domů' | 'Nákup' | 'Zásoby' | 'Obchody' | 'Rozpočet' | 'AI' | 'Profil'

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
  category: ItemCategory
  date: string
}

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
  chain: string
  name: string
  address: string
  city: string
  country: string
  gps: { lat: number; lng: number } | null
  hours: string | null
  dealsCount: number
  availableProducts: string[]
  color: string
}

export type PurchaseItem = { name: string; quantity: number; unit: ItemUnit; price: number }

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
}

/** Where a pantry item is physically kept. Drives what "restock a purchase" defaults to
 *  (`lib/pantry.ts`'s `inferPantryLocation()`) and can be reassigned by hand — e.g. moving
 *  freshly bought chilled meat into the freezer for later use. */
export type PantryLocation = 'Spíž' | 'Lednice' | 'Mrazák' | 'Domácnost'

export type PantryItem = {
  id: string
  name: string
  category: ItemCategory
  location: PantryLocation
  quantity: number
  unit: ItemUnit
  addedAt: string
  askedAt?: string
}

export type Household = {
  id: string
  name: string
  monthlyBudget: number
  members: HouseholdMember[]
  children: Child[]
  preferences: HouseholdPreferences
  restrictions: string[]
}
