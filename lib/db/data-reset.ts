import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { DataResetGroup } from '@/lib/data-reset'
import { deleteReceiptFile } from '@/lib/storage'

// The database side of "Smazání dat" (docs/39_DATA_RESET.md). Authorization and the confirmation are the
// caller's job (app/actions/data-reset.ts resolves the household from the session). Only user data goes;
// the household, its members, children, preferences, stores and settings are never touched.

/** Deletes the chosen groups of the household's data. Everything runs in one batch, so a failure leaves
 *  the data as it was (Neon HTTP has no interactive transactions, but applies a batch atomically). The
 *  receipt photos in R2 have no foreign key, so they are deleted afterwards; a photo that cannot be
 *  deleted is logged and counted rather than undoing what the owner asked for. */
export async function resetHouseholdData(householdId: string, groups: readonly DataResetGroup[]): Promise<{ photosFailed: number }> {
  const db = getDb()
  const has = (group: DataResetGroup) => groups.includes(group)

  // Photo references are read before the rows go.
  const photos = has('purchases')
    ? await db.select({ imageUrl: schema.receiptImports.imageUrl }).from(schema.receiptImports).where(eq(schema.receiptImports.householdId, householdId))
    : []

  const statements = []
  if (has('purchases')) {
    // Purchase items and splits cascade; so do the expenses created from the purchases. Receipts only
    // point at a purchase with "set null", so they are deleted explicitly.
    statements.push(db.delete(schema.purchases).where(eq(schema.purchases.householdId, householdId)))
    statements.push(db.delete(schema.receiptImports).where(eq(schema.receiptImports.householdId, householdId)))
  }
  if (has('expenses')) statements.push(db.delete(schema.expenses).where(eq(schema.expenses.householdId, householdId)))
  if (has('incomes')) statements.push(db.delete(schema.incomes).where(eq(schema.incomes.householdId, householdId)))
  if (has('budget')) {
    statements.push(
      db.delete(schema.budgets).where(eq(schema.budgets.householdId, householdId)),
      db.delete(schema.expenseCategoryBudgets).where(eq(schema.expenseCategoryBudgets.householdId, householdId)),
      db.delete(schema.plannedExpenses).where(eq(schema.plannedExpenses.householdId, householdId)),
      db.delete(schema.plannedCarries).where(eq(schema.plannedCarries.householdId, householdId)),
      // Pocket transfers cascade from both pockets and period closings.
      db.delete(schema.pockets).where(eq(schema.pockets.householdId, householdId)),
      db.delete(schema.periodClosings).where(eq(schema.periodClosings.householdId, householdId)),
      db.delete(schema.recurringPayments).where(eq(schema.recurringPayments.householdId, householdId)),
      // The limit and savings goal are part of the budget plan; the period settings stay (profile settings).
      db.update(schema.households).set({ monthlyBudget: '0', savingsGoal: '0' }).where(eq(schema.households.id, householdId)),
    )
  }
  if (has('pantry')) {
    statements.push(
      db.delete(schema.pantryItems).where(eq(schema.pantryItems.householdId, householdId)),
      db.delete(schema.restockDismissals).where(eq(schema.restockDismissals.householdId, householdId)),
    )
  }
  if (has('recipes')) {
    statements.push(
      db.delete(schema.recipeFavorites).where(eq(schema.recipeFavorites.householdId, householdId)),
      db.delete(schema.recipeHistory).where(eq(schema.recipeHistory.householdId, householdId)),
      db.delete(schema.mealPlans).where(eq(schema.mealPlans.householdId, householdId)),
    )
  }
  if (has('notifications')) statements.push(db.delete(schema.notifications).where(eq(schema.notifications.householdId, householdId)))
  if (has('shopping')) {
    // The app expects a list to exist, so the oldest one stays, emptied; the others go with their items.
    const keepId = sql`(select id from ${schema.shoppingLists} where household_id = ${householdId} order by created_at, id limit 1)`
    statements.push(
      db.delete(schema.shoppingListItems).where(sql`${schema.shoppingListItems.listId} in (select id from ${schema.shoppingLists} where household_id = ${householdId})`),
      db.delete(schema.shoppingLists).where(sql`${schema.shoppingLists.householdId} = ${householdId} and ${schema.shoppingLists.id} <> ${keepId}`),
    )
  }
  if (statements.length > 0) await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]])
  // A household that somehow had no list at all gets the default one back (a no-op otherwise).
  if (has('shopping')) {
    await db.execute(sql`insert into shopping_lists (household_id, name) select ${householdId}::uuid, 'Hlavní seznam' where not exists (select 1 from shopping_lists where household_id = ${householdId})`)
  }

  let photosFailed = 0
  for (const { imageUrl } of photos) {
    if (!imageUrl) continue
    try {
      await deleteReceiptFile(imageUrl)
    } catch (error) {
      photosFailed += 1
      console.error('data_reset_photo_failed', error instanceof Error ? error.name : 'unknown')
    }
  }
  return { photosFailed }
}
