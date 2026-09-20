export type Tab = 'Domů' | 'Nákup' | 'Obchody' | 'Rozpočet' | 'AI' | 'Profil'

export type Item = {
  id: number
  name: string
  detail: string
  price: number
  quantity: number
  done: boolean
  color: string
  priority?: 'Nízká' | 'Normální' | 'Vysoká'
  note?: string
  store?: string
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
