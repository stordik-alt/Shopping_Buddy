'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { getMemberIdForUser } from '@/lib/db/member-store-preferences'
import { buildShoppingPlan, PlanInputError, pinProduct, unpinProduct, type PlanResult } from '@/lib/db/shopping-plan'

// No revalidatePath in this file: each of these saves is already shown by components/app-shell.tsx from its
// own state or from the data the action returns. Re-rendering the whole page after every save re-ran
// every household query and re-sent the result (Neon network transfer) and, at worst, reset the view.

/** Runs a domain call and turns its input errors into ordinary user-facing errors. */
async function withInputErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof PlanInputError) throw new Error(error.message)
    throw error
  }
}

/** Where to buy what for the household's open shopping items, using at most `maxStores` stores and preferring
 *  `priorityChainIds` while the price difference is small. The stores allowed are the signed-in user's
 *  own "stores in my area" (their profile), or every store when they have chosen none; the household
 *  and the member come from the session, never from the request. */
export async function buildShoppingPlanAction(input: { maxStores: number; priorityChainIds: string[] }): Promise<PlanResult> {
  const { userId, householdId } = await requireHousehold()
  if (!Array.isArray(input.priorityChainIds) || input.priorityChainIds.length > 50) throw new Error('Neplatný požadavek na plán.')
  const memberId = await getMemberIdForUser(userId)
  return withInputErrors(() => buildShoppingPlan(householdId, memberId, input))
}

/** Pins a specific product to a list item at one chain, so the planner buys exactly that there. */
export async function pinProductAction(input: { itemId: string; storeId: string; productId: string }): Promise<void> {
  const { householdId } = await requireHousehold()
  await withInputErrors(() => pinProduct(householdId, input.itemId, input.storeId, input.productId))
}

/** Removes the pinned product of a list item at one chain; the planner then chooses automatically. */
export async function unpinProductAction(input: { itemId: string; storeId: string }): Promise<void> {
  const { householdId } = await requireHousehold()
  await withInputErrors(() => unpinProduct(householdId, input.itemId, input.storeId))
}
