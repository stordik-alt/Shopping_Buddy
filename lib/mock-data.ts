import type { Expense, Household, Item, Notification } from '@/lib/types'

export const initialItems: Item[] = [
  { id: 1, name: 'Mléko polotučné', detail: '2 l · Mlékárna Kunín', price: 44.9, quantity: 2, unit: 'l', category: 'Potraviny', done: false, color: 'bg-sky-100 text-sky-700', priority: 'Normální', store: 'Lidl', onSale: true },
  { id: 2, name: 'Banány', detail: '1 kg · volné', price: 34.9, quantity: 1, unit: 'kg', category: 'Potraviny', done: false, color: 'bg-amber-100 text-amber-700', priority: 'Normální' },
  { id: 3, name: 'Kuřecí prsa', detail: '500 g · chlazené', price: 89.9, quantity: 1, unit: 'g', category: 'Potraviny', done: true, color: 'bg-rose-100 text-rose-700', priority: 'Vysoká', store: 'Albert', onSale: true },
  { id: 4, name: 'Toaletní papír', detail: '8 ks · Softy', price: 79.9, quantity: 1, unit: 'ks', category: 'Drogerie', done: false, color: 'bg-violet-100 text-violet-700', priority: 'Nízká' },
]

export const initialNotifications: Notification[] = [
  { id: 1, title: 'Nová akce v Lidlu', detail: 'Mléko je dnes o 20 % levnější.', unread: true },
  { id: 2, title: 'Rozpočet je pod kontrolou', detail: 'Zbývá vám 4 650 Kč do konce měsíce.', unread: true },
  { id: 3, title: 'Petr doplnil seznam', detail: 'Přidal položku „Ovesné vločky".', unread: false },
]

export const initialExpenses: Expense[] = [{ id: 1, amount: 7350, note: 'Výdaje domácnosti' }]

export const initialShoppingLists = ['Týdenní nákup', 'Lidl', 'Drogerie', 'Děti']

export const initialHousehold: Household = {
  name: 'Rodina Králových',
  monthlyBudget: 12000,
  members: [
    {
      id: 1,
      name: 'Lucie Králová',
      role: 'Správce domácnosti',
      age: 34,
      preferences: 'Bez omezení',
      favoriteFoods: ['Kuřecí maso', 'Zelenina'],
      dislikedFoods: ['Ryby'],
      allergies: [],
    },
    {
      id: 2,
      name: 'Petr Král',
      role: 'Člen domácnosti',
      age: 36,
      preferences: 'Bez omezení',
      favoriteFoods: ['Těstoviny'],
      dislikedFoods: [],
      allergies: ['Ořechy'],
    },
  ],
  children: [
    { id: 1, name: 'Anna', age: 7, preferences: 'Sladké snídaně', specialNeeds: '' },
    { id: 2, name: 'Tomáš', age: 4, preferences: 'Bez kousků zeleniny', specialNeeds: 'Alergie na lepek' },
  ],
  preferences: {
    preferredBrands: ['Milka', 'Kunín'],
    preferredStores: ['Lidl', 'Albert'],
    preferredProducts: ['Ovesné vločky', 'Řecký jogurt'],
    excludedProducts: ['Energetické nápoje'],
    priceSensitivity: 'Vyvážené',
    qualityPreference: 'Standardní',
    preferCzechProducts: true,
  },
  restrictions: ['Bez laktózy pro Tomáše'],
}
