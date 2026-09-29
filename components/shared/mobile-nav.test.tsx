import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MobileNav } from '@/components/shared/mobile-nav'
import { PurchaseHistory } from '@/components/budget/purchase-history'
import type { Tab } from '@/lib/types'

const render = (tab: Tab) => renderToStaticMarkup(<MobileNav tab={tab} onTabChange={() => {}} />)

describe('MobileNav', () => {
  it('shows five slots: four sections and "Více"', () => {
    const html = render('Domů')
    expect(html.match(/<button/g)).toHaveLength(5)
    for (const label of ['Domů', 'Nákup', 'Zásoby', 'Rozpočet', 'Více']) expect(html).toContain(`>${label}<`)
    expect(html).not.toContain('>Akce<')
  })

  it('marks the slot of the open section, and "Více" for a section behind it', () => {
    expect(render('Zásoby').match(/aria-current="page"/g)).toHaveLength(1)
    const more = render('Obchody')
    expect(more.match(/aria-current="page"/g)).toHaveLength(1)
    expect(more.indexOf('aria-current="page"')).toBeGreaterThan(more.indexOf('>Rozpočet<'))
  })
})

describe('PurchaseHistory empty state', () => {
  it('explains how purchases appear and offers the receipt upload', () => {
    const html = renderToStaticMarkup(<PurchaseHistory records={[]} onSaveSplits={async () => {}} onRecordExpenses={async () => {}} onUploadReceipt={() => {}} />)
    expect(html).toContain('Zatím tu není žádný nákup')
    expect(html).toContain('Nahrát účtenku')
  })
})
