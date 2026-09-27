import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Pantry } from '@/components/shopping/pantry'
import { PANTRY_PAGE_SIZE } from '@/lib/pantry'
import type { PantryItem } from '@/lib/types'

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

function renderPantry(items: PantryItem[]) {
  return renderToStaticMarkup(
    <Pantry
      items={items}
      onConfirm={noop}
      onRemove={noop}
      onMove={noop}
      onAdjustQuantity={noop}
      onReview={noopAsync}
      onSetTracking={noop}
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
