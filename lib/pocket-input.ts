import { isIsoDate } from '@/lib/income-input'

// What the server accepts as a Kapsa and as a transfer to or from one (CLAUDE.md sections 9 and 33:
// never trust the form). Pure, so the rules are tested without a database; app/actions/pockets.ts
// applies them. Mirrors lib/income-input.ts.

/** The icons a Kapsa can have; the UI maps each key to a drawing. A closed list, so a stored value is
 *  always one the UI knows. */
export const POCKET_ICONS = ['piggy-bank', 'shield', 'car', 'home', 'plane', 'gift', 'graduation', 'heart'] as const
export type PocketIcon = (typeof POCKET_ICONS)[number]
export const isPocketIcon = (value: string): value is PocketIcon => (POCKET_ICONS as readonly string[]).includes(value)

export type PocketInput = {
  name: string
  icon: string
  targetAmount: number | null
  targetDate: string | null
  openingAmount: number
  plannedContribution: number | null
  /** Marks the financial reserve (docs/15 §11); at most one per household, enforced by the server. */
  isReserve?: boolean
}
export type ValidPocket = Omit<PocketInput, 'icon' | 'isReserve'> & { icon: PocketIcon; isReserve: boolean }

/** The largest amount numeric(10, 2) holds. */
const MAX_AMOUNT = 99_999_999.99
const MAX_NAME_LENGTH = 60

const round2 = (value: number) => Math.round(value * 100) / 100
const validAmount = (value: number, min: number) => Number.isFinite(value) && value >= min && value <= MAX_AMOUNT

/** The Kapsa as it will be stored, or why it cannot be. Amounts are rounded to haléře. */
export function validatePocketInput(input: PocketInput): { pocket: ValidPocket } | { error: string } {
  const name = input.name.trim()
  if (!name) return { error: 'Zadejte název Kapsy.' }
  if (name.length > MAX_NAME_LENGTH) return { error: `Název může mít nejvýše ${MAX_NAME_LENGTH} znaků.` }
  if (!isPocketIcon(input.icon)) return { error: 'Neznámá ikona.' }
  if (input.targetAmount !== null && (!validAmount(input.targetAmount, 0) || input.targetAmount === 0)) return { error: 'Cílová částka musí být větší než 0.' }
  if (input.targetDate !== null && !isIsoDate(input.targetDate)) return { error: 'Neplatný termín.' }
  // A deadline without an amount (or the reverse) cannot be planned against.
  if ((input.targetAmount === null) !== (input.targetDate === null)) return { error: 'Cíl potřebuje částku i termín, nebo ani jedno.' }
  if (!validAmount(input.openingAmount, 0)) return { error: 'Počáteční částka nemůže být záporná.' }
  if (input.plannedContribution !== null && !validAmount(input.plannedContribution, 0)) return { error: 'Plánovaný příspěvek nemůže být záporný.' }
  return {
    pocket: {
      name,
      icon: input.icon,
      targetAmount: input.targetAmount === null ? null : round2(input.targetAmount),
      targetDate: input.targetDate,
      openingAmount: round2(input.openingAmount),
      plannedContribution: input.plannedContribution === null ? null : round2(input.plannedContribution),
      isReserve: input.isReserve === true,
    },
  }
}

/** An amount of a transfer between the budget and a Kapsa, rounded to haléře, or why it is invalid. */
export function validateTransferAmount(amount: number): { amount: number } | { error: string } {
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return { error: 'Zadejte částku větší než 0.' }
  const rounded = round2(amount)
  if (rounded <= 0) return { error: 'Zadejte částku větší než 0.' }
  return { amount: rounded }
}
