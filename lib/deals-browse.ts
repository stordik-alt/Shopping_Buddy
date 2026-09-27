import type { ItemCategory } from '@/lib/types'

// The Akce tab browses today's promotions by category and page, instead of the home screen loading
// every promoted product at once (docs/07_CHANGELOG.md, 2026-09-26 — that was most of the database's
// compute). Categories reuse the app's one existing product-category taxonomy (CLAUDE.md section 13:
// "avoid hardcoding category logic in multiple UI components") — there is no separate "deal category".

/** How many deal cards a page shows: enough to feel worth a page, few enough that only that many
 *  products' full price detail is ever loaded for one page (lib/db/deals.ts). */
export const DEALS_PAGE_SIZE = 6

export const DEAL_CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']

/** A chosen category, or every category. */
export type DealCategoryFilter = ItemCategory | 'all'

/** Whether `value` is a valid category filter — used to validate a Server Action's input, which
 *  otherwise trusts whatever a client sends (CLAUDE.md section 9). */
export function isDealCategoryFilter(value: unknown): value is DealCategoryFilter {
  return value === 'all' || (typeof value === 'string' && (DEAL_CATEGORIES as string[]).includes(value))
}
