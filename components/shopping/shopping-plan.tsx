import { useState } from 'react'
import { AlertTriangle, ChevronDown, ListChecks, Loader2, Pin, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import type { PlanResult } from '@/lib/db/shopping-plan'
import { money } from '@/lib/format'
import { MAX_SHOP_STORES } from '@/lib/nearby-stores'
import { alternativeLabel, alternativesToShow, planInsights } from '@/lib/shopping-plan-format'
import { userFacingError } from '@/lib/errors'

const DEFAULT_MAX_STORES = 2

const packageLabel = (size: { value: number; unit: string } | null | undefined) => (size ? `${String(size.value).replace('.', ',')} ${size.unit}` : null)

/** "Plán nákupu": where to buy what, using at most N stores and preferring the user's priority
 *  stores, for the least money — with, for every item, what buying it elsewhere would cost. The
 *  planning itself is the pure `planShopping()` on the server (`buildShoppingPlanAction`); this only
 *  asks for it and shows it. `inputKey` changes whenever the open items or their pinned products do,
 *  so an old plan can be flagged as out of date. */
export function ShoppingPlanPanel({
  chains,
  defaultMaxStores,
  defaultPriorityIds,
  openItemCount,
  inputKey,
  build,
  onPlanResult,
}: {
  /** The chains a plan may use: the user's stores in their area, or every chain when they chose none. */
  chains: { id: string; chain: string }[]
  defaultMaxStores: number | null
  defaultPriorityIds: string[]
  openItemCount: number
  inputKey: string
  build: (input: { maxStores: number; priorityChainIds: string[] }) => Promise<PlanResult>
  /** Reports the latest plan to the parent so other views can reuse its exact store totals. */
  onPlanResult?: (result: PlanResult | null) => void
}) {
  const [maxStores, setMaxStores] = useState(String(defaultMaxStores ?? DEFAULT_MAX_STORES))
  const [priorityIds, setPriorityIds] = useState<string[]>(defaultPriorityIds.filter((id) => chains.some((chain) => chain.id === id)))
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<PlanResult | null>(null)
  const [builtFor, setBuiltFor] = useState('')

  async function run() {
    setStatus('loading')
    setError('')
    onPlanResult?.(null)
    try {
      const next = await build({ maxStores: Number(maxStores), priorityChainIds: priorityIds })
      setResult(next)
      setBuiltFor(inputKey)
      onPlanResult?.(next)
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(userFacingError(err, 'Plán se nepodařilo sestavit.'))
    }
  }

  const plan = result?.plan
  const outdated = result != null && builtFor !== inputKey

  return (
    <section className="surface p-4 sm:p-5" aria-labelledby="shopping-plan-title">
      <div className="flex items-start gap-3">
        <ListChecks className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="shopping-plan-title" className="font-semibold">Plán nákupu</h3>
          <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
            Kde co koupit, aby vás nákup vyšel nejlevněji a přitom v nejvýš tolika obchodech, kolik zvolíte. U každé položky uvidíte, kolik by stála jinde.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Kolik obchodů projdu
          <Select value={maxStores} onChange={(event) => setMaxStores(event.target.value)} className="w-28 px-3 font-normal">
            {Array.from({ length: MAX_SHOP_STORES }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
        </label>
        <Button size="lg" onClick={run} disabled={status === 'loading' || openItemCount === 0}>
          {status === 'loading' && <Loader2 className="animate-spin" aria-hidden="true" />}
          {result ? 'Sestavit znovu' : 'Sestavit plán'}
        </Button>
      </div>

      {chains.length > 1 && (
        // Every chain is a choice here (often 20+), so the chips wait behind a summary of what is picked.
        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="font-medium">Prioritní obchody</span>
            <span className="min-w-0 truncate text-fg-muted">
              · {priorityIds.length === 0 ? 'žádné' : chains.filter(({ id }) => priorityIds.includes(id)).map(({ chain }) => chain).join(', ')}
            </span>
            <ChevronDown className="size-4 shrink-0 text-accent-text transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {chains.map(({ id, chain }) => {
              const on = priorityIds.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Prioritní: ${chain}`}
                  onClick={() => setPriorityIds(on ? priorityIds.filter((entry) => entry !== id) : [...priorityIds, id])}
                  className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    on ? 'border-accent-solid bg-accent-subtle font-medium text-accent-text' : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${on ? 'fill-current' : ''}`} aria-hidden="true" />
                  {chain}
                </button>
              )
            })}
          </div>
        </details>
      )}

      <div className="mt-4" aria-live="polite">
        {openItemCount === 0 && <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-fg-secondary">Na seznamu nemáte žádné nedokončené položky, není co plánovat.</p>}
        {status === 'error' && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {outdated && (
          <p className="mb-3 flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Seznam nebo vybrané produkty se od sestavení plánu změnily. Sestavte plán znovu.
          </p>
        )}

        {plan && (
          <div className="flex flex-col gap-4">
            {result.usedNearbySelection ? (
              <p className="text-xs text-muted-foreground">Počítáno jen s vašimi obchody v okolí: {result.allowedChains.map((chain) => chain.chain).join(', ')}.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Nemáte zvolené obchody v okolí (Profil), plánuje se ze všech obchodů.</p>
            )}

            <div className="rounded-2xl bg-accent-subtle px-4 py-3 text-accent-text">
              <p className="text-sm">
                {plan.plannedCount} z {plan.needCount} položek · {plan.stores.length} {plan.stores.length === 1 ? 'obchod' : plan.stores.length < 5 ? 'obchody' : 'obchodů'}
              </p>
              <p className="text-2xl font-semibold">{money(plan.total)}</p>
              {planInsights(plan).map((sentence) => (
                <p key={sentence} className="mt-1 text-sm">
                  {sentence}
                </p>
              ))}
            </div>

            {plan.stores.map((store) => (
              <section key={store.storeId} aria-label={store.chain}>
                <h4 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                  <span className="flex items-center gap-1.5">
                    {store.chain}
                    {store.isPriority && <Star className="h-3.5 w-3.5 fill-current text-primary" aria-label="prioritní obchod" />}
                  </span>
                  <span>{money(store.subtotal)}</span>
                </h4>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {store.lines.map((line) => {
                    const size = packageLabel(result.packageSizes[`${line.needId}|${line.storeId}`])
                    const packageCount = result.packageCounts[`${line.needId}|${line.storeId}`]
                    const alternatives = alternativesToShow(line)
                    return (
                      <li key={line.needId} className="rounded-lg bg-muted px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words font-medium">{line.name}</p>
                            <p className="break-words text-xs text-muted-foreground">
                              Potřeba: {String(line.quantity).replace('.', ',')} {line.unit} · {line.productName}
                              {size ? ` · ${packageCount ?? 1}× balení ${size}` : ''}
                              {line.source === 'pinned' && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-primary">
                                  <Pin className="h-3 w-3" aria-hidden="true" /> vybráno vámi
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold">{money(line.cost)}</span>
                        </div>
                        {alternatives.length > 0 && (
                          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                            {alternatives.map((alt) => (
                              <li key={alt.storeId} className="break-words">
                                {alternativeLabel(alt)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}

            {plan.unplanned.length > 0 && (
              <section aria-label="Bez ceny v plánu">
                <h4 className="text-sm font-semibold">Nezahrnuto do plánu</h4>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {plan.unplanned.map((entry) => (
                    <li key={entry.needId} className="rounded-lg bg-muted px-3 py-2 text-sm">
                      <p className="break-words font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.availableAt.length === 0
                          ? 'V těchto obchodech jsme ji nenašli nebo ji nejde porovnat podle jednotky. Zkuste „Najít v obchodech“ u položky.'
                          : `K dostání jen mimo plán: ${entry.availableAt.map((store) => `${store.chain} (${money(store.cost)})`).join(', ')}.`}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.notes.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {plan.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
