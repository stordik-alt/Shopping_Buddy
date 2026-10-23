import { AlertTriangle, BriefcaseMedical, Car, Cat, ClipboardCheck, House, Package, PackageSearch, Plus, Refrigerator, Snowflake, SprayCan, Warehouse, Wheat, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Pager } from '@/components/shared/pager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PantryAddModal, type PantryAddInput } from '@/components/shopping/pantry-add-modal'
import { PantryCard } from '@/components/shopping/pantry-card'
import { PantryDetail } from '@/components/shopping/pantry-detail'
import { PantryReview, type PantryReviewResult } from '@/components/shopping/pantry-review'
import { itemCountLabel } from '@/lib/format'
import { type PantryQuantityChange, findDuplicatePlacements, isPantryItemAvailable, needsCheck, PANTRY_PAGE_SIZE, pantryPlaceOptions, placeKeyOf, summarizeByPlace, type PantryPlaceOption } from '@/lib/pantry'
import { estimateReason, type ConsumptionEstimate } from '@/lib/pantry-estimate'
import { clampPage, pageCount } from '@/lib/paging'
import type { CatalogChangeOutcome, CategoryChangeOutcome } from '@/lib/product-subcategory-changes'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import { cn } from '@/lib/utils'
import type { ItemCategory, PantryArea, PantryItem, PantryLocation, PantryPlace, PantryTracking } from '@/lib/types'

// One distinct, meaningful icon per location so folders can be told apart at a glance on a phone.
// `satisfies Record<PantryLocation, …>` makes adding a location without an icon a compile error.
const LOCATION_ICON = {
  Spíž: Wheat,
  Lednice: Refrigerator,
  Mrazák: Snowflake,
  Domácnost: House,
  Lékárnička: BriefcaseMedical,
  Drogérka: SprayCan,
} satisfies Record<PantryLocation, LucideIcon>

// A custom place has no icon of its own (the household just typed a name) — one per area instead,
// the same idea as LOCATION_ICON but coarser. `satisfies Record<PantryArea, …>` makes adding an area
// without an icon a compile error.
const AREA_ICON = {
  Potraviny: Wheat,
  Drogerie: SprayCan,
  Domácnost: House,
  Děti: Package,
  Auto: Car,
  Bydlení: Warehouse,
  Zvířata: Cat,
  Ostatní: PackageSearch,
} satisfies Record<PantryArea, LucideIcon>

function iconFor(option: PantryPlaceOption): LucideIcon {
  return option.custom ? AREA_ICON[option.area] : LOCATION_ICON[option.key as PantryLocation]
}

// Sentinel for the "no subcategory yet" filter chip — never a real subcategory name (spec section
// 17: items the pipeline couldn't place confidently still show up under their location, just
// outside any subcategory folder, rather than being hidden).
const UNCATEGORIZED = '__uncategorized__'
const ALL_SUBCATEGORIES = '__all__'

/** Household stock ("zásoby") — what the household believes it currently has at home, restocked
 *  automatically by importReceiptAction/createManualPurchaseAction and periodically re-checked by the
 *  pantry-checkin cron (lib/pantry.ts). Deliberately not one long list: the storage locations are
 *  the primary navigation (a folder tile each, with icon, name, item count and warnings), and only
 *  the opened location's items are shown below — like a file manager for the home.
 *
 *  The items of the open location are a grid of product cells, not a list of rows: the picture of
 *  the product, its name, how much is at home and whether the household still has it — all in one
 *  cell, so the common corrections (a bit more, a bit less, "došlo") take one tap and never need
 *  the detail. The detail (components/shopping/pantry-detail.tsx) holds everything that is rarer:
 *  the exact amount, the place, the category, the subcategory, the tracking and the removal of
 *  the record. A row whose askedAt is set is one the cron just asked the household about, so it's
 *  marked until the household confirms ("Ještě mám") or removes it ("Došlo"). "Zkontrolovat" opens
 *  the bulk check (components/shopping/pantry-review.tsx): tap only what ran out, save once, and
 *  everything else is confirmed. */

