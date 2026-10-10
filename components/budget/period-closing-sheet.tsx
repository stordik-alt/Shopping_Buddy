import { useMemo, useState } from 'react'
import { PocketIcon } from '@/components/budget/pocket-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { evaluatePeriod, planClosing } from '@/lib/budget-closing'
import type { ClosingRecommendation, RecommendationReason } from '@/lib/budget-recommendation'
import { money, periodLabel } from '@/lib/format'
import type { ClosingPreview, Pocket } from '@/lib/types'
import type { CloseInput } from '@/app/actions/period-closing'

const round2 = (value: number) => Math.round(value * 100) / 100

/** "1 500,50" → 1500.5; 0 for blank; NaN for text that is not a number. */
function parseAmount(text: string): number {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.')
  return cleaned === '' ? 0 : Number(cleaned)
}

/** The suggested Kapsa amounts as the form's text fields. */
function fromRecommendation(recommendation: ClosingRecommendation | null): Record<string, string> {
  const result: Record<string, string> = {}
  for (const item of [...(recommendation?.deposits ?? []), ...(recommendation?.withdrawals ?? [])]) result[item.pocketId] = String(item.amount).replace('.', ',')
  return result
}

/** The wording of one reason; the amounts were fixed by lib/budget-recommendation.ts. */
function reasonText(reason: RecommendationReason): string {
  switch (reason.kind) {
    case 'keep':
      return reason.planned ? `${money(reason.amount)} nechat na další období, jak jste si naplánovali.` : `${money(reason.amount)} nechat na další období, čekají ho platby a výdaje, které jeho příjmy nepokryjí.`
    case 'reserve':
      return `${money(reason.amount)} doplnit do finanční rezervy ${reason.pocketName}.`
    case 'pocket':
      return `${money(reason.amount)} do Kapsy ${reason.pocketName} podle jejího příspěvku.`
    case 'rest':
      return `Zbylých ${money(reason.amount)} převést do dalšího období.`
    case 'cover':
      return reason.isReserve ? `${money(reason.amount)} pokrýt z finanční rezervy ${reason.pocketName}.` : `${money(reason.amount)} pokrýt z Kapsy ${reason.pocketName}.`
  }
}

/** Closing a period that has ended (docs/15_BUDGET_PERIODS.md §12–15). A surplus is split between
 *  Kapsy and the next period; a deficit is covered from Kapsy and what is left is carried on as a
 *  negative transfer. The rules come from lib/budget-closing.ts — the same ones the server applies
 *  again — so the preview here cannot disagree with what is saved. Nothing moves until "Uzavřít". */
