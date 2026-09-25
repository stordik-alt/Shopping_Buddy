import { useEffect, useRef, useState } from 'react'
import { Loader2, Pin, Search, Tag } from 'lucide-react'
import type { ProductSearchResult } from '@/app/actions/product-search'
import { money, shortDate } from '@/lib/format'
import { hitPrice, hitUnitPrice, searchTokens } from '@/lib/product-search'
import type { ItemCategory } from '@/lib/types'
import { userFacingError } from '@/lib/errors'

const DEBOUNCE_MS = 300

/** Finding specific products at each chain: "mleko" -> the milks Lidl, Albert, Billa … actually
 *  have, with price, unit price, promotion and when the price was seen. Grouped per chain. The
 *  search itself is injected (`search`) — the real one is the `searchProductsAction` Server Action —
 *  so the component has no server dependency of its own. */
export function ProductSearch({
  initialQuery = '',
  category,
  pinning,
  search,
}: {
  initialQuery?: string
  /** Restricts the search to one category (an item's own), so "mléko" for a food item does not offer body milk. */
  category?: ItemCategory
  /** When searching for a specific list item: lets the user pin a product to it at each chain. */
  pinning?: {
    /** storeId -> the productId pinned for this item there. */
    pinned: Record<string, string>
    onPin: (storeId: string, productId: string) => Promise<void>
    onUnpin: (storeId: string) => Promise<void>
  }
  search: (input: { query: string; onlyNearby: boolean; category?: ItemCategory }) => Promise<ProductSearchResult>
}) {
  const [query, setQuery] = useState(initialQuery)
  const [onlyNearby, setOnlyNearby] = useState(true)
  const [result, setResult] = useState<ProductSearchResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [pinError, setPinError] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // Only the latest request may update the screen: a slow answer to an earlier query must not
  // overwrite the results of the current one.
  const latest = useRef(0)

  const hasQuery = searchTokens(query).length > 0

  async function togglePin(storeId: string, productId: string, pinnedNow: boolean) {
    if (!pinning) return
    setBusyKey(`${storeId}|${productId}`)
    setPinError('')
    try {
      if (pinnedNow) await pinning.onUnpin(storeId)
      else await pinning.onPin(storeId, productId)
    } catch (err) {
      setPinError(userFacingError(err, 'Výběr produktu se nepodařil.'))
    } finally {
      setBusyKey(null)
    }
  }

  useEffect(() => {
    if (!hasQuery) {
      latest.current++
      setResult(null)
      setStatus('idle')
      return
    }
    const request = ++latest.current
    setStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const next = await search({ query, onlyNearby, ...(category ? { category } : {}) })
        if (request !== latest.current) return
        setResult(next)
        setStatus('idle')
        setError('')
      } catch (err) {
        if (request !== latest.current) return
        setStatus('error')
        setError(userFacingError(err, 'Hledání se nepodařilo.'))
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, onlyNearby, hasQuery, search, category])

  return (
    <div className="rounded-xl border border-border bg-background p-3 text-sm">
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hledat produkt v obchodech"
          aria-label="Hledat produkt v obchodech"
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {status === 'loading' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Hledám" />}
      </label>

      {result?.hasNearbySelection && (
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyNearby} onChange={(event) => setOnlyNearby(event.target.checked)} className="size-4 accent-primary" />
          Jen mé obchody v okolí
        </label>
      )}

      <div className="mt-3" aria-live="polite">
        {status === 'error' && <p role="alert" className="text-destructive">{error}</p>}
        {pinError && <p role="alert" className="mb-2 text-destructive">{pinError}</p>}

        {!hasQuery && status !== 'error' && <p className="text-muted-foreground">Napište, co hledáte, např. „mléko“ nebo „máslo 250 g“. Diakritika nevadí.</p>}

        {hasQuery && result && status !== 'error' && result.groups.length === 0 && status !== 'loading' && (
          <p className="text-muted-foreground">
            Nic jsme nenašli. Zkuste jiné slovo{result.nearbyOnly ? ' nebo vypněte „Jen mé obchody v okolí“' : ''}. Katalog zatím nepokrývá všechny produkty.
          </p>
        )}

        {hasQuery && result && result.groups.length > 0 && (
          <div className="flex flex-col gap-4">
            {result.groups.map((group) => (
              <section key={group.storeId} aria-label={group.chain}>
                <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                  <span>{group.chain}</span>
                  <span className="text-xs font-normal text-muted-foreground">{group.totalMatches} {group.totalMatches === 1 ? 'produkt' : group.totalMatches < 5 ? 'produkty' : 'produktů'}</span>
                </h3>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {group.hits.map((hit) => (
                    <li key={hit.productId} className="rounded-lg bg-muted px-3 py-2">
                      <p className="break-words font-medium">
                        {hit.name}
                        {!category && hit.category !== 'Potraviny' && <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{hit.category}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="text-sm font-semibold">{money(hitPrice(hit))}</span>
                        {hit.dealPrice != null && (
                          <span className="flex items-center gap-1 font-semibold text-primary">
                            <Tag className="h-3 w-3" aria-hidden="true" /> akce{hit.dealValidUntil ? ` do ${shortDate(hit.dealValidUntil)}` : ''}
                            <span className="font-normal text-muted-foreground line-through">{money(hit.regularPrice)}</span>
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {money(hitUnitPrice(hit))}/{hit.unit}
                        </span>
                        <span className="text-muted-foreground">cena z {shortDate(hit.observedAt)}</span>
                      </p>
                      {pinning && (
                        <button
                          type="button"
                          aria-pressed={pinning.pinned[hit.storeId] === hit.productId}
                          disabled={busyKey === `${hit.storeId}|${hit.productId}`}
                          onClick={() => togglePin(hit.storeId, hit.productId, pinning.pinned[hit.storeId] === hit.productId)}
                          className={`mt-1.5 flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                            pinning.pinned[hit.storeId] === hit.productId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'
                          }`}
                        >
                          <Pin className={`h-3.5 w-3.5 ${pinning.pinned[hit.storeId] === hit.productId ? 'fill-current' : ''}`} aria-hidden="true" />
                          {pinning.pinned[hit.storeId] === hit.productId ? `Vybráno pro ${group.chain} · zrušit` : `Vybrat pro tuto položku v ${group.chain}`}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {group.totalMatches > group.hits.length && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    …a dalších {group.totalMatches - group.hits.length}. Upřesněte hledání.
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
