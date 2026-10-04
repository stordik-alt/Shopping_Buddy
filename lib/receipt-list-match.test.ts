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

describe('matchReceiptToList by product type (docs/12_PRODUCT_TYPES.md phase 4)', () => {
  const typed = (id: string, name: string, acceptedTypes: string[]) => ({ id, name, productId: null, acceptedTypes })
  const typedLine = (id: string, name: string, key: string | null, fromProduct: boolean, productId: string | null = null) => ({
    id,
    name,
    productId,
    type: key ? { key, fromProduct } : null,
  })
  const chicken = ['kureci-prsa', 'kureci-stehna', 'kure-cele']

  it('ticks with certainty a catalog product of a type the item asks for, whatever its name says', () => {
    const result = matchReceiptToList([typed('l1', 'Kuřecí maso', chicken)], [typedLine('r1', 'VODN. PRSNI RIZKY 500G', 'kureci-prsa', true, 'p9')])
    expect(result.certain).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
  })

  it('only suggests a line whose type was read off its printed text', () => {
    const result = matchReceiptToList([typed('l1', 'Kuřecí maso', chicken)], [typedLine('r1', 'KUR.PRSA 500G', 'kureci-prsa', false)])
    expect(result.certain).toEqual([])
    expect(result.suggested).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
  })

  it('never matches a line of another known type, even when the words fit', () => {
    const result = matchReceiptToList([typed('l1', 'Máslo', ['maslo'])], [typedLine('r1', 'MASLO ARASIDOVE', 'sunka', false)])
    expect(result.certain).toEqual([])
    expect(result.suggested).toEqual([])
  })

  it('does not let a catalog product of another type tick the item', () => {
    const result = matchReceiptToList([typed('l1', 'Kuřecí maso', chicken)], [typedLine('r1', 'KURECI SUNKA', 'sunka', true)])
    expect(result.certain).toEqual([])
    expect(result.suggested).toEqual([])
  })

  it('falls back to the words when the line has no known type', () => {
    const result = matchReceiptToList([typed('l1', 'Máslo', ['maslo'])], [typedLine('r1', 'MASLO PRAZSKE 250G', null, false)])
    expect(result.suggested).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
  })

  it('suggests the closest of several lines of the right type', () => {
    const result = matchReceiptToList(
      [typed('l1', 'Prsa', ['kureci-prsa'])],
      [typedLine('r1', 'KURECI PRSA CHLAZENA BIO 500G', 'kureci-prsa', false), typedLine('r2', 'KURECI PRSA', 'kureci-prsa', false)],
    )
    expect(result.suggested).toEqual([{ listItemId: 'l1', purchaseItemId: 'r2' }])
  })

  it('leaves an item with no types to the word matching as before', () => {
    const result = matchReceiptToList([{ id: 'l1', name: 'Mléko', productId: null }], [typedLine('r1', 'MLEKO POLOTUC. 1L', 'mleko-polotucne', true)])
    expect(result.certain).toEqual([])
    expect(result.suggested).toEqual([{ listItemId: 'l1', purchaseItemId: 'r1' }])
  })
})
