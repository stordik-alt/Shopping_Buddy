'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { addExpenseAction, deleteExpenseAction, setCategoryBudgetAction, updateExpenseAction } from '@/app/actions/budget'
import { confirmRecurringPaymentAction, saveRecurringPaymentAction, skipRecurringPaymentAction, stopRecurringPaymentAction } from '@/app/actions/recurring'
import type { HouseholdData } from '@/lib/db/queries'
import type { ExpenseCategory } from '@/lib/expense-categories'
import type { ExpenseInput } from '@/lib/expense-input'
import type { RecurringPayment, RecurringPaymentInput } from '@/lib/recurring-payments'
import type { Expense } from '@/lib/types'

// Kept in date order, as the server loads them, so the monthly numbers read the same after a save.
const byDate = (list: Expense[]) => list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

/** Expenses, category limits and recurring payments, with the dialogs that edit them. */
export function useBudget({
  initialData,
  setNotifications,
  onExpenseDatesChanged,
}: {
  initialData: HouseholdData
  setNotifications: Dispatch<SetStateAction<HouseholdData['notifications']>>
  /** The dates an add, correction or removal touched — a past period shown from its own copy
   *  (use-budget-periods.ts) is loaded again. */
  onExpenseDatesChanged?: (dates: string[]) => void
}) {
  const [expenses, setExpenses] = useState(initialData.expenses)
  const [expenseOpen, setExpenseOpen] = useState(false)
  // The expense being corrected in the modal; null while adding a new one.
  const [editedExpense, setEditedExpense] = useState<Expense | null>(null)
  const [categoryBudgets, setCategoryBudgets] = useState(initialData.categoryBudgets)
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [recurringPayments, setRecurringPayments] = useState(initialData.recurringPayments)
  const [recurringOccurrences, setRecurringOccurrences] = useState(initialData.recurringOccurrences)
  // The recurring payment being changed in its modal; 'new' while adding one, null while closed.
  const [recurringEdit, setRecurringEdit] = useState<RecurringPayment | 'new' | null>(null)

  useEffect(() => {
    setExpenses(initialData.expenses)
    setCategoryBudgets(initialData.categoryBudgets)
    setRecurringPayments(initialData.recurringPayments)
    setRecurringOccurrences(initialData.recurringOccurrences)
  }, [initialData])

  function openExpense(expense: Expense | null) {
    setEditedExpense(expense)
    setExpenseOpen(true)
  }

  function closeExpense() {
    setExpenseOpen(false)
    setEditedExpense(null)
  }

  async function saveExpense(input: ExpenseInput) {
    if (editedExpense) {
      const { expense } = await updateExpenseAction(editedExpense.id, input)
      setExpenses((current) => byDate(current.map((entry) => (entry.id === expense.id ? expense : entry))))
      onExpenseDatesChanged?.([editedExpense.date, expense.date])
    } else {
      const { expense, notifications: created } = await addExpenseAction(input)
      setExpenses((current) => byDate([...current, expense]))
      if (created.length > 0) setNotifications((current) => [...current, ...created])
      onExpenseDatesChanged?.([expense.date])
    }
    closeExpense()
  }

  async function deleteExpense() {
    if (!editedExpense) return
    await deleteExpenseAction(editedExpense.id)
    setExpenses((current) => current.filter((entry) => entry.id !== editedExpense.id))
    onExpenseDatesChanged?.([editedExpense.date])
    closeExpense()
  }

  /** Saves the changed limits one by one; the last answer holds every limit of the household. */
  async function saveLimits(changes: { category: ExpenseCategory; amount: number | null }[]) {
    let latest = categoryBudgets
    for (const change of changes) latest = await setCategoryBudgetAction(change.category, change.amount)
    setCategoryBudgets(latest)
    setLimitsOpen(false)
  }

  async function saveRecurring(input: RecurringPaymentInput) {
    const editing = recurringEdit !== 'new' && recurringEdit ? recurringEdit : null
    const saved = await saveRecurringPaymentAction(input, editing?.id)
    setRecurringPayments((current) =>
      (editing ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [...current, saved]).sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    )
    setRecurringEdit(null)
  }

  async function stopRecurring() {
    if (!recurringEdit || recurringEdit === 'new') return
    await stopRecurringPaymentAction(recurringEdit.id)
    const stopped = recurringEdit.id
    setRecurringPayments((current) => current.filter((entry) => entry.id !== stopped))
    setRecurringEdit(null)
  }

  /** A due date paid: it becomes an expense, and may cross a budget threshold. */
  async function confirmRecurring(paymentId: string, dueDate: string, paid: { amount: number; date: string }) {
    const { expense, occurrence, notifications: created } = await confirmRecurringPaymentAction(paymentId, dueDate, paid)
    setRecurringOccurrences((current) => [...current, occurrence])
    setExpenses((current) => byDate([...current, expense]))
    if (created.length > 0) setNotifications((current) => [...current, ...created])
  }

  async function skipRecurring(paymentId: string, dueDate: string) {
    const occurrence = await skipRecurringPaymentAction(paymentId, dueDate)
    setRecurringOccurrences((current) => [...current, occurrence])
  }

  return {
    expenses,
    setExpenses,
    expenseOpen,
    editedExpense,
    categoryBudgets,
    limitsOpen,
    setLimitsOpen,
    recurringPayments,
    recurringOccurrences,
    recurringEdit,
    setRecurringEdit,
    openExpense,
    closeExpense,
    saveExpense,
    deleteExpense,
    saveLimits,
    saveRecurring,
    stopRecurring,
    confirmRecurring,
    skipRecurring,
  }
}
