import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Pantry } from '@/components/shopping/pantry'
import { PANTRY_PAGE_SIZE } from '@/lib/pantry'
import type { PantryItem, PantryPlace } from '@/lib/types'

const noop = () => {}
const noopAsync = async () => ({ removed: 0, confirmed: 0, addedToList: 0, listFailed: false })

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
      customPlaces={customPlaces}
      onConfirm={noop}
      onRemove={noop}
      onMove={noop}
      onAdjustQuantity={noop}
      onReview={noopAsync}
      onSetTracking={noop}
      onSetSubcategory={noop}
      onAutoCategorize={async () => 0}
      estimates={new Map()}
    />,
  )
}

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

describe('Pantry subcategory assignment', () => {
  it('offers a subcategory select on every row and the auto-categorize button when items are uncategorized', () => {
    const html = renderPantry([item(1), { ...item(2), subcategory: 'Pečivo' }])
    expect(html).toContain('Podkategorie Položka 1')
    expect(html).toContain('Zařadit automaticky')
    expect(html).toContain('Bez podkategorie')
  })

  it('hides the auto-categorize banner once everything has a subcategory', () => {
    const html = renderPantry([{ ...item(1), subcategory: 'Pečivo' }])
    expect(html).not.toContain('Zařadit automaticky')
  })
})

describe('Pantry custom places', () => {
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
