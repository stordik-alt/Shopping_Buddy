export type Tab = 'Domů' | 'Nákup' | 'Obchody' | 'Rozpočet' | 'AI' | 'Profil'

export type ItemCategory = 'Potraviny' | 'Drogerie' | 'Děti' | 'Domácnost' | 'Ostatní'
export type ItemUnit = 'ks' | 'kg' | 'g' | 'l' | 'ml'
export type ItemPriority = 'Nízká' | 'Normální' | 'Vysoká'

export type Item = {
  id: number
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
  id: number
  title: string
  detail: string
  unread: boolean
}

export type Expense = {
  id: number
  amount: number
  note: string
}

export type HouseholdMember = {
  id: number
  name: string
  role: 'Správce domácnosti' | 'Člen domácnosti'
  age: number
  preferences: string
  favoriteFoods: string[]
  dislikedFoods: string[]
  allergies: string[]
}

export type Child = {
  id: number
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

export type Household = {
  name: string
  monthlyBudget: number
  members: HouseholdMember[]
  children: Child[]
  preferences: HouseholdPreferences
  restrictions: string[]
}
