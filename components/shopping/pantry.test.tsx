import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Pantry } from '@/components/shopping/pantry'
import { PantryReview } from '@/components/shopping/pantry-review'
import { PANTRY_PAGE_SIZE } from '@/lib/pantry'
import type { PantryItem, PantryPlace } from '@/lib/types'

const noop = () => {}
const noopAsync = async () => ({ removed: 0, confirmed: 0, adjusted: 0, addedToList: 0, listFailed: false })
const noopQuantity = async () => {}

const item = (n: number): PantryItem => ({
  id: `p${n}`,
  name: `Položka ${n}`,
  category: 'Potraviny',
  location: 'Spíž',
  quantity: 1,
  unit: 'ks',
  addedAt: '2026-09-01T00:00:00.000Z',
})

function renderPantry(items: PantryItem[], customPlaces: PantryPlace[] = []) {
  return renderToStaticMarkup(
    <Pantry
      items={items}
      onAddPantryItem={async () => items}
      customPlaces={customPlaces}
      onConfirm={noop}
      onRemove={noop}
      onMove={noop}
      onAdjustQuantity={noopQuantity}
      onReview={noopAsync}
      onSetTracking={noop}
      onSetSubcategory={noop}
      onSetCategory={noop}
      onSetProductType={async () => {}}
      onAdjustContent={async () => true}
      onAutoCategorize={async () => 0}
      estimates={new Map()}
    />,
  )
}

describe('Pantry header', () => {
  it('keeps the location title and count together and puts actions in a separate mobile row', () => {
    const html = renderPantry([item(1)])
    expect(html).toContain('Spíž')
    expect(html).toContain('1 položka')
    expect(html).toContain('Přidat')
    expect(html).toContain('Zkontrolovat')
    expect(html).toContain('flex flex-col gap-3')
    expect(html).toContain('sm:flex-row')
  })
})

describe('Pantry with no stock', () => {
  it('shows the empty state and all fixed locations even when there is no stock', () => {
    const html = renderPantry([])
    expect(html).toContain('Zásoby jsou prázdné')
    expect(html).toContain('Přidat')
    expect(html).toContain('Umístění zásob')
    expect(html).toContain('0 položek')
    expect(html).toContain('Spíž')
    expect(html).toContain('Lednice')
    // The truthful way stock appears: from a receipt or by hand (finishing a shopping trip adds none).
    expect(html).not.toContain('po dokončení nákupu')
  })

  it('shows the places as soon as there is any stock', () => {
    const html = renderPantry([item(1)])
    expect(html).toContain('Umístění zásob')
    expect(html).toContain('Lednice')
  })
})

describe('Pantry pagination', () => {
  it('shows every item and no pager when a folder has one page or fewer', () => {
    const items = Array.from({ length: PANTRY_PAGE_SIZE }, (_, i) => item(i + 1))
    const html = renderPantry(items)
    for (const entry of items) expect(html).toContain(entry.name)
    expect(html).not.toContain('Stránkování zásob')
  })

  it('shows only the first page of items, plus a pager, when a folder has more than one page', () => {
    const items = Array.from({ length: PANTRY_PAGE_SIZE + 3 }, (_, i) => item(i + 1))
    const html = renderPantry(items)
    for (const entry of items.slice(0, PANTRY_PAGE_SIZE)) expect(html).toContain(entry.name)
    for (const entry of items.slice(PANTRY_PAGE_SIZE)) expect(html).not.toContain(entry.name)
    expect(html).toContain('Stránkování zásob')
    expect(html).toContain('1/2')
  })
})

describe('Pantry duplicate-placement banner', () => {
  it('warns when the same item name is kept at more than one place', () => {
    const html = renderPantry([{ ...item(1), name: 'Mléko', location: 'Lednice' }, { ...item(2), name: 'Mléko', location: 'Mrazák' }])
    expect(html).toContain('Na více místech')
    expect(html).toContain('Mléko')
  })

  it('says nothing when every item is kept at exactly one place', () => {
    const html = renderPantry([item(1), item(2)])
    expect(html).not.toContain('Na více místech')
  })
})

