import { useMemo, useState } from 'react'
import { CalendarClock, Check, Plus, Repeat, SkipForward } from 'lucide-react'
import { money, shortDate } from '@/lib/format'
import { INTERVAL_LABELS, recurringOverview, type DuePayment, type RecurringOccurrence, type RecurringPayment } from '@/lib/recurring-payments'

/** Recurring payments: what is due and waits for "Zaplaceno" or "Přeskočit", what comes next, and the
 *  list to add to or change. The due dates come from lib/recurring-payments.ts (recurringOverview). */
export function RecurringPayments({
  payments,
  occurrences,
  today,
  onAdd,
  onEdit,
  onConfirm,
  onSkip,
}: {
  payments: RecurringPayment[]
  occurrences: RecurringOccurrence[]
  today: string
  onAdd: () => void
  onEdit: (payment: RecurringPayment) => void
  onConfirm: (paymentId: string, dueDate: string, paid: { amount: number; date: string }) => Promise<void>
  onSkip: (paymentId: string, dueDate: string) => Promise<void>
}) {
  const { due, upcoming } = useMemo(() => recurringOverview(payments, occurrences, today), [payments, occurrences, today])

  return (
    <section className="surface p-5 sm:p-6" aria-label="Pravidelné platby">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Pravidelné platby</p>
          <p className="mt-1 text-sm text-muted-foreground">Nájem, energie, pojištění… Do výdajů se započítají, až je potvrdíte.</p>
        </div>
        <button onClick={onAdd} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="h-4 w-4" aria-hidden="true" /> Přidat
        </button>
      </div>

      {payments.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          Zatím žádné. Přidejte platbu, která se opakuje — v den splatnosti vám ji připomeneme k potvrzení.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {due.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">K potvrzení</p>
              <ul className="mt-2 space-y-2">
                {due.map((entry) => (
                  <DueRow key={`${entry.payment.id}|${entry.dueDate}`} entry={entry} today={today} onConfirm={onConfirm} onSkip={onSkip} />
                ))}
              </ul>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Brzy splatné</p>
              <ul className="mt-2 space-y-1.5">
                {upcoming.map((entry) => (
                  <li key={entry.payment.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 break-words">{entry.payment.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium">{money(entry.payment.amount)}</span>
                      <span className="block text-xs text-muted-foreground">{shortDate(entry.dueDate)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Všechny platby</p>
            <ul className="mt-2 divide-y divide-border/60 rounded-2xl bg-muted px-2">
              {payments.map((payment) => (
                <li key={payment.id}>
                  <button onClick={() => onEdit(payment)} className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex min-w-0 items-center gap-2">
                      <Repeat className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium">{payment.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {INTERVAL_LABELS[payment.intervalMonths]} · {payment.subcategory ?? payment.category}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold">{money(payment.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

/** One due date: "Zaplaceno" opens the amount and date actually paid (the planned ones filled in),
 *  "Přeskočit" marks it as not paid this time. */
function DueRow({
  entry,
  today,
  onConfirm,
  onSkip,
}: {
  entry: DuePayment
  today: string
  onConfirm: (paymentId: string, dueDate: string, paid: { amount: number; date: string }) => Promise<void>
  onSkip: (paymentId: string, dueDate: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [amount, setAmount] = useState(String(entry.payment.amount).replace('.', ','))
  const [date, setDate] = useState(entry.dueDate)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodařilo se uložit.')
      setBusy(false)
    }
  }

  function confirm() {
    const value = Number(amount.replace(/[\s ]/g, '').replace(',', '.'))
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setError('Zadejte částku větší než 0.')
    void run(() => onConfirm(entry.payment.id, entry.dueDate, { amount: value, date }))
  }

  const overdue = entry.dueDate < today
  return (
    <li className="rounded-2xl bg-muted px-3 py-3">
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="block break-words font-medium">{entry.payment.name}</span>
          <span className="block text-xs text-muted-foreground">
            {overdue ? `Splatné ${shortDate(entry.dueDate)}` : 'Splatné dnes'} · {entry.payment.subcategory ?? entry.payment.category}
          </span>
        </span>
        <span className="shrink-0 font-semibold">{money(entry.payment.amount)}</span>
      </div>
      {confirming ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" aria-label={`Zaplacená částka ${entry.payment.name}`} className="min-h-10 rounded-xl border border-input bg-background px-3 text-sm" />
          <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} aria-label={`Datum platby ${entry.payment.name}`} className="min-h-10 rounded-xl border border-input bg-background px-3 text-sm" />
          <button onClick={confirm} disabled={busy} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? 'Ukládám…' : 'Uložit'}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setConfirming(true)} disabled={busy} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
            <Check className="h-4 w-4" aria-hidden="true" /> Zaplaceno
          </button>
          <button onClick={() => void run(() => onSkip(entry.payment.id, entry.dueDate))} disabled={busy} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-background px-3 text-sm font-medium disabled:opacity-60">
            <SkipForward className="h-4 w-4" aria-hidden="true" /> Přeskočit
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}
