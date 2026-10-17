import { ITEM_UNITS } from '@/lib/units'

// What the shopping-list actions accept from the browser (CLAUDE.md section 9: the server decides). Free
// text gets a length limit — Server Actions take bodies up to 15 MB, so without one a single item could
// carry megabytes — and the enum-like fields are checked here, with a clear message, instead of failing
// as a database error. Kept free of database imports so it is testable on its own; a test ties the lists
// to the database enums.

export const ITEM_NAME_MAX = 300
export const ITEM_DETAIL_MAX = 500
export const ITEM_NOTE_MAX = 1000
export const LIST_NAME_MAX = 100

export const ITEM_CATEGORY_VALUES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const
export const ITEM_PRIORITY_VALUES = ['Nízká', 'Normální', 'Vysoká'] as const

export class ShoppingInputError extends Error {}

/** A required text of at most `max` characters; returns the value untouched (only checked). */
export function checkRequiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new ShoppingInputError(`${label} je povinný údaj.`)
  if (value.length > max) throw new ShoppingInputError(`${label} je příliš dlouhý (nejvýše ${max} znaků).`)
  return value
}

/** An optional text: empty, null and undefined pass; anything else must be a string within the limit. */
export function checkOptionalText(value: unknown, label: string, max: number): void {
  if (value === undefined || value === null || value === '') return
  if (typeof value !== 'string') throw new ShoppingInputError(`${label} musí být text.`)
  if (value.length > max) throw new ShoppingInputError(`${label} je příliš dlouhý (nejvýše ${max} znaků).`)
}

/** Unit, category, priority and the on-sale flag, when present; a value the database would refuse is
 *  refused here first. */
export function checkItemChoices(changes: { unit?: unknown; category?: unknown; priority?: unknown; onSale?: unknown }): void {
  if (changes.unit != null && !(ITEM_UNITS as readonly unknown[]).includes(changes.unit)) throw new ShoppingInputError('Neplatná jednotka.')
  if (changes.category != null && !(ITEM_CATEGORY_VALUES as readonly unknown[]).includes(changes.category)) throw new ShoppingInputError('Neplatná kategorie.')
  if (changes.priority != null && !(ITEM_PRIORITY_VALUES as readonly unknown[]).includes(changes.priority)) throw new ShoppingInputError('Neplatná priorita.')
  if (changes.onSale != null && typeof changes.onSale !== 'boolean') throw new ShoppingInputError('Neplatná hodnota akce.')
}
