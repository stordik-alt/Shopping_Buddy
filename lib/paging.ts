// Generic, deterministic pagination maths shared by every "N per page, ‹ page/total ›" screen (the
// store directory's branches, the Akce tab's deals). Kept in one place per CLAUDE.md section 6 ("do
// not duplicate business logic in multiple places").

/** Number of pages for `total` items; at least 1, so an empty result still reads "1/1". */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** A requested page forced into 1..pageCount(total) — for a stale page number after the result
 *  shrank (a filter narrowed, or an item disappeared under the user). */
export function clampPage(page: number, total: number, pageSize: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), pageCount(total, pageSize))
}
