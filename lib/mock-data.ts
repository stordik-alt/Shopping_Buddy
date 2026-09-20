import type { Expense, Household, Item, Notification, Store } from '@/lib/types'

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

export const stores: Store[] = [
  {
    id: 'lidl-budejovicka',
    chain: 'Lidl',
    name: 'Lidl Budějovická',
    address: 'Budějovická 1, 140 00 Praha 4',
    city: 'Praha',
    country: 'Česká republika',
    gps: { lat: 50.0522, lng: 14.4491 },
    hours: 'Otevřeno do 21:00',
    dealsCount: 2,
    availableProducts: ['Mléko polotučné', 'Toaletní papír', 'Banány'],
    color: 'bg-[#d7f36b]',
  },
  {
    id: 'albert-krc',
    chain: 'Albert',
    name: 'Albert Krč',
    address: 'Sezimova 15, 140 00 Praha 4',
    city: 'Praha',
    country: 'Česká republika',
    gps: { lat: 50.0361, lng: 14.4381 },
    hours: 'Otevřeno do 22:00',
    dealsCount: 1,
    availableProducts: ['Kuřecí prsa', 'Banány', 'Vejce'],
    color: 'bg-[#f4b183]',
  },
  {
    id: 'kaufland-chodov',
    chain: 'Kaufland',
    name: 'Kaufland Chodov',
    address: 'Roztylská 19, 140 00 Praha 4',
    city: 'Praha',
    country: 'Česká republika',
    gps: { lat: 50.0219, lng: 14.4909 },
    hours: 'Otevřeno do 21:00',
    dealsCount: 8,
    availableProducts: ['Toaletní papír', 'Rýže', 'Kuřecí prsa'],
    color: 'bg-[#b9d8f5]',
  },
  {
    id: 'billa-nusle',
    chain: 'Billa',
    name: 'Billa Nusle',
    address: 'Táborská 42, 140 00 Praha 4',
    city: 'Praha',
    country: 'Česká republika',
    gps: { lat: 50.0645, lng: 14.4472 },
    hours: 'Otevřeno do 21:00',
    dealsCount: 4,
    availableProducts: ['Máslo', 'Vejce', 'Mléko polotučné'],
    color: 'bg-[#f3c0d3]',
  },
  {
    id: 'penny-michle',
    chain: 'Penny',
    name: 'Penny Michle',
    address: 'Michelská 76, 140 00 Praha 4',
    city: 'Praha',
    country: 'Česká republika',
    gps: { lat: 50.0525, lng: 14.4633 },
    hours: 'Otevřeno do 20:00',
    dealsCount: 3,
    availableProducts: ['Těstoviny', 'Rajčata', 'Toaletní papír'],
    color: 'bg-[#f6d38b]',
  },
  {
    id: 'jip-branik',
    chain: 'JIP',
    name: 'JIP Braník',
    address: 'Branická 48, 140 00 Praha 4',
    city: 'Praha',
    country: 'Česká republika',
    gps: { lat: 50.0234, lng: 14.4136 },
    hours: 'Otevřeno do 19:00',
    dealsCount: 4,
    availableProducts: ['Mléko polotučné', 'Pečivo'],
    color: 'bg-[#c9b8ef]',
  },
]