export function PeriodClosingSheet({
  preview,
  pockets,
  recommendation,
  reservedForNext,
  onClose,
  onConfirm,
}: {
  preview: ClosingPreview
  pockets: Pocket[]
  /** What ANITKA suggests for this result (lib/budget-recommendation.ts); null when there is nothing to split. */
  recommendation: ClosingRecommendation | null
  /** What the next period needs beyond its own money for payments and planned expenses already known
   *  (nextPeriodNeed). Not locked: the sheet only says when the split leaves less than that. */
  reservedForNext: number
  onClose: () => void
  onConfirm: (input: CloseInput) => Promise<void>
}) {
  const verdict = evaluatePeriod(preview.result)
  // ANITKA's suggestion fills the form (docs/15 §12 "uživatel může doporučení změnit"); it is only a
  // starting point and nothing is saved until "Uzavřít období".
  const [amounts, setAmounts] = useState<Record<string, string>>(() => fromRecommendation(recommendation))
  const [carryOn, setCarryOn] = useState(() => (recommendation && recommendation.carryOn > 0 ? String(recommendation.carryOn).replace('.', ',') : ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const choice = useMemo(() => {
    const items = pockets
      .map((pocket) => ({ pocketId: pocket.id, amount: parseAmount(amounts[pocket.id] ?? '') }))
      .filter((item) => item.amount !== 0)
    return verdict.kind === 'deficit'
      ? { deposits: [], withdrawals: items, carryOn: 0 }
      : { deposits: items, withdrawals: [], carryOn: parseAmount(carryOn) }
  }, [amounts, carryOn, pockets, verdict.kind])

  const outcome = useMemo(() => planClosing(preview.result, choice, new Map(pockets.map((pocket) => [pocket.id, pocket.balance]))), [preview.result, choice, pockets])
  const plan = 'plan' in outcome ? outcome.plan : null

  async function confirm() {
    if (!plan) return
    setBusy(true)
    setError('')
    try {
      await onConfirm({ periodStart: preview.periodStart, ...choice })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Období se nepodařilo uzavřít.')
      setBusy(false)
    }
  }

  const title =
    verdict.kind === 'surplus'
      ? `Skutečně vám zůstalo ${money(verdict.amount)}. Co s nimi chcete udělat?`
      : verdict.kind === 'deficit'
        ? `Toto období máte schodek ${money(verdict.amount)}. Jak ho chcete pokrýt?`
        : 'Období skončilo vyrovnaně.'

  return (
    <Sheet
      open
      onClose={onClose}
      title="Uzavřít období"
      description={periodLabel(preview.periodStart, preview.periodEnd)}
      footer={
        <>
          {(error || (!plan && 'error' in outcome)) && (
            <p role="alert" className="text-sm text-destructive">
              {error || ('error' in outcome ? outcome.error : '')}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={() => void confirm()} disabled={busy || !plan}>
            {busy ? 'Uzavírám…' : 'Uzavřít období'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-base font-semibold">{title}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Přijaté příjmy" value={money(preview.received)} />
          <Row label="Převod z předchozího období" value={money(preview.carryIn)} />
          <Row label="Zaplacené výdaje" value={money(preview.expenses)} />
          <Row label="Uloženo do Kapes" value={money(preview.transfers)} />
          <Row label="Výsledek" value={money(preview.result)} strong />
        </dl>

        {verdict.kind === 'deficit' && (
          <p className="rounded-2xl bg-muted p-3 text-sm text-fg-secondary">Schodek nejde uložit ani vydávat za volné peníze. Pokryjte ho z Kapes; co zůstane nepokryté, přejde jako záporný převod do dalšího období.</p>
        )}

        {recommendation && recommendation.reasons.length > 0 && (
          <div className="space-y-2 rounded-2xl bg-muted p-3 text-sm" aria-label="Doporučení ANITKY">
            <p className="font-semibold">Doporučení ANITKY</p>
            <ul className="space-y-1 text-fg-secondary">
              {recommendation.reasons.map((reason, index) => (
                <li key={index}>{reasonText(reason)}</li>
              ))}
            </ul>
            <p className="text-xs text-fg-secondary">Je to jen návrh, můžete ho změnit. Nic se nepřesune, dokud období neuzavřete.</p>
          </div>
        )}

        {verdict.kind !== 'even' && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">{verdict.kind === 'surplus' ? 'Rozdělení přebytku' : 'Pokrytí z Kapes'}</legend>
            {pockets.length === 0 && verdict.kind === 'deficit' && <p className="text-sm text-fg-secondary">Nemáte žádnou Kapsu, ze které by šlo schodek pokrýt.</p>}
            {pockets.map((pocket) => (
              <label key={pocket.id} className="flex items-center gap-3">
                <PocketIcon name={pocket.icon} className="size-5 shrink-0 text-fg-secondary" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block break-words font-medium">{pocket.name}</span>
                  <span className="block text-xs text-fg-secondary">V Kapse {money(pocket.balance)}</span>
                </span>
                <Input
                  className="w-32 shrink-0 text-right"
                  value={amounts[pocket.id] ?? ''}
                  onChange={(event) => setAmounts((current) => ({ ...current, [pocket.id]: event.target.value }))}
                  type="text"
                  inputMode="decimal"
                  placeholder="0 Kč"
                  aria-label={`${verdict.kind === 'surplus' ? 'Uložit do' : 'Vzít z'} Kapsy ${pocket.name}`}
                />
              </label>
            ))}
            {verdict.kind === 'surplus' && (
              <label className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-sm font-medium">Do dalšího období</span>
                <Input className="w-32 shrink-0 text-right" value={carryOn} onChange={(event) => setCarryOn(event.target.value)} type="text" inputMode="decimal" placeholder="0 Kč" aria-label="Převést do dalšího období" />
              </label>
            )}
          </fieldset>
        )}

        {verdict.kind === 'surplus' && reservedForNext > 0 && (
          <div className="space-y-1 rounded-2xl bg-muted p-3 text-sm" aria-label="Vyhrazeno na závazky" role="status">
            <p className="font-semibold">Vyhrazeno na závazky: {money(reservedForNext)}</p>
            <p className="text-fg-secondary">Tolik další období potřebuje na pravidelné platby a plánované výdaje, které jeho příjmy a zůstatek nepokryjí.</p>
            {plan && plan.carry < reservedForNext && (
              <p className="font-medium">
                Do dalšího období převádíte o {money(round2(reservedForNext - plan.carry))} méně, než potřebuje. Peníze na tyto platby pak bude muset najít jinde.
              </p>
            )}
          </div>
        )}

        {plan && (
          <p className="rounded-2xl bg-muted/60 p-3 text-sm" aria-live="polite">
            {plan.carry > 0 && <>Další období začne s převodem <strong>+{money(plan.carry)}</strong>. </>}
            {plan.carry < 0 && <>Další období začne s převodem <strong>−{money(-plan.carry)}</strong>. </>}
            {plan.carry === 0 && <>Do dalšího období se nic nepřevádí. </>}
            {plan.kept > 0 && <>Nepřiřazených {money(plan.kept)} zůstane mimo plán.</>}
          </p>
        )}
      </div>
    </Sheet>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl bg-muted/60 p-2.5 ${strong ? 'col-span-2' : ''}`}>
      <dt className="text-xs text-fg-secondary">{label}</dt>
      <dd className={`mt-0.5 break-words tabular-nums ${strong ? 'text-base font-semibold' : 'font-medium'}`}>{value}</dd>
    </div>
  )
}
