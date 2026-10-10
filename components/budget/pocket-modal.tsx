import { useRef, useState } from 'react'
import { PocketIcon, POCKET_ICON_CHOICES } from '@/components/budget/pocket-icon'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { PocketInput } from '@/lib/pocket-input'
import type { Pocket } from '@/lib/types'

/** "1 500,50" → 1500.5; null for blank, NaN for text that is not a number. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.')
  return cleaned === '' ? null : Number(cleaned)
}
const show = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

/** Creates a Kapsa or — given `pocket` — changes or puts one away (docs/15_BUDGET_PERIODS.md §11). A
 *  planned contribution is only a plan: it never changes the balance. The server checks it all again
 *  (lib/pocket-input.ts). */
export function PocketModal({
  pocket,
  onClose,
  onSave,
  onArchive,
}: {
  pocket?: Pocket
  onClose: () => void
  onSave: (input: PocketInput) => Promise<void>
  onArchive?: () => Promise<void>
}) {
  const [name, setName] = useState(pocket?.name ?? '')
  const [icon, setIcon] = useState(pocket?.icon ?? 'piggy-bank')
  const [targetAmount, setTargetAmount] = useState(show(pocket?.targetAmount ?? null))
  const [targetDate, setTargetDate] = useState(pocket?.targetDate ?? '')
  const [openingAmount, setOpeningAmount] = useState(show(pocket?.openingAmount ?? null))
  const [contribution, setContribution] = useState(show(pocket?.plannedContribution ?? null))
  const [isReserve, setIsReserve] = useState(pocket?.isReserve ?? false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kapsu se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const target = parseAmount(targetAmount)
    const opening = parseAmount(openingAmount)
    const planned = parseAmount(contribution)
    if ([target, opening, planned].some((value) => value !== null && !Number.isFinite(value))) return setError('Částky zadejte číslem.')
    void run(() =>
      onSave({ name, icon, targetAmount: target, targetDate: targetDate || null, openingAmount: opening ?? 0, plannedContribution: planned, isReserve }),
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={pocket ? 'Upravit Kapsu' : 'Nová Kapsa'}
      description="Kapsa je část peněz odložená na konkrétní účel."
      initialFocus={pocket ? undefined : nameRef}
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={save} disabled={busy}>
            {busy ? 'Ukládám…' : pocket ? 'Uložit změny' : 'Přidat Kapsu'}
          </Button>
          {pocket && onArchive && (
            <Button variant="destructive" size="lg" className="w-full" onClick={() => (confirmArchive ? void run(onArchive) : setConfirmArchive(true))} disabled={busy}>
              {confirmArchive ? 'Opravdu odložit? Klepněte znovu' : 'Odložit Kapsu'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Název">{(p) => <Input {...p} ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Např. Auto, Finanční rezerva, Vánoce" />}</Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Ikona</legend>
          <div className="grid grid-cols-4 gap-2">
            {POCKET_ICON_CHOICES.map((choice) => (
              <button
                key={choice.key}
                type="button"
                onClick={() => setIcon(choice.key)}
                aria-pressed={icon === choice.key}
                aria-label={choice.label}
                className={cn('flex min-h-11 items-center justify-center rounded-xl border', icon === choice.key ? 'border-ring bg-muted' : 'border-input')}
              >
                <PocketIcon name={choice.key} className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cílová částka" hint="Nepovinné">
            {(p) => <Input {...p} value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}
          </Field>
          <Field label="Termín cíle" hint="Nutný, pokud zadáte částku">
            {(p) => <Input {...p} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Počáteční částka" hint="Kolik v Kapse už je">
            {(p) => <Input {...p} value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}
          </Field>
          <Field label="Plánovaný příspěvek na období" hint="Jen plán, zůstatek nemění">
            {(p) => <Input {...p} value={contribution} onChange={(event) => setContribution(event.target.value)} type="text" inputMode="decimal" placeholder="0,00 Kč" />}
          </Field>
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5" checked={isReserve} onChange={(event) => setIsReserve(event.target.checked)} />
          <span>
            <span className="font-medium">Finanční rezerva</span>
            <span className="block text-fg-secondary">Na schodek sáhne ANITKA v návrzích jako první a při přebytku doporučí rezervu doplnit. Rezerva může být jen jedna.</span>
          </span>
        </label>
      </div>
    </Sheet>
  )
}
