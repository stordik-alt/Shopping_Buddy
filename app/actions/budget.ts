'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { Expense, ItemCategory } from '@/lib/types'

export async function addExpenseAction(householdId: string, expense: { amount: number; note: string; category: ItemCategory; date: string }): Promise<Expense> {
  const db = getDb()
  const [row] = await db
    .insert(schema.expenses)
    .values({ householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, date: expense.date })
    .returning()
  revalidatePath('/')
  return { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, date: row.date }
}
