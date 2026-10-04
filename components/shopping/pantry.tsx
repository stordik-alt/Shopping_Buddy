import { AlertTriangle, BriefcaseMedical, Car, Cat, Check, ChevronDown, ClipboardCheck, House, Minus, Package, PackageSearch, Plus, Refrigerator, Snowflake, SprayCan, Warehouse, Wheat, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Pager } from '@/components/shared/pager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PantryAddModal, type PantryAddInput } from '@/components/shopping/pantry-add-modal'
import { PantryReview, type PantryReviewResult } from '@/components/shopping/pantry-review'
import { itemCountLabel } from '@/lib/format'
import { findDuplicatePlacements, needsCheck, PANTRY_PAGE_SIZE, PANTRY_TRACKING, pantryPlaceOptions, placeKeyOf, summarizeByPlace, type PantryPlaceOption } from '@/lib/pantry'
import { estimateReason, type ConsumptionEstimate } from '@/lib/pantry-estimate'
import { clampPage, pageCount } from '@/lib/paging'
import type { CatalogChangeOutcome, CategoryChangeOutcome } from '@/lib/product-subcategory-changes'
import { PRODUCT_SUBCATEGORIES, subcategoriesOfItem } from '@/lib/product-subcategories'
import { cn } from '@/lib/utils'
import type { ItemCategory, ItemUnit, PantryArea, PantryItem, PantryLocation, PantryPlace, PantryTracking } from '@/lib/types'

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

// −/+ step size: whole units for "ks" (you don't buy 0.3 of a countable item), a tenth for
// weight/volume units — matches how the household would actually type a correction (section 7).
const STEP_BY_UNIT: Record<ItemUnit, number> = { ks: 1, kg: 0.1, g: 10, l: 0.1, ml: 10 }

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** The −/+/exact-value quantity control for one pantry row. Keeps its own draft text while the
 *  household is typing an exact amount (e.g. "1.5" for kg), only committing on blur/Enter so a
 *  half-typed decimal isn't clamped mid-keystroke; the +/- buttons commit immediately since
 *  there's nothing to type. Quantity is clamped to 0 client-side too (defense in depth — the
 *  server, `adjustPantryItemQuantityAction`, is the actual authority and rejects negative values
 *  regardless). */
