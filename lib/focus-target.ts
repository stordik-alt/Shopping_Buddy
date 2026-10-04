import type { MealType } from '@/lib/meal-plans'

/** The concrete thing a tap on the home screen should open, beyond just a tab: a meal of the plan,
 *  a waiting receipt, a pantry place or a shopping-list item. UI navigation state only — kept in
 *  the shell and consumed once by the screen it points to; no routing, no server involvement. */
export type FocusTarget =
  | { kind: 'meal'; day: string; mealType: MealType }
  | { kind: 'receipt'; id: string }
  | { kind: 'pantry-place'; placeKey: string }
  | { kind: 'list-item'; name: string }
