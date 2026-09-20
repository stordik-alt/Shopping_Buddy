import type { Expense, Item, Notification } from '@/lib/types'

export const initialItems: Item[] = [
  { id: 1, name: 'Mléko polotučné', detail: '2 l · Mlékárna Kunín', price: 44.9, quantity: 2, done: false, color: 'bg-sky-100 text-sky-700' },
  { id: 2, name: 'Banány', detail: '1 kg · volné', price: 34.9, quantity: 1, done: false, color: 'bg-amber-100 text-amber-700' },
  { id: 3, name: 'Kuřecí prsa', detail: '500 g · chlazené', price: 89.9, quantity: 1, done: true, color: 'bg-rose-100 text-rose-700' },
  { id: 4, name: 'Toaletní papír', detail: '8 ks · Softy', price: 79.9, quantity: 1, done: false, color: 'bg-violet-100 text-violet-700' },
]

export const initialNotifications: Notification[] = [
  { id: 1, title: 'Nová akce v Lidlu', detail: 'Mléko je dnes o 20 % levnější.', unread: true },
  { id: 2, title: 'Rozpočet je pod kontrolou', detail: 'Zbývá vám 4 650 Kč do konce měsíce.', unread: true },
  { id: 3, title: 'Petr doplnil seznam', detail: 'Přidal položku „Ovesné vločky".', unread: false },
]

export const initialExpenses: Expense[] = [{ id: 1, amount: 7350, note: 'Výdaje domácnosti' }]

export const initialShoppingLists = ['Týdenní nákup', 'Lidl', 'Drogerie', 'Děti']