function QuantityStepper({ quantity, unit, onChange }: { quantity: number; unit: ItemUnit; onChange: (quantity: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const step = STEP_BY_UNIT[unit]

  function commit(raw: string) {
    setDraft(null)
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== quantity) onChange(round3(parsed))
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Ubrat ${unit}`}
        onClick={() => onChange(Math.max(0, round3(quantity - step)))}
        className="flex size-11 items-center justify-center rounded-xl border border-input text-fg-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        disabled={quantity <= 0}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input
        aria-label={`Množství (${unit})`}
        type="number"
        min="0"
        step="any"
        value={draft ?? quantity}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
        className="h-11 w-16 rounded-xl border border-input bg-background px-1 text-center text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <span className="min-w-6 text-sm text-fg-muted">{unit}</span>
      <button
        type="button"
        aria-label={`Přidat ${unit}`}
        onClick={() => onChange(round3(quantity + step))}
        className="flex size-11 items-center justify-center rounded-xl border border-input text-fg-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Household stock ("zásoby") — what the household believes it currently has at home, restocked
 *  automatically by completePurchaseAction/importReceiptAction and periodically re-checked by the
 *  pantry-checkin cron (lib/pantry.ts). Deliberately not one long list: the storage locations are
 *  the primary navigation (a folder tile each, with icon, name, item count and warnings), and only
 *  the opened location's items are shown below — like a file manager for the home.
 *
 *  A row whose askedAt is set is one the cron just asked the household about, so it's highlighted
 *  until the household confirms ("Ještě mám") or removes it ("Došlo"). The location select on each
 *  row moves the item between *any* of the locations (e.g. chilled meat into the freezer). The
 *  quantity stepper lets them correct current stock directly without ever touching purchase
 *  history. "Zkontrolovat" opens the bulk check (components/shopping/pantry-review.tsx): tap only
 *  what ran out, save once, and everything else is confirmed. */
const ITEM_CATEGORY_NAMES = Object.keys(PRODUCT_SUBCATEGORIES) as ItemCategory[]

export function Pantry({
  items,
  onAddPantryItem,
  customPlaces,
  onConfirm,
  onRemove,
  onMove,
  onAdjustQuantity,
  onReview,
  onSetTracking,
  onSetSubcategory,
  onSetCategory,
  onAutoCategorize,
  estimates,
  openCheck = false,
  onCheckOpened,
  onShopping,
  onReceipts,
  initialPlace,
}: {
  items: PantryItem[]
  onAddPantryItem: (input: PantryAddInput) => Promise<PantryItem[]>
  /** The household's own places, beyond the fixed locations (Profil domácnosti → Zásoby). */
  customPlaces: PantryPlace[]
  onConfirm: (id: string) => void
  onRemove: (id: string) => void
  /** `place` is a `PantryPlaceOption.key` — a fixed location name, or `custom:<id>`. */
  onMove: (id: string, place: string) => void
  onAdjustQuantity: (id: string, quantity: number) => void
  /** Saves a bulk check; resolves to what was done, rejects when nothing was saved. */
  onReview: (reviewedIds: string[], goneIds: string[], addGoneToList: boolean) => Promise<PantryReviewResult>
  /** How closely an item is watched: normal, rarely (salt, spices), not at all. */
  onSetTracking: (id: string, tracking: PantryTracking) => void
  /** Sets an item's subcategory by hand; null clears it. */
  onSetSubcategory: (id: string, subcategory: string | null) => Promise<CatalogChangeOutcome | 'none'> | void
  onSetCategory: (id: string, category: ItemCategory) => Promise<CategoryChangeOutcome | void> | void
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
  /** The place to open on (a link from Domů to where something ran out); a place key as in onMove. */
  initialPlace?: string
}) {
  const options = useMemo(() => pantryPlaceOptions(customPlaces), [customPlaces])
  const likelyGone = useMemo(() => new Set([...estimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id)), [estimates])
  const summary = summarizeByPlace(items, options, likelyGone)
  // Open on the first place that has something in it rather than on an empty folder.
  const [selected, setSelected] = useState<string>(() =>
    initialPlace && options.some((option) => option.key === initialPlace) ? initialPlace : (options.find((option) => summary[option.key].count > 0)?.key ?? options[0].key),
  )
  // Announces a move: the moved row leaves the open folder, so without this it would just vanish.
  const [notice, setNotice] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
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
  const selectedItems = subcategoryFilter
    ? itemsInLocation.filter((item) => (subcategoryFilter === UNCATEGORIZED ? !item.subcategory : item.subcategory === subcategoryFilter))
    : itemsInLocation
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
      <nav aria-label="Umístění zásob" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
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
                // Compact row tiles (icon beside name and count) so the six places do not fill a phone's first screen.
                'grid min-w-0 grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 rounded-2xl border-2 p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-3',
                // Active = turquoise outline + tinted tile, not a solid slab (it would dominate the screen in dark mode).
                active ? 'border-accent-solid bg-accent-subtle' : 'border-transparent bg-card shadow-[var(--shadow-card)] hover:bg-muted',
              )}
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', active ? 'bg-accent-solid text-accent-solid-foreground' : 'bg-muted text-accent-text')}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold leading-tight">{option.name}</span>
                <span className="block text-xs text-fg-muted">{itemCountLabel(count)}</span>
              </span>
              {(needsCheck > 0 || outOfStock > 0) && (
                <span className="col-span-2 flex flex-wrap gap-1">
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
        <PantryReview items={items} customPlaces={customPlaces} placeKey={selected} placeLabel={selectedOption.name} initialScope={reviewing} estimates={estimates} onSave={onReview} onClose={closeReview} />
      ) : (
      <section aria-label={`Zásoby: ${selectedOption.name}`} className="overflow-hidden surface">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <SelectedIcon className="size-4 shrink-0 text-accent-text" aria-hidden />
            <h2 className="min-w-0 text-sm font-semibold">{selectedOption.name}</h2>
            <span className="shrink-0 text-sm text-fg-muted">{itemCountLabel(selectedItems.length)}</span>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
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
            title={items.length === 0 ? 'Zásoby jsou prázdné' : `V umístění „${selectedOption.name}“ zatím nic není`}
            description={
              items.length === 0
                ? 'Zásoby se plní samy, když dokončíte nákup nebo nahrajete účtenku.'
                : 'Položky se sem přidají po dokončení nákupu nebo je sem přesunete z jiného umístění.'
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

        {pagedItems.map((item) => (
          // At a glance only what the household acts on: name, state, amount, "Ještě mám" / "Došlo".
          // Corrections (category, subcategory, place, tracking) sit behind "Upravit" — still in the
          // page (a native <details>), just not competing for attention on every row.
          <div key={item.id} className="border-b border-border px-4 py-3 last:border-0 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words font-medium">{item.name}</span>
                  {likelyGone.has(item.id) ? (
                    <Badge tone="warning" className="py-0.5">
                      Asi došlo
                    </Badge>
                  ) : (
                    item.askedAt && (
                      <Badge tone="accent" className="py-0.5">
                        Máte ještě?
                      </Badge>
                    )
                  )}
                </span>
                <span className="mt-1 block text-xs text-fg-muted">
                  {item.category}
                  {item.subcategory ? ` ▸ ${item.subcategory}` : ''}
                  {likelyGone.has(item.id) && ` · ${estimateReason(estimates.get(item.id)!)}`}
                </span>
              </div>
              <QuantityStepper quantity={item.quantity} unit={item.unit} onChange={(quantity) => onAdjustQuantity(item.id, quantity)} />
              {/* Grouped so the two icon buttons wrap onto a new line together on a narrow phone, not one by one. */}
              <div className="ml-auto flex items-center">
                <button type="button" aria-label={`Ještě mám: ${item.name}`} onClick={() => onConfirm(item.id)} className="icon-button hover:!bg-success-subtle hover:!text-success">
                  <Check className="size-5" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Došlo: ${item.name}`} onClick={() => onRemove(item.id)} className="icon-button hover:!bg-destructive-subtle hover:!text-destructive">
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            <details className="group mt-1">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-lg text-sm font-medium text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                Upravit <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-2 grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Kategorie</span>
                  <Select aria-label={`Kategorie ${item.name}`} value={item.category} onChange={(event) => void setCategory(item, event.target.value as ItemCategory)}>
                    {ITEM_CATEGORY_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </label>
                {/* Only categories with a fixed subcategory list get the select (all do today). */}
                {subcategoriesOfItem(item.category).length > 0 && (
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>Podkategorie</span>
                    <Select aria-label={`Podkategorie ${item.name}`} value={item.subcategory ?? ''} onChange={(event) => void setSubcategory(item, event.target.value || null)}>
                      <option value="">Nezařazeno</option>
                      {subcategoriesOfItem(item.category).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Umístění</span>
                  <Select aria-label={`Umístění ${item.name}`} value={placeKeyOf(item)} onChange={(event) => move(item, event.target.value)}>
                    {options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </label>
                {/* Salt, spices or oil need no weekly question: "Jen zřídka" asks every few months,
                    "Nesledovat" never, and neither is ever estimated as used up. */}
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Sledování</span>
                  <Select aria-label={`Sledování ${item.name}`} value={item.tracking ?? 'normal'} onChange={(event) => onSetTracking(item.id, event.target.value as PantryTracking)}>
                    {PANTRY_TRACKING.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </details>
          </div>
        ))}
        {totalPages > 1 && (
          <div className="px-5 py-4">
            <Pager page={currentPage} totalPages={totalPages} onChange={setPage} label={`Stránkování zásob: ${selectedOption.name}`} />
          </div>
        )}
      </section>
      )}
      {adding && (
        <PantryAddModal
          customPlaces={customPlaces}
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