describe('Pantry product cells', () => {
  it('shows every product as a cell with its name, amount and availability', () => {
    const html = renderPantry([item(1)])
    expect(html).toContain('data-testid="pantry-card"')
    expect(html).toContain('Položka 1')
    expect(html).toContain('data-testid="pantry-quantity"')
    expect(html).toContain('Mám')
    expect(html).toContain('aria-label="Otevřít detail: Položka 1"')
    expect(html).toContain('aria-label="Přidat ks (Položka 1)"')
    expect(html).toContain('aria-label="Ubrat ks (Položka 1)"')
  })

  it('writes the availability out instead of only colouring it', () => {
    const html = renderPantry([{ ...item(1), quantity: 0 }])
    expect(html).toContain('Nemám')
    expect(html).toContain('aria-label="Dostupnost: Položka 1"')
  })

  it('gives every cell the same size, whatever the product', () => {
    const html = renderPantry([item(1), { ...item(2), name: 'Extra premium italské olivové oleje panské extra virgin 0,5 l' }])
    expect(html).toContain('line-clamp-2')
    expect(html).toContain('grid-cols-2')
  })
})

describe('Pantry subcategory assignment', () => {
  it('offers the auto-categorize button when items are uncategorized', () => {
    const html = renderPantry([item(1), { ...item(2), subcategory: 'Pečivo' }])
    expect(html).toContain('Zařadit automaticky')
    expect(html).toContain('Bez podkategorie')
  })

  // The corrections (category, subcategory, place, tracking) live in the detail, so a cell stays
  // one picture, one name, one amount.
  it('keeps the corrections out of the grid', () => {
    const html = renderPantry([{ ...item(1), category: 'Ostatní' }])
    expect(html).not.toContain('aria-label="Upravit: Položka 1"')
    expect(html).not.toContain('aria-expanded="false"')
  })

  it('hides the auto-categorize banner once everything has a subcategory', () => {
    const html = renderPantry([{ ...item(1), subcategory: 'Pečivo' }])
    expect(html).not.toContain('Zařadit automaticky')
  })
})

describe('Pantry custom places', () => {
  it('shows a newly added custom place even when the household has no stock', () => {
    const place: PantryPlace = { id: 'place-1', area: 'Auto', name: 'Kufr auta' }
    const html = renderPantry([], [place])
    expect(html).toContain('Umístění zásob')
    expect(html).toContain('Kufr auta')
    expect(html).toContain('0 položek')
  })

  it('shows a household custom place as its own folder tile, named and counted', () => {
    const place: PantryPlace = { id: 'place-1', area: 'Auto', name: 'Kufr auta' }
    const inCustomPlace: PantryItem = { ...item(1), customPlaceId: 'place-1' }
    const html = renderPantry([inCustomPlace, item(2)], [place])
    expect(html).toContain('Kufr auta')
  })

  it('opens on a folder with stock, preferring a custom place\'s items if the fixed ones are empty', () => {
    const place: PantryPlace = { id: 'place-1', area: 'Auto', name: 'Kufr auta' }
    const inCustomPlace: PantryItem = { ...item(1), customPlaceId: 'place-1' }
    const html = renderPantry([inCustomPlace], [place])
    expect(html).toContain(`Zásoby: Kufr auta`)
    expect(html).toContain(inCustomPlace.name)
  })
})

describe('PantryReview remaining amounts', () => {
  const render = (estimates = new Map()) =>
    renderToStaticMarkup(
      <PantryReview items={[{ ...item(1), quantity: 4 }, item(2)]} customPlaces={[]} placeKey="Spíž" placeLabel="Spíž" estimates={estimates} onSave={noopAsync} onClose={noop} />,
    )

  it('offers −/+ for what is left on every item that stays', () => {
    const html = render()
    expect(html).toContain('aria-label="Méně: Položka 1"')
    expect(html).toContain('aria-label="Více: Položka 1"')
    expect(html).toContain('4 ks')
  })

  it('has no amount control on an item that starts as ran out', () => {
    const html = render(new Map([['p1', { likelyGone: true, daysSince: 30, typicalDays: 7 } as never]]))
    expect(html).not.toContain('Méně: Položka 1')
    expect(html).toContain('Méně: Položka 2')
  })
})
