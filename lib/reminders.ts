// Domain logic for Phase D "shopping reminders" (docs/04_ROADMAP.md). Kept separate from the
// cron route (app/api/cron/shopping-reminders) so the staleness rule is deterministic and
// testable on its own, per docs/02_ARCHITECTURE.md ("business calculations in reusable
// TypeScript modules, not duplicated in route handlers").

/** An item sits on the list this many days before it's considered worth reminding about. */
export const STALE_AFTER_DAYS = 3

export type ReminderCandidate = {
  id: string
  name: string
  done: boolean
  createdAt: Date
  remindedAt: Date | null
}

/** Items that have sat undone and un-reminded on a list for at least `STALE_AFTER_DAYS`,
 *  relative to `now`. Already-done items and items already reminded about are excluded —
 *  each item generates at most one reminder in its lifetime. */
export function findStaleItems<T extends ReminderCandidate>(items: T[], now: Date, staleAfterDays = STALE_AFTER_DAYS): T[] {
  const cutoff = now.getTime() - staleAfterDays * 86_400_000
  return items.filter((item) => !item.done && item.remindedAt === null && item.createdAt.getTime() <= cutoff)
}