export function Pantry({
  items,
  onAddPantryItem,
  customPlaces,
  hiddenLocations = [],
  onConfirm,
  onRemove,
  onMove,
  onAdjustQuantity,
  onReview,
  onSetTracking,
  restockTypeKeys,
  onSetSubcategory,
  onSetCategory,
  onSetProductType,
  onAdjustContent,
  onAutoCategorize,
  estimates,
  openCheck = false,
  onCheckOpened,
  onShopping,
  onReceipts,
}: {
  items: PantryItem[]
  onAddPantryItem: (input: PantryAddInput) => Promise<PantryItem[]>
  /** The household's own places, beyond the fixed locations (Profil domácnosti → Zásoby). */
  customPlaces: PantryPlace[]
  /** Fixed locations the household removed (Profil domácnosti → Zásoby); shown again only while an item is still kept there. */
  hiddenLocations?: PantryLocation[]
  onConfirm: (id: string) => void
  onRemove: (id: string) => void
  /** `place` is a `PantryPlaceOption.key` — a fixed location name, or `custom:<id>`. */
  onMove: (id: string, place: string) => void
  onAdjustQuantity: (id: string, quantity: number) => Promise<void>
  /** Saves a bulk check; resolves to what was done, rejects when nothing was saved. */
  onReview: (reviewedIds: string[], goneIds: string[], addGoneToList: boolean, quantities: PantryQuantityChange[]) => Promise<PantryReviewResult>
  /** How closely an item is watched: normal, rarely (salt, spices), not at all. */
  onSetTracking: (id: string, tracking: PantryTracking) => void
  /** Keys of the product types whose stock nears the minimum set in the Profil; their rows are marked "Dokoupit". */
  restockTypeKeys?: ReadonlySet<string>
  /** Sets an item's subcategory by hand; null clears it. */
  onSetSubcategory: (id: string, subcategory: string | null) => Promise<CatalogChangeOutcome | 'none'> | void
  onSetCategory: (id: string, category: ItemCategory) => Promise<CategoryChangeOutcome | void> | void
  onSetProductType: (id: string, productTypeKey: string | null) => Promise<void>
  onAdjustContent: (contentId: string, quantity: number, expectedQuantity: number) => Promise<boolean>
  /** Places every uncategorized item by the keyword rules; resolves to how many were placed. */
  onAutoCategorize: () => Promise<number>
  /** "Asi došlo" estimates by pantry item id (lib/pantry-estimate.ts). */
  estimates: Map<string, ConsumptionEstimate>
  /** Open the check of uncertain items right away (the weekly notification's link). */
  openCheck?: boolean
  onCheckOpened?: () => void
  /** Next steps offered while the pantry is empty: the shopping list, and the receipt upload. */
  onShopping?: () => void
  onReceipts?: () => void
}) {
  const options = useMemo(() => pantryPlaceOptions(customPlaces, hiddenLocations, items), [customPlaces, hiddenLocations, items])
  const likelyGone = useMemo(() => new Set([...estimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id)), [estimates])
  const summary = summarizeByPlace(items, options, likelyGone)
  // Open on the first place that has something in it rather than on an empty folder.
  const [selectedKey, setSelected] = useState<string>(() => options.find((option) => summary[option.key].count > 0)?.key ?? options[0].key)
  // The open folder can disappear (a default location was removed); fall back to the first one left.
  const selected = options.some((option) => option.key === selectedKey) ? selectedKey : options[0].key
  // Announces a move: the moved row leaves the open folder, so without this it would just vanish.
  const [notice, setNotice] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // The item whose detail is open; only one at a time.
  const [detailId, setDetailId] = useState<string | null>(null)
  // The items the household has run out of (no amount left) stay in the pantry — their record has
  // a history — but they can be hidden, so the grid shows what is actually at home.
  const [showConsumed, setShowConsumed] = useState(true)
  // The check opened from the "K ověření" banner covers every place (the asked items can be
  // anywhere); opened from a folder, it starts with that folder.
  const toCheck = items.filter((item) => needsCheck(item, likelyGone)).length
  // "Zkontrolovat zásoby" (spec section 11): the same item name kept at more than one place — worth
  // the household's attention (maybe a genuine spare, maybe a forgotten duplicate), never auto-merged.
  const duplicates = useMemo(() => findDuplicatePlacements(items), [items])
  const [reviewing, setReviewing] = useState<'location' | 'uncertain' | 'all' | null>(() => (openCheck ? (toCheck > 0 ? 'uncertain' : 'all') : null))
  // The link that opened the check is consumed once, so a reload or a later visit does not reopen it.
  useEffect(() => {
    if (openCheck) onCheckOpened?.()
  }, [openCheck, onCheckOpened])

  const selectedOption = options.find((option) => option.key === selected) ?? options[0]
  const SelectedIcon = iconFor(selectedOption)
  const itemsInLocation = items.filter((item) => placeKeyOf(item) === selected)
  // Subcategory folder within the selected location (spec: "Lednice ▸ Maso a uzeniny" instead of one
  // flat list of everything chilled). `null` means "show everything in this location", the same
  // behavior as before this feature existed. Reset whenever the location changes below.
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null)
  const subcategoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    let uncategorized = 0
    for (const item of itemsInLocation) {
      if (item.subcategory) counts.set(item.subcategory, (counts.get(item.subcategory) ?? 0) + 1)
      else uncategorized += 1
    }
    return { counts, uncategorized }
  }, [itemsInLocation])
  // The items the household has run out of (no amount left) stay in the pantry — their record has
  // a history and "Došlo" counts them — but they can be hidden, so the grid shows what is really
  // at home.
  const consumedInLocation = itemsInLocation.filter((item) => !isPantryItemAvailable(item.quantity)).length
  // The item whose detail is open.
  const detailItem = detailId ? (items.find((item) => item.id === detailId) ?? null) : null
  const selectedItems = useMemo(() => {
    const filtered = subcategoryFilter ? itemsInLocation.filter((item) => (subcategoryFilter === UNCATEGORIZED ? !item.subcategory : item.subcategory === subcategoryFilter)) : itemsInLocation
    return showConsumed ? filtered : filtered.filter((item) => isPantryItemAvailable(item.quantity))
  }, [itemsInLocation, subcategoryFilter, showConsumed])
  // Clamped at render time (not just reset on folder change) so a page also self-corrects the
  // moment an item leaves it — moved elsewhere, removed as "Došlo" — instead of showing an empty
  // page until the household happens to switch folders and back.
  const [page, setPage] = useState(1)
  const totalPages = pageCount(selectedItems.length, PANTRY_PAGE_SIZE)
  const currentPage = clampPage(page, selectedItems.length, PANTRY_PAGE_SIZE)
  const pagedItems = selectedItems.slice((currentPage - 1) * PANTRY_PAGE_SIZE, currentPage * PANTRY_PAGE_SIZE)

  function move(item: PantryItem, placeKey: string) {
    onMove(item.id, placeKey)
    const target = options.find((option) => option.key === placeKey)
    setNotice(`Přesunuto: ${item.name} → ${target?.name ?? placeKey}`)
  }

  // Saves an amount and reports whether it worked. A failed save puts the last saved amount back
  // (the shell does that) and the household is told — the change is never lost without a word.
  async function adjustQuantity(item: PantryItem, quantity: number): Promise<boolean> {
    try {
      await onAdjustQuantity(item.id, quantity)
      return true
    } catch (error) {
      console.error('Saving the pantry quantity failed', error)
      setNotice('Množství se nepodařilo uložit. Zkuste to prosím znovu.')
      return false
    }
  }

  // The household's own notes about an item, as they appear on the cell.
  function statusesFor(item: PantryItem): { label: string; tone: 'accent' | 'warning' }[] {
    const statuses: { label: string; tone: 'accent' | 'warning' }[] = []
    if (likelyGone.has(item.id)) statuses.push({ label: 'Asi došlo', tone: 'warning' })
    else if (item.askedAt) statuses.push({ label: 'Máte ještě?', tone: 'accent' })
    if (item.productTypeKey != null && restockTypeKeys?.has(item.productTypeKey)) statuses.push({ label: 'Dokoupit', tone: 'accent' })
    return statuses
  }

  // The item keeps the household's choice at once; only the shared catalog may hold it back for an
  // administrator when the product has been moved many times, which the household is told about.
  async function setSubcategory(item: PantryItem, subcategory: string | null) {
    try {
      const outcome = await onSetSubcategory(item.id, subcategory)
      if (outcome === 'pending') setNotice(`Podkategorie u „${item.name}“ je uložená u vás. Ve sdíleném katalogu ji musí schválit správce, protože se produkt už několikrát přesouval.`)
    } catch (error) {
      console.error('Setting the pantry subcategory failed', error)
      setNotice('Podkategorii se nepodařilo uložit. Zkuste to prosím znovu.')
    }
  }

  async function setCategory(item: PantryItem, category: ItemCategory) {
    try {
      const outcome = await onSetCategory(item.id, category)
      if (outcome === 'locked') setNotice(`Kategorie u „${item.name}“ je pevně daná, správce ji už rozhodl. Nelze ji změnit.`)
      else if (outcome === 'pending') setNotice(`Kategorie u „${item.name}“ je uložená u vás. Ve sdíleném katalogu ji musí schválit správce, protože se produkt už několikrát přesouval.`)
    } catch (error) {
      console.error('Setting the pantry category failed', error)
      setNotice('Kategorii se nepodařilo uložit. Zkuste to prosím znovu.')
    }
  }

  async function setProductType(item: PantryItem, productTypeKey: string | null) {
    try {
      await onSetProductType(item.id, productTypeKey)
    } catch (error) {
      console.error('Setting the pantry product type failed', error)
      setNotice('Druh produktu se nepodařilo uložit. Zkuste to prosím znovu.')
    }
  }

  const totalUncategorized =items.filter((item) => !item.subcategory && subcategoriesOfItem(item.category).length > 0).length
  const [categorizing, setCategorizing] = useState(false)
  async function autoCategorize() {
    setCategorizing(true)
    try {
      const placed = await onAutoCategorize()
      setNotice(placed > 0 ? `Zařazeno automaticky: ${itemCountLabel(placed)}. Zbytek zařaďte ručně u položky.` : 'Nic se nepodařilo zařadit automaticky. Zařaďte položky ručně.')
    } catch (error) {
      console.error('Auto-categorizing the pantry failed', error)
      setNotice('Automatické zařazení se nepodařilo. Zkuste to prosím znovu.')
    } finally {
      setCategorizing(false)
    }
  }

  function closeReview(result: PantryReviewResult | null) {
    setReviewing(null)
    if (!result) return
    const parts = [`došlo ${itemCountLabel(result.removed)}`, `potvrzeno ${itemCountLabel(result.confirmed)}`]
    if (result.adjusted > 0) parts.push(`množství upraveno ${itemCountLabel(result.adjusted)}`)
    if (result.addedToList > 0) parts.push(`na seznam ${itemCountLabel(result.addedToList)}`)
    setNotice(`Kontrola uložena: ${parts.join(', ')}.${result.listFailed ? ' Některé položky se nepodařilo přidat na nákupní seznam — přidejte je prosím ručně.' : ''}`)
  }

  return (
    <div className="space-y-4">
      {toCheck > 0 && !reviewing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-subtle px-4 py-3">
          <p className="min-w-0 text-sm">
            Máte je ještě? K ověření: <span className="font-semibold">{itemCountLabel(toCheck)}</span>
          </p>
          <Button
            onClick={() => {
              setReviewing('uncertain')
              setNotice(null)
            }}
          >
            Zkontrolovat
          </Button>
        </div>
      )}
      {duplicates.length > 0 && !reviewing && (
        <div className="flex items-start gap-2 rounded-2xl bg-warning-subtle px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0">
            Na více místech: <span className="font-medium text-foreground">{duplicates.map((entry) => entry.name).join(', ')}</span>. Zkontrolujte, zda nejde o duplicitu.
          </p>
        </div>
      )}
      {/* Keep locations visible even when the household has no stock, so users can open empty
          folders and see newly added custom places immediately after clearing their data. */}
      <nav aria-label="Umístění zásob" className="grid grid-cols-3 gap-2 sm:gap-3">
        {options.map((option) => {
          const Icon = iconFor(option)
          const { count, needsCheck, outOfStock } = summary[option.key]
          const active = option.key === selected
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelected(option.key)
                setSubcategoryFilter(null)
                setPage(1)
                setNotice(null)
              }}
              className={cn(
                // Three places per row at every width. On a phone a tile is only ~110 px wide, so the icon sits
                // above the name and count (centred); from `sm` up the icon goes beside them again.
                'grid min-w-0 grid-cols-1 content-start justify-items-center gap-y-1.5 rounded-2xl border-2 p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[auto_1fr] sm:items-center sm:justify-items-stretch sm:gap-x-2.5 sm:p-3 sm:text-left',
                // Active = turquoise outline + tinted tile, not a solid slab (it would dominate the screen in dark mode).
                active ? 'border-accent-solid bg-accent-subtle' : 'border-transparent bg-card shadow-[var(--shadow-card)] hover:bg-muted',
              )}
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', active ? 'bg-accent-solid text-accent-solid-foreground' : 'bg-muted text-accent-text')}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 max-w-full">
                <span className="block break-words text-sm font-semibold leading-tight">{option.name}</span>
                <span className="block text-xs text-fg-muted">{itemCountLabel(count)}</span>
              </span>
              {(needsCheck > 0 || outOfStock > 0) && (
                <span className="flex flex-wrap justify-center gap-1 sm:col-span-2 sm:justify-start">
                  {needsCheck > 0 && (
                    <Badge tone="accent" className="py-0.5">
                      Ověřit: {needsCheck}
                    </Badge>
                  )}
                  {outOfStock > 0 && (
                    <Badge tone="warning" className="py-0.5">
                      Došlo: {outOfStock}
                    </Badge>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {!reviewing && totalUncategorized > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
          <p className="min-w-0 text-sm">
            Bez podkategorie: <span className="font-semibold">{itemCountLabel(totalUncategorized)}</span>
          </p>
          <Button variant="outline" onClick={autoCategorize} disabled={categorizing}>
            {categorizing ? 'Zařazuji…' : 'Zařadit automaticky'}
          </Button>
        </div>
      )}

      {!reviewing && (subcategoryCounts.counts.size > 1 || (subcategoryCounts.counts.size === 1 && subcategoryCounts.uncategorized > 0)) && (
        // Subcategory folders within the open location (spec sections 17-18) — only shown when
        // there's more than one group to actually filter by, so a location with a single kind of
        // item (or none categorized yet) keeps the simpler flat list.
        <SegmentedControl
          label={`Podkategorie v umístění ${selectedOption.name}`}
          value={subcategoryFilter ?? ALL_SUBCATEGORIES}
          onChange={(value) => {
            setSubcategoryFilter(value === ALL_SUBCATEGORIES ? null : value)
            setPage(1)
          }}
          options={[
            { value: ALL_SUBCATEGORIES, label: `Vše (${itemsInLocation.length})` },
            ...[...subcategoryCounts.counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'cs')).map(([name, count]) => ({ value: name, label: `${name} (${count})` })),
            ...(subcategoryCounts.uncategorized > 0 ? [{ value: UNCATEGORIZED, label: `Nezařazeno (${subcategoryCounts.uncategorized})` }] : []),
          ]}
        />
      )}

      {reviewing ? (
        <PantryReview items={items} customPlaces={customPlaces} hiddenLocations={hiddenLocations} placeKey={selected} placeLabel={selectedOption.name} initialScope={reviewing} estimates={estimates} onSave={onReview} onClose={closeReview} />
      ) : (
      <section aria-label={`Zásoby: ${selectedOption.name}`} className="overflow-hidden surface">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <SelectedIcon className="size-4 shrink-0 text-accent-text" aria-hidden />
            <h2 className="min-w-0 text-sm font-semibold">{items.length === 0 ? 'Zásoby' : selectedOption.name}</h2>
            {items.length > 0 && <span className="shrink-0 text-sm text-fg-muted">{itemCountLabel(selectedItems.length)}</span>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {consumedInLocation > 0 && (
              <Button variant="ghost" onClick={() => setShowConsumed((current) => !current)}>
                {showConsumed ? 'Skrýt spotřebované' : `Zobrazit spotřebované (${consumedInLocation})`}
              </Button>
            )}
            <Button
              onClick={() => {
                setAdding(true)
                setNotice(null)
              }}
            >
              <Plus aria-hidden /> Přidat
            </Button>
            {items.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setReviewing('location')
                  setNotice(null)
                }}
              >
                <ClipboardCheck aria-hidden /> Zkontrolovat
              </Button>
            )}
          </div>
        </div>

        <p role="status" aria-live="polite" className={notice ? 'border-b border-border bg-accent-subtle px-5 py-2.5 text-sm text-accent-text' : 'sr-only'}>
          {notice ?? ''}
        </p>

        {selectedItems.length === 0 && (
          <EmptyState
            className="m-4 bg-transparent"
            icon={<Package />}
            title={items.length === 0 ? 'Zásoby jsou prázdné' : consumedInLocation > 0 && !showConsumed ? `V umístění „${selectedOption.name}“ nic není, jen ${itemCountLabel(consumedInLocation)} spotřebovaných` : `V umístění „${selectedOption.name}“ zatím nic není`}
            description={
              items.length === 0
                ? 'Zásoby se plní samy, když nahrajete účtenku, nebo je přidáte ručně tlačítkem „Přidat“.'
                : consumedInLocation > 0 && !showConsumed
                  ? 'Spotřebované položky zůstávají v zásobách — jejich záznam má svou historii. Zobrazíte je tlačítkem „Zobrazit spotřebované“.'
                  : 'Položky se sem přidají z účtenky nebo ručně, případně je sem přesunete z jiného umístění.'
            }
            action={
              items.length === 0 && (onReceipts || onShopping) ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {onReceipts && (
                    <Button size="lg" onClick={onReceipts}>
                      Nahrát účtenku
                    </Button>
                  )}
                  {onShopping && (
                    <Button variant="outline" size="lg" onClick={onShopping}>
                      Otevřít nákupní seznam
                    </Button>
                  )}
                </div>
              ) : undefined
            }
          />
        )}

        {pagedItems.length > 0 && (
          // The stock as a grid of product cells: two columns on a phone, more as the screen grows.
          // Everything the household changes often — the amount, whether they still have it — is in
          // the cell; the rest waits in the detail.
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {pagedItems.map((item) => (
              <PantryCard
                key={item.id}
                item={item}
                statuses={statusesFor(item)}
                onAdjustQuantity={(id, quantity) => void adjustQuantity(item, quantity)}
                onOpen={(opened) => setDetailId(opened.id)}
              />
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-5 py-4">
            <Pager page={currentPage} totalPages={totalPages} onChange={setPage} label={`Stránkování zásob: ${selectedOption.name}`} />
          </div>
        )}
      </section>
      )}
      {detailItem && (
        <PantryDetail
          item={detailItem}
          placeOptions={options}
          estimate={likelyGone.has(detailItem.id) ? estimateReason(estimates.get(detailItem.id)!) : undefined}
          onClose={() => setDetailId(null)}
          onAdjustQuantity={(quantity) => adjustQuantity(detailItem, quantity)}
          onMove={(placeKey) => {
            move(detailItem, placeKey)
            setDetailId(null)
          }}
          onSetTracking={(tracking) => onSetTracking(detailItem.id, tracking)}
          onSetCategory={(category) => void setCategory(detailItem, category)}
          onSetSubcategory={(subcategory) => void setSubcategory(detailItem, subcategory)}
          onSetProductType={(productTypeKey) => setProductType(detailItem, productTypeKey)}
          onAdjustContent={(contentId, quantity, expectedQuantity) => onAdjustContent(contentId, quantity, expectedQuantity)}
          onConfirm={() => {
            onConfirm(detailItem.id)
            setDetailId(null)
          }}
          onRemove={() => {
            onRemove(detailItem.id)
            setDetailId(null)
          }}
        />
      )}
      {adding && (
        <PantryAddModal
          customPlaces={customPlaces}
          hiddenLocations={hiddenLocations}
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            await onAddPantryItem(input)
            setNotice('Přidáno do zásob. Do rozpočtu se nic nezapočítává.')
          }}
        />
      )}
    </div>
  )
}
