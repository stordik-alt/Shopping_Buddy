import { eq } from 'drizzle-orm'
import { CALENDAR_PERIOD, type PeriodConfig } from '@/lib/budget-period'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

type Db = ReturnType<typeof getDb>
type PeriodColumns = Pick<
  typeof schema.households.$inferSelect,
  'budgetPeriodType' | 'budgetPeriodStartDay' | 'budgetPeriodAnchor' | 'budgetPeriodLengthDays'
>

/** The period config a household row describes. The database checks keep the columns consistent
 *  (a custom period always has its anchor and length), so an inconsistent row is a bug worth failing on. */
export function periodConfigOfHousehold(row: PeriodColumns): PeriodConfig {
  if (row.budgetPeriodType === 'calendar') return CALENDAR_PERIOD
  if (row.budgetPeriodType === 'payday') return { type: 'payday', startDay: row.budgetPeriodStartDay }
  if (row.budgetPeriodType === 'custom' && row.budgetPeriodAnchor && row.budgetPeriodLengthDays) {
    return { type: 'custom', anchor: row.budgetPeriodAnchor, lengthDays: row.budgetPeriodLengthDays }
  }
  throw new Error(`Neplatné nastavení rozpočtového období: ${row.budgetPeriodType}.`)
}

/** The `households` columns that store `config`, all of them, so switching kind never leaves a stale
 *  anchor or length behind (the database requires custom to have both and the others to have neither).
 *  A custom period does not use the start day, so that column is left as it is. */
export function periodColumnsOf(config: PeriodConfig): Partial<PeriodColumns> {
  if (config.type === 'calendar') return { budgetPeriodType: 'calendar', budgetPeriodStartDay: 1, budgetPeriodAnchor: null, budgetPeriodLengthDays: null }
  if (config.type === 'payday') return { budgetPeriodType: 'payday', budgetPeriodStartDay: config.startDay, budgetPeriodAnchor: null, budgetPeriodLengthDays: null }
  return { budgetPeriodType: 'custom', budgetPeriodAnchor: config.anchor, budgetPeriodLengthDays: config.lengthDays }
}

/** The household's budget period config — the one place the server reads it, so spending checks,
 *  notifications and period pages all slice time the same way (docs/15 §3). */
export async function loadPeriodConfig(db: Db, householdId: string): Promise<PeriodConfig> {
  const household = await db.query.households.findFirst({
    where: eq(schema.households.id, householdId),
    columns: { budgetPeriodType: true, budgetPeriodStartDay: true, budgetPeriodAnchor: true, budgetPeriodLengthDays: true },
  })
  if (!household) throw new Error('Domácnost nebyla nalezena.')
  return periodConfigOfHousehold(household)
}
