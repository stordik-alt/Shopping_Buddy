import { describe, expect, it } from 'vitest'
import { matchReceiptToList, normalizeMatchName } from './receipt-list-match'

const list = (id: string, name: string, productId: string | null = null) => ({ id, name, productId })
const line = (id: string, name: string, productId: string | null = null) => ({ id, name, productId })

describe('normalizeMatchName', () => {
  it('ignores case, diacritics and punctuation', () => {
    expect(normalizeMatchName('Mléko, polotučné!')).toBe('mleko polotucne')
    expect(normalizeMatchName('  MLEKO   POLOTUCNE ')).toBe('mleko polotucne')
  })
})

describe('matchReceiptToList', () => {
  it('matches the same catalog product with certainty even when the names differ', () => {
    const result = matchReceiptToList([list('l1', 'Mléko', 'p1')], [line('r1', 'MLEKO POLOTUC. 1L', 'p1')])
    expect(result.certain).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
    expect(result.suggested).toEqual([])
  })

  it('matches equal names with certainty regardless of case and diacritics', () => {
    const result = matchReceiptToList([list('l1', 'Máslo')], [line('r1', 'MASLO')])
    expect(result.certain).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
  })

  it('only suggests when the list item is contained in a longer receipt line', () => {
    const result = matchReceiptToList([list('l1', 'Mléko')], [line('r1', 'MLEKO POLOTUC. 1L')])
    expect(result.certain).toEqual([])
    expect(result.suggested).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
  })

  it('prefers the closest line for a suggestion', () => {
    const result = matchReceiptToList([list('l1', 'Mléko')], [line('r1', 'MLEKO POLOTUC. 1L BIO'), line('r2', 'MLEKO 1L')])
    expect(result.suggested).toEqual([{ listItemId: 'l1', purchaseItemId: 'r2' }])
  })

  it('tolerates word endings but not unrelated short words', () => {
    expect(matchReceiptToList([list('l1', 'Jablka')], [line('r1', 'JABLKO ZLATE')]).suggested).toHaveLength(1)
    expect(matchReceiptToList([list('l1', 'Sůl')], [line('r1', 'SULC')]).suggested).toEqual([])
  })

  it('does not match unrelated products', () => {
    const result = matchReceiptToList([list('l1', 'Mléko')], [line('r1', 'CHLEB PSENICNY'), line('r2', 'SYR EIDAM')])
    expect(result).toEqual({ certain: [], suggested: [] })
  })

  it('uses a receipt line for at most one list item', () => {
    const result = matchReceiptToList([list('l1', 'Mléko', 'p1'), list('l2', 'Mléko')], [line('r1', 'MLEKO', 'p1')])
    expect(result.certain).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
    expect(result.suggested).toEqual([])
  })

  it('does not treat two different products as one just because their ids are both missing', () => {
    const result = matchReceiptToList([list('l1', 'Sýr')], [line('r1', 'Jogurt')])
    expect(result.certain).toEqual([])
  })

  it('leaves unmatched list items alone', () => {
    const result = matchReceiptToList([list('l1', 'Mléko', 'p1'), list('l2', 'Vejce')], [line('r1', 'Mléko', 'p1')])
    expect(result.certain.map((pair) => pair.listItemId)).toEqual(['l1'])
    expect(result.suggested).toEqual([])
  })
})
