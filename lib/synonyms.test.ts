import { describe, expect, it } from 'vitest'
import { isDirectMatch, scoreMatch, searchStems, wordRelationWithSynonyms, DIRECT_BONUS } from '@/lib/product-search'
import { matchKey, matchReceiptToList } from '@/lib/receipt-list-match'
import { canonicalName, canonicalWord, synonymsOf } from '@/lib/synonyms'
import { suggestUsualItems } from '@/lib/usual-items'
import type { PurchaseRecord } from '@/lib/types'

describe('synonym groups', () => {
  it('lists the word first, then its synonyms; a word without a group is alone', () => {
    expect(synonymsOf('vajicka')[0]).toBe('vajicka')
    expect(synonymsOf('vajicka')).toContain('vejce')
    expect(synonymsOf('rohlik')).toEqual(['rohlik'])
  })

  it('folds a name to one representative per group', () => {
    expect(canonicalWord('vajicka')).toBe('vejce')
    expect(canonicalWord('parek')).toBe(canonicalWord('parky'))
    expect(canonicalName('vajicka m 10 ks')).toBe('vejce m 10 ks')
    expect(matchKey('Vajíčka')).toBe(matchKey('VEJCE'))
    expect(matchKey('Mlíko')).toBe(matchKey('mléko'))
  })
})

describe('product search with synonyms', () => {
  it('finds eggs for "vajíčka" and sausages for "párky" as the product itself', () => {
    expect(searchStems('vajicka')).toContain('vejc')
    expect(wordRelationWithSynonyms('vejce', 'vajicka')).toBe('exact') // a synonym's own exact form
    expect(isDirectMatch('vejce m 10 ks', ['vajicka'])).toBe(true)
    expect(scoreMatch('vejce m 10 ks', ['vajicka'])).toBeGreaterThan(DIRECT_BONUS)
    expect(isDirectMatch('parek veprovy', ['parky'])).toBe(true)
    expect(isDirectMatch('mrkev mlada', ['mrkve'])).toBe(true)
  })

  it('keeps the mention rule: a soup with egg is still not eggs', () => {
    expect(isDirectMatch('polevka s vejcem', ['vajicka'])).toBe(false)
  })
})

describe('receipt lines and the list with synonyms', () => {
  it('suggests the receipt line "VEJCE M 10KS" for the list item "Vajíčka"', () => {
    const result = matchReceiptToList([{ id: 'l1', name: 'Vajíčka', productId: null }], [{ id: 'p1', name: 'VEJCE M 10KS', productId: null }])
    expect(result.suggested).toEqual([{ listItemId: 'l1', purchaseItemId: 'p1' }])
    expect(result.certain).toEqual([])
  })
})

describe('purchase history with synonyms', () => {
  const purchase = (date: string, name: string): PurchaseRecord => ({ id: date, date, total: 0, items: [{ name, quantity: 10, unit: 'ks', price: 50 }] })

  it('counts "Vajíčka" and "Vejce" as one regular purchase', () => {
    const purchases = [purchase('2026-09-01', 'Vajíčka'), purchase('2026-09-08', 'Vejce'), purchase('2026-09-15', 'vajicka')]
    const usual = suggestUsualItems({ purchases, today: '2026-09-22', onList: [], inPantry: [] })
    expect(usual).toHaveLength(1)
    expect(usual[0]).toMatchObject({ intervalDays: 7, timesBought: 3 })
    // Already at home under the other name: not suggested.
    expect(suggestUsualItems({ purchases, today: '2026-09-22', onList: [], inPantry: ['Vejce'] })).toEqual([])
  })
})
