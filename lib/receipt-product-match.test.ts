import { describe, expect, it } from 'vitest'
import { packageSize, rankReceiptCandidates, receiptOwnBrand, receiptSearchWords, receiptWords, type ReceiptCandidate } from '@/lib/receipt-product-match'

// The receipt lines below are real ones from Albert, Lidl and Billa receipts.
const product = (name: string, storeIds: string[] = ['lidl']): ReceiptCandidate => ({ productId: name, name, storeIds })

describe('reading a receipt line', () => {
  it('spells out abbreviations and drops sizes, codes and the chain name', () => {
    expect(receiptWords('ALB TOUS.CHL. SV.250G')).toEqual(['toustovy', 'chleb', 'svetly'])
    expect(receiptWords('VEJCE Z PODEST. L10')).toEqual(['vejce', 'podestylky'])
    expect(receiptWords('PHILADELP.NATUR 125G')).toEqual(['philadelp', 'natur'])
  })

  it('reads the Czech letters OCR misreads on Albert receipts', () => {
    expect(receiptWords('VIT. ĄESNEK OPEČ.28G')).toEqual(['vitana', 'cesnek', 'opec'])
    expect(receiptWords('POMERÁNĀE')).toEqual(['pomerance'])
    expect(receiptWords('VIT.MEDVĘDÍ ĄESNEK.4G')).toEqual(['vitana', 'medvedi', 'cesnek'])
  })

  it('separates a size glued to the word before it', () => {
    expect(receiptWords('ROHLÍK43GR')).toEqual(['rohlik'])
    expect(packageSize('ROHLÍK43GR')).toBe(43)
  })

  it('reads the package size in grams or millilitres, a multipack as its whole contents', () => {
    expect(packageSize('ALB MOUKA HLADK.1KG')).toBe(1000)
    expect(packageSize('COCA-COLA 0,5L')).toBe(500)
    expect(packageSize('Korunní Citron jemně perlivá 6x1,5l')).toBe(9000)
    expect(packageSize('VARTA ENERGY 6 AA')).toBeNull()
  })

  it('takes "1,51" at the end of a word for 1,5 l', () => {
    expect(packageSize('Voda les.plody1,51')).toBe(1500)
    expect(packageSize('Ice tea Peach 0,51')).toBe(500)
  })

  it('knows a chain\'s own brand', () => {
    expect(receiptOwnBrand('ALB LISTO.TĚSTO 275G')).toBe('albert')
    expect(receiptOwnBrand('KUBÍK W. HRUŠKA 0,5L')).toBeNull()
  })

  it('searches the database by the two longest words', () => {
    expect(receiptSearchWords('KUBÍK W. HRUŠKA 0,5L')).toEqual(['hruska', 'kubik'])
  })
})

describe('ranking catalog products for a receipt line', () => {
  it('finds the product behind an abbreviated line and pre-selects it when it clearly fits', () => {
    const result = rankReceiptCandidates('KUBÍK W. HRUŠKA 0,5L', 'lidl', [
      product('Kubík Waterrr Hruška 500ml'),
      product('Kubík Waterrr Malina 500ml'),
      product('Kubík 100% Hruška 1l'),
    ])
    expect(result.suggestions[0].name).toBe('Kubík Waterrr Hruška 500ml')
    expect(result.suggestions.map((suggestion) => suggestion.name)).not.toContain('Kubík Waterrr Malina 500ml')
    expect(result.confident).toBe(true)
  })

  it('tells a single bottle from a multipack of it', () => {
    const result = rankReceiptCandidates('KORUNNÍ CITRON 1,5L', null, [product('Korunní Citron jemně perlivá 6x1,5l'), product('Korunní Citron jemně perlivá 1,5l')])
    expect(result.suggestions[0].name).toBe('Korunní Citron jemně perlivá 1,5l')
  })

  it('ranks the plain product above a longer one built on its word', () => {
    const result = rankReceiptCandidates('MÁSLO 250G', null, [product('Máslové sušenky 250 g'), product('Máslo 250 g')])
    expect(result.suggestions[0].name).toBe('Máslo 250 g')
  })

  it('offers but does not pre-select when several products fit equally', () => {
    const result = rankReceiptCandidates('MÁSLO 250G', null, [product('Milko Máslo 250g'), product('Madeta Máslo 250g')])
    expect(result.suggestions).toHaveLength(2)
    expect(result.confident).toBe(false)
  })

  it('does not pre-select another brand for a chain\'s own product', () => {
    const result = rankReceiptCandidates('ALB PUD.PRICH.VA200G', 'albert', [product('Zott Protein Pudding vanilková příchuť 200g', ['albert'])])
    expect(result.suggestions[0].name).toBe('Zott Protein Pudding vanilková příchuť 200g')
    expect(result.confident).toBe(false)
  })

  it('prefers the chain\'s own brand when the line names it', () => {
    const result = rankReceiptCandidates('ALB LISTO.TĚSTO 275G', 'albert', [product('Wewalka Listové těsto 275g', ['albert']), product('Albert Listové těsto 275 g', ['albert'])])
    expect(result.suggestions[0].name).toBe('Albert Listové těsto 275 g')
    expect(result.confident).toBe(true)
  })

  it('suggests nothing when too few of the line\'s words fit', () => {
    expect(rankReceiptCandidates('PHILADELP.NATUR 125G', null, [product('Sýr Philadelphia s bylinkami 125 g')]).suggestions).toEqual([])
  })

  it('does not pre-select a product whose size differs', () => {
    const result = rankReceiptCandidates('ACTIVIA JAHODA 120G', null, [product('Activia Probiotický jogurt jahoda 4x120g')])
    expect(result.confident).toBe(false)
  })
})
