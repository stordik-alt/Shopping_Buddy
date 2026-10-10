import { useMemo, useState } from 'react'
import { Panel } from '@/components/budget/panel'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { periodEnd, periodStart } from '@/lib/budget'
import {
  CALENDAR_PERIOD,
  isCalendarMonth,
  MAX_CUSTOM_PERIOD_DAYS,
  MAX_PERIOD_START_DAY,
  MIN_CUSTOM_PERIOD_DAYS,
  periodConfigError,
  periodConfigKey,
  type PeriodConfig,
} from '@/lib/budget-period'
import { periodLabel } from '@/lib/format'

type Kind = 'calendar' | 'payday' | 'custom'

/** The kind a config is edited as: a payday on the 1st is the calendar month. */
const kindOf = (period: PeriodConfig): Kind => (isCalendarMonth(period) ? 'calendar' : period.type)

/** Rozpočet ▸ Plánování ▸ Rozpočtové období (docs/15_BUDGET_PERIODS.md §2–3): calendar month, the
 *  period from payday (a day of the month), or a custom one (a start date and a length in days). The
 *  server checks the value again (lib/budget-period.ts parsePeriodConfig). Mount it with
 *  `key={periodConfigKey(period)}` so the drafts start over after a save. */
export function BudgetPeriodSettings({ period, today, onSave }: { period: PeriodConfig; today: string; onSave: (period: PeriodConfig) => Promise<void> }) {
  const [kind, setKind] = useState<Kind>(kindOf(period))
  const [startDay, setStartDay] = useState(String(period.type === 'payday' && period.startDay > 1 ? period.startDay : 15))
  const [anchor, setAnchor] = useState(period.type === 'custom' ? period.anchor : today)
  const [length, setLength] = useState(String(period.type === 'custom' ? period.lengthDays : 14))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const candidate = useMemo<PeriodConfig>(() => {
    if (kind === 'calendar') return CALENDAR_PERIOD
    if (kind === 'payday') return { type: 'payday', startDay: Number(startDay) }
    return { type: 'custom', anchor, lengthDays: Number(length) }
  }, [kind, startDay, anchor, length])
  const invalid = periodConfigError(candidate)
  const changed = periodConfigKey(isCalendarMonth(candidate) ? CALENDAR_PERIOD : candidate) !== periodConfigKey(isCalendarMonth(period) ? CALENDAR_PERIOD : period)
  // The period the new setting would put today in, so the user sees what they are choosing.
  const preview = invalid ? null : (() => {
    const start = periodStart(today, candidate)
    return periodLabel(start, periodEnd(start, candidate))
  })()

  async function save() {
    if (invalid) return setError(invalid)
    setBusy(true)
    setError('')
    try {
      await onSave(candidate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Období se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Nastavení období"
      summary={kindOf(period) === 'calendar' ? 'Kalendářní měsíc' : kindOf(period) === 'payday' ? `Od výplaty, ${period.type === 'payday' ? period.startDay : ''}. dne` : 'Vlastní období'}
      description="Podle čeho hospodaříte s penězi: kalendářní měsíc, od výplaty, nebo vlastní období."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Druh období">
          {(p) => (
            <Select {...p} value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
              <option value="calendar">Kalendářní měsíc</option>
              <option value="payday">Od výplaty (den v měsíci)</option>
              <option value="custom">Vlastní období</option>
            </Select>
          )}
        </Field>
        {kind === 'payday' && (
          <Field label="Období začíná" hint={`Např. ${startDay}. – ${Number(startDay) - 1}. dne následujícího měsíce.`}>
            {(p) => (
              <Select {...p} value={startDay} onChange={(event) => setStartDay(event.target.value)}>
                {Array.from({ length: MAX_PERIOD_START_DAY - 1 }, (_, index) => index + 2).map((day) => (
                  <option key={day} value={day}>
                    {day}. dne v měsíci
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {kind === 'custom' && (
          <>
            <Field label="První den období" hint="Od tohoto data se období opakují.">
              {(p) => <Input {...p} type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} />}
            </Field>
            <Field label="Délka v dnech" hint={`${MIN_CUSTOM_PERIOD_DAYS} až ${MAX_CUSTOM_PERIOD_DAYS} dní.`}>
              {(p) => <Input {...p} type="number" inputMode="numeric" min={MIN_CUSTOM_PERIOD_DAYS} max={MAX_CUSTOM_PERIOD_DAYS} value={length} onChange={(event) => setLength(event.target.value)} />}
            </Field>
          </>
        )}
      </div>

      {changed && preview && <p className="mt-4 text-sm text-fg-secondary">Dnešek by spadal do období: <span className="font-semibold text-foreground">{preview}</span></p>}
      {changed && invalid && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {invalid}
        </p>
      )}
      {changed && !invalid && (
        <p className="mt-2 text-sm text-fg-secondary">Změna přepočítá přehledy podle nového období. Rozpočty nastavené pro jednotlivá období zůstanou u svých původních dat.</p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={() => void save()} disabled={busy || !changed || invalid !== null}>
        {busy ? 'Ukládám…' : 'Uložit období'}
      </Button>
    </Panel>
  )
}
