import { describe, expect, it } from 'vitest'
import type { ProductCatalogEntry } from '@/lib/products'
import {
  hasInvalidAmounts,
  hasRequiredReceiptFields,
  isLineItemConsistent,
  isPotentialDuplicate,
  isReceiptConsistent,
  isRecognizedUnit,
  isRoundingLine,
  needsReview,
  normalizeOcrText,
  netUnitPrice,
  normalizeReceiptUnit,
  receiptDiscounts,
  receiptTotal,
  resolveItemPlacement,
  resolvePurchaseAmounts,
  toReceiptLineItems,
  unitForQuantity,
  type ExtractedReceipt,
  type ExtractedReceiptItem,
  type ReceiptFingerprint,
} from '@/lib/receipts'

const extractedItem = (overrides: Partial<ExtractedReceiptItem> = {}): ExtractedReceiptItem => ({
  name: 'Mléko',
  category: 'Potraviny',
  quantity: 2,
  unit: 'ks',
  unitPrice: 24.9,
  totalPrice: 49.8,
  discount: 0,
  confidence: 0.96,
  ...overrides,
})

const extractedReceipt = (overrides: Partial<ExtractedReceipt> = {}): ExtractedReceipt => ({
  store: { name: 'Lidl', confidence: 0.95 },
  date: '2026-09-22',
  time: '17:42',
  receiptNumber: null,
  currency: 'CZK',
  items: [extractedItem()],
  subtotal: 49.8,
  discountTotal: 0,
  total: 49.8,
  confidence: 0.95,
  ...overrides,
})

describe('normalizeOcrText', () => {
  it('collapses redundant whitespace and normalizes line endings, preserving line order', () => {
    expect(normalizeOcrText('LIDL\r\n  Mléko    24.90  \r\nCelkem 24.90')).toBe('LIDL\nMléko 24.90\nCelkem 24.90')
  })

  it('drops empty lines', () => {
    expect(normalizeOcrText('LIDL\n\n\nMléko 24.90\n')).toBe('LIDL\nMléko 24.90')
  })

  it('does not alter the actual characters of a product name (no "correction")', () => {
    expect(normalizeOcrText('MLÉK0 24.90')).toContain('MLÉK0') // stays as OCR'd — never guessed into 'MLÉKO'
  })
})

describe('isLineItemConsistent', () => {
  it('is consistent when quantity × unit price matches the total', () => {
    expect(isLineItemConsistent(extractedItem({ quantity: 2, unitPrice: 24.9, totalPrice: 49.8 }))).toBe(true)
  })

  it('is inconsistent when the math is off beyond tolerance', () => {
    expect(isLineItemConsistent(extractedItem({ quantity: 2, unitPrice: 24.9, totalPrice: 99.8 }))).toBe(false)
  })

  it('tolerates small rounding differences', () => {
    expect(isLineItemConsistent(extractedItem({ quantity: 3, unitPrice: 10.33, totalPrice: 31.0 }))).toBe(true)
  })

  it('does not flag a line item that is missing the data needed to check it', () => {
    expect(isLineItemConsistent(extractedItem({ quantity: null }))).toBe(true)
    expect(isLineItemConsistent(extractedItem({ unitPrice: null }))).toBe(true)
    expect(isLineItemConsistent(extractedItem({ totalPrice: null }))).toBe(true)
  })
})

describe('isReceiptConsistent', () => {
  it('is consistent when items minus discount match the total', () => {
    expect(isReceiptConsistent(extractedReceipt({ items: [extractedItem({ totalPrice: 50 })], discountTotal: 5, total: 45 }))).toBe(true)
  })

  it('is inconsistent when the total is far off from the summed items', () => {
    expect(isReceiptConsistent(extractedReceipt({ items: [extractedItem({ totalPrice: 50 })], total: 999 }))).toBe(false)
  })

  it('subtracts a discount once, even when it is both attributed to a line and included in discountTotal', () => {
    // 49.80 line, 5.00 off that line; discountTotal (5) already includes the line discount.
    const receipt = extractedReceipt({ items: [extractedItem({ discount: 5 })], discountTotal: 5, total: 44.8 })
    expect(isReceiptConsistent(receipt)).toBe(true)
  })

  it('falls back to the line discounts when the parser gave no discountTotal', () => {
    const receipt = extractedReceipt({ items: [extractedItem({ discount: 5 })], discountTotal: null, total: 44.8 })
    expect(isReceiptConsistent(receipt)).toBe(true)
  })

  it('accepts a receipt-wide discount (coupon) that no line carries', () => {
    const receipt = extractedReceipt({ items: [extractedItem({ discount: 5 })], discountTotal: 15, total: 34.8 })
    expect(isReceiptConsistent(receipt)).toBe(true)
  })

  it('is inconsistent when line discounts exceed the stated discountTotal', () => {
    const receipt = extractedReceipt({ items: [extractedItem({ discount: 10 })], discountTotal: 0, total: 49.8 })
    expect(isReceiptConsistent(receipt)).toBe(false)
  })

  it('is inconsistent (not just "unknown") when the total is missing entirely', () => {
    expect(isReceiptConsistent(extractedReceipt({ total: null }))).toBe(false)
  })
})

describe('hasRequiredReceiptFields / needsReview', () => {
  it('does not need review for a clean, consistent, complete receipt', () => {
    expect(needsReview(extractedReceipt())).toBe(false)
  })

  it('needs review when the store name is missing', () => {
    expect(hasRequiredReceiptFields(extractedReceipt({ store: { name: null, confidence: null } }))).toBe(false)
    expect(needsReview(extractedReceipt({ store: { name: null, confidence: null } }))).toBe(true)
  })

  it('needs review when the date is missing', () => {
    expect(needsReview(extractedReceipt({ date: null }))).toBe(true)
  })

  it('does not need review just because an optional field (receipt number) is missing', () => {
    expect(needsReview(extractedReceipt({ receiptNumber: null }))).toBe(false)
  })

  it('needs review when a line item is mathematically inconsistent', () => {
    expect(needsReview(extractedReceipt({ items: [extractedItem({ totalPrice: 5000 })] }))).toBe(true)
  })

  it('needs review when a line item has an unrecognized unit, rather than silently treating it as "ks"', () => {
    expect(needsReview(extractedReceipt({ items: [extractedItem({ unit: 'furlongs' })] }))).toBe(true)
  })

  it('does not need review just because a unit is missing entirely (defaults to "ks")', () => {
    expect(needsReview(extractedReceipt({ items: [extractedItem({ unit: null })] }))).toBe(false)
  })

  it('does not need review for a consistent receipt with a per-line discount', () => {
    expect(needsReview(extractedReceipt({ items: [extractedItem({ discount: 5 })], discountTotal: 5, total: 44.8 }))).toBe(false)
  })

  it('needs review when a discount was emitted as its own negative item instead of attached to a product', () => {
    const receipt = extractedReceipt({
      items: [extractedItem(), extractedItem({ name: 'Sleva', quantity: 1, unitPrice: -5, totalPrice: -5 })],
      discountTotal: 0,
      total: 44.8,
    })
    expect(hasInvalidAmounts(receipt)).toBe(true)
    expect(needsReview(receipt)).toBe(true)
  })

  it('needs review for a negative discount amount or a discount larger than its line', () => {
    expect(hasInvalidAmounts(extractedReceipt({ items: [extractedItem({ discount: -5 })] }))).toBe(true)
    expect(hasInvalidAmounts(extractedReceipt({ discountTotal: -1 }))).toBe(true)
    expect(hasInvalidAmounts(extractedReceipt({ items: [extractedItem({ discount: 80 })], discountTotal: 80, total: 0 }))).toBe(true)
  })

  it('treats an ordinary receipt with no discounts as valid amounts', () => {
    expect(hasInvalidAmounts(extractedReceipt())).toBe(false)
  })
})

describe('isPotentialDuplicate', () => {
  const base: ReceiptFingerprint = { storeLocationId: 'store-1', date: '2026-09-22', total: 49.8, receiptNumber: null }

  it('matches on same store/date/total', () => {
    expect(isPotentialDuplicate(base, { ...base })).toBe(true)
  })

  it('does not match a different date', () => {
    expect(isPotentialDuplicate(base, { ...base, date: '2026-09-21' })).toBe(false)
  })

  it('does not match a different store', () => {
    expect(isPotentialDuplicate(base, { ...base, storeLocationId: 'store-2' })).toBe(false)
  })

  it('matches on shared receipt number and date even if store differs', () => {
    const withNumber = { ...base, receiptNumber: 'A123' }
    expect(isPotentialDuplicate(withNumber, { ...withNumber, storeLocationId: 'store-2' })).toBe(true)
  })

  it('does not match different receipt numbers', () => {
    expect(isPotentialDuplicate({ ...base, receiptNumber: 'A123' }, { ...base, receiptNumber: 'B456' })).toBe(false)
  })
})

describe('normalizeReceiptUnit', () => {
  it('maps common Czech unit spellings to the app\'s ItemUnit set', () => {
    expect(normalizeReceiptUnit('kg')).toBe('kg')
    expect(normalizeReceiptUnit('KS')).toBe('ks')
    expect(normalizeReceiptUnit('litr')).toBe('l')
    expect(normalizeReceiptUnit('gramy')).toBe('g')
  })

  it('defaults to "ks" for null or an unrecognized unit, for display purposes — needsReview() is what actually blocks an unrecognized one from auto-completing', () => {
    expect(normalizeReceiptUnit(null)).toBe('ks')
    expect(normalizeReceiptUnit('furlongs')).toBe('ks')
  })

  it('supports every ItemUnit exactly, including fractional quantities like 0.582 kg (quantity itself is untouched by this function)', () => {
    expect(normalizeReceiptUnit('kg')).toBe('kg')
    expect(normalizeReceiptUnit('l')).toBe('l')
    expect(normalizeReceiptUnit('ml')).toBe('ml')
  })
})

describe('isRecognizedUnit', () => {
  it('treats a missing or blank unit as recognized (defaults to "ks")', () => {
    expect(isRecognizedUnit(null)).toBe(true)
    expect(isRecognizedUnit('')).toBe(true)
    expect(isRecognizedUnit('  ')).toBe(true)
  })

  it('treats a known unit spelling as recognized', () => {
    expect(isRecognizedUnit('kg')).toBe(true)
    expect(isRecognizedUnit('KS')).toBe(true)
    expect(isRecognizedUnit('litr')).toBe(true)
  })

  it('treats an unknown unit as unrecognized, never silently accepted', () => {
    expect(isRecognizedUnit('furlongs')).toBe(false)
  })
})

describe('resolveItemPlacement', () => {
  const catalogEntry = (overrides: Partial<Pick<ProductCatalogEntry, 'category' | 'defaultLocation'>> = {}) => ({
    category: 'Potraviny' as const,
    defaultLocation: null,
    ...overrides,
  })

  it('prefers the catalog\'s remembered location over the AI-suggested category', () => {
    // catalog says Mrazák; AI/receipt suggests Drogerie for this particular receipt — catalog wins
    expect(resolveItemPlacement(catalogEntry({ category: 'Potraviny', defaultLocation: 'Mrazák' }), 'Drogerie', 'Bio kuře')).toEqual({
      category: 'Potraviny',
      location: 'Mrazák',
    })
  })

  it('falls back to keyword classification for a catalog product with no remembered location yet', () => {
    expect(resolveItemPlacement(catalogEntry({ category: 'Potraviny', defaultLocation: null }), null, 'Mléko')).toEqual({ category: 'Potraviny', location: 'Lednice' })
  })

  it('classifies deterministically by AI category + keyword when there is no catalog match', () => {
    expect(resolveItemPlacement(null, 'Potraviny', 'Mražená zelenina')).toEqual({ category: 'Potraviny', location: 'Mrazák' })
    expect(resolveItemPlacement(null, 'Drogerie', 'Šampon')).toEqual({ category: 'Drogerie', location: 'Drogérka' })
    expect(resolveItemPlacement(null, 'Drogerie', 'Prací prostředek')).toEqual({ category: 'Drogerie', location: 'Domácnost' })
  })

  it('is unresolvable (null) when there is no catalog match and the AI gave no category at all', () => {
    expect(resolveItemPlacement(null, null, 'Něco neznámého')).toBeNull()
  })

  it('is unresolvable (null) when there is no catalog match and the food item matches no storage keyword', () => {
    expect(resolveItemPlacement(null, 'Potraviny', 'Naprosto neznámá potravina')).toBeNull()
  })

  it('is unresolvable (null) for a catalog product with no remembered location whose category+name also don\'t classify', () => {
    expect(resolveItemPlacement(catalogEntry({ category: 'Ostatní', defaultLocation: null }), null, 'Cokoliv')).toBeNull()
  })
})

describe('toReceiptLineItems', () => {
  it('converts a validated extraction into confirmable line items, using the per-unit price and the AI-provided category', () => {
    const items = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ name: 'Mléko', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, category: 'Potraviny', confidence: 0.9 })] }))
    expect(items).toEqual([{ name: 'Mléko', category: 'Potraviny', quantity: 2, unit: 'ks', price: 24.9, location: 'Lednice', confidence: 0.9 }])
  })

  it('defaults category to "Ostatní" and leaves location unset when the AI gave no category and there is no catalog match', () => {
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ category: null })] }))
    expect(item.category).toBe('Ostatní')
    expect(item.location).toBeUndefined()
  })

  it('lets a catalog match override the AI-suggested category and location', () => {
    const catalog: ProductCatalogEntry[] = [{ id: '1', name: 'Mléko', category: 'Potraviny', defaultUnit: 'ks', defaultLocation: 'Mrazák' }]
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ name: 'Mléko', category: 'Drogerie' })] }), catalog)
    expect(item.category).toBe('Potraviny')
    expect(item.location).toBe('Mrazák')
  })

  it('divides the line total by quantity to recover a per-unit price when unitPrice is missing (never double-counts quantity downstream)', () => {
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ quantity: 2, unitPrice: null, totalPrice: 49.8 })] }))
    expect(item.price).toBe(24.9)
    expect(receiptTotal([item])).toBeCloseTo(49.8)
  })

  it('skips an item with no usable name', () => {
    const items = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ name: '  ' })] }))
    expect(items).toEqual([])
  })

  it('defaults quantity to 1 when missing', () => {
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ quantity: null })] }))
    expect(item.quantity).toBe(1)
  })

  it('preserves a fractional quantity exactly, e.g. 0.582 kg of meat sold by weight', () => {
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ name: 'Kuřecí prsa', quantity: 0.582, unit: 'kg', unitPrice: 189.9, totalPrice: 110.52 })] }))
    expect(item.quantity).toBe(0.582)
    expect(item.unit).toBe('kg')
  })

  it('falls back to unit price when total price is missing', () => {
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ totalPrice: null, unitPrice: 24.9 })] }))
    expect(item.price).toBe(24.9)
  })

  it('carries a line discount separately and keeps the price pre-discount', () => {
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ quantity: 2, unitPrice: 24.9, totalPrice: 49.8, discount: 5 })] }))
    expect(item.price).toBe(24.9)
    expect(item.discount).toBe(5)
  })

  it('omits the discount key when there is none (null or zero)', () => {
    const items = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ discount: null }), extractedItem({ discount: 0 })] }))
    expect(items.every((item) => !('discount' in item))).toBe(true)
  })
})

const line = (overrides: Partial<Parameters<typeof receiptTotal>[0][number]> = {}) => ({ name: 'A', category: 'Potraviny' as const, quantity: 1, unit: 'ks' as const, price: 10, ...overrides })

describe('receiptTotal', () => {
  it('sums price × quantity across items', () => {
    expect(receiptTotal([line({ quantity: 2 }), line({ name: 'B', price: 5 })])).toBe(25)
  })

  it('subtracts each line\'s own discount', () => {
    expect(receiptTotal([line({ quantity: 2, price: 24.9, discount: 5 })])).toBeCloseTo(44.8)
  })
})

describe('netUnitPrice', () => {
  it('spreads the line discount over the quantity and rounds to cents', () => {
    expect(netUnitPrice(line({ quantity: 2, price: 24.9, discount: 5 }))).toBe(22.4)
    expect(netUnitPrice(line({ quantity: 3, price: 10, discount: 1 }))).toBe(9.67)
  })

  it('is just the price when there is no discount', () => {
    expect(netUnitPrice(line({ price: 24.9 }))).toBe(24.9)
  })

  it('handles a fractional quantity sold by weight', () => {
    expect(netUnitPrice(line({ quantity: 0.5, unit: 'kg', price: 100, discount: 5 }))).toBe(90)
  })
})

describe('receiptDiscounts', () => {
  it('is zero when nothing was discounted', () => {
    expect(receiptDiscounts([line()], null)).toEqual({ discount: 0, unallocated: 0 })
    expect(receiptDiscounts([line()], 0)).toEqual({ discount: 0, unallocated: 0 })
  })

  it('does not add line discounts on top of a discountTotal that already includes them', () => {
    expect(receiptDiscounts([line({ discount: 5 })], 5)).toEqual({ discount: 5, unallocated: 0 })
  })

  it('reports the part of discountTotal that no line carries as unallocated (coupons)', () => {
    expect(receiptDiscounts([line({ discount: 5 })], 15)).toEqual({ discount: 15, unallocated: 10 })
  })

  it('keeps a line discount even when the receipt-level total is unknown', () => {
    expect(receiptDiscounts([line({ discount: 5 })], null)).toEqual({ discount: 5, unallocated: 0 })
  })
})

// The real Albert receipt of 24 Sep 2026 (Brno, Svatopetrská) that was recorded as 886,96 Kč instead
// of 1 055,00 Kč: every printed line price is already the reduced one, and "Díky akcím jste
// ušetřili 168.00 Kč" is only a summary. [name, quantity, line total] as printed.
const albertLines: [string, number | null, number][] = [
  ['JOJO MARSHMALL.80G', 1, 13.9], ['ALB TAŠKA IGELITOVÁ', 2, 21.8], ['MATTONI HRUŠKA 1,5L', 1, 13.9], ['COCA-COLA 0,5L', 1, 24.9],
  ['KORUNNÍ ETERA JABLKO', 2, 27.8], ['MAT.BILÉ HROZNY 1,5L', 1, 14.9], ['JUPÍK JABLKO 0,5L', 3, 44.7], ['OVOZOO JABLKO 0,25L', 1, 9.9],
  ['CB PL.KA. JUNI.40KS', 1, 199], ['PEPSI COLA 2,25L', 1, 24.9], ['FARM F.L&C FRIES600G', 1, 54.9], ['LINTEO BABY UBR.72KS', 4, 79.6],
  ['GOUDA 48%PLAGR 250G', 1, 32.9], ['KUŘE.PÁRKY SÝR 290G', 1, 38.9], ['ŠUNKA NEJ.JAK.200G', 1, 56.9], ['ANGL.SLANINA 85%150G', 1, 39.9],
  ['WM FUSI.TŘÍ BAR.500G', 1, 19.9], ['OLMA JAH.JOGURT 105G', 2, 23.8], ['OLMÍCI HARIBO 121G', 1, 16.9], ['ALB PUD.PŘÍCH.VA200G', 1, 10.9],
  ['ALB PUDINK ČOKO.200G', 1, 10.9], ['BORŮVKY 250G', 1, 74.9], ['HROZNY BÍL.BEZS.500G', 1, 24.9], ['TENTO KU FAM 2VR 1R', 1, 54.9],
  ['ROHLÍK43GR', 6, 17.4], ['JABLKA GALA', null, 15], ['*ALB TOUST. CHLÉB SV', 1, 29.9], ['PAPRIKA ČERVENÁ', 0.37, 25.9],
  ['BRAMBORY KONZ POZDNÍ', null, 18.6], ['CROISS.LESNÍ SM. 73G', 1, 11.9], ['ZAOKROUHLENÍ PŘÍJEM', 1, 0.4],
]
const albertReceipt = (): ExtractedReceipt =>
  extractedReceipt({
    store: { name: 'Albert', confidence: 0.95 },
    date: '2026-09-24',
    items: albertLines.map(([name, quantity, totalPrice]) => extractedItem({ name, quantity, unitPrice: null, totalPrice, discount: null })),
    discountTotal: 168,
    total: 1055,
  })

describe('receipt-wide savings summary that is already in the line prices (Albert)', () => {
  it('the printed lines add up to the stated total', () => {
    expect(albertLines.reduce((sum, [, , total]) => sum + total, 0)).toBeCloseTo(1055, 2)
  })

  it('is consistent, so a correct receipt is not sent to manual review', () => {
    expect(isReceiptConsistent(albertReceipt())).toBe(true)
    expect(needsReview(albertReceipt())).toBe(false)
  })

  it('still flags a receipt where neither reading of the discount explains the total', () => {
    expect(isReceiptConsistent({ ...albertReceipt(), total: 700 })).toBe(false)
  })

  it('does not apply the "already reflected" reading when a line carries its own discount', () => {
    // Line totals are pre-discount there, so a total equal to their plain sum means a discount was missed.
    const receipt = extractedReceipt({ items: [extractedItem({ discount: 5 })], discountTotal: 5, total: 49.8 })
    expect(isReceiptConsistent(receipt)).toBe(false)
  })

  it('records the amount paid, 1 055,00 Kč, and the saving as information', () => {
    const items = toReceiptLineItems(albertReceipt())
    expect(resolvePurchaseAmounts(items, 168, 1055)).toEqual({ discount: 168, total: 1055 })
  })

  it('the rounding line is not imported as a product', () => {
    const items = toReceiptLineItems(albertReceipt())
    expect(items).toHaveLength(30)
    expect(items.some((item) => /zaokrouhlen/i.test(item.name))).toBe(false)
  })
})

describe('isRoundingLine', () => {
  it('recognizes rounding lines regardless of case and diacritics', () => {
    expect(isRoundingLine('ZAOKROUHLENÍ PŘÍJEM')).toBe(true)
    expect(isRoundingLine('Zaokrouhlení')).toBe(true)
    expect(isRoundingLine('zaokrouhleni')).toBe(true)
    expect(isRoundingLine('  ZAOKROUHLENÍ')).toBe(true)
  })

  it('does not match a real product', () => {
    expect(isRoundingLine('ROHLÍK43GR')).toBe(false)
    expect(isRoundingLine('Mléko')).toBe(false)
  })
})

describe('resolvePurchaseAmounts', () => {
  it('uses the stated total when the lines already include the discount', () => {
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 100 })], 20, 100)).toEqual({ discount: 20, total: 100 })
  })

  it('uses the stated total when a receipt-wide discount is still to be subtracted (coupon)', () => {
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 100 })], 15, 85)).toEqual({ discount: 15, total: 85 })
  })

  it('takes the stated total over cash rounding and weighed-line rounding (within a crown)', () => {
    // Lines sum to 1 054,56; 1 055,00 was paid.
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 1054.56 })], 168, 1055).total).toBe(1055)
  })

  it('subtracts a line discount once, as before', () => {
    expect(resolvePurchaseAmounts([line({ quantity: 2, price: 24.9, discount: 5 })], 5, 44.8)).toEqual({ discount: 5, total: 44.8 })
    expect(resolvePurchaseAmounts([line({ quantity: 2, price: 24.9, discount: 5 })], 5, null)).toEqual({ discount: 5, total: 44.8 })
  })

  it('computes from the lines when no total is stated: a receipt-wide discount is subtracted', () => {
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 100 })], 15, null)).toEqual({ discount: 15, total: 85 })
  })

  it('computes from the lines when the stated total agrees with neither reading', () => {
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 100 })], 15, 500)).toEqual({ discount: 15, total: 85 })
  })

  it('ignores a stated total that is not a positive number', () => {
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 100 })], 0, 0)).toEqual({ discount: 0, total: 100 })
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 100 })], 0, Number.NaN)).toEqual({ discount: 0, total: 100 })
  })

  it('never returns a negative total', () => {
    expect(resolvePurchaseAmounts([line({ quantity: 1, price: 10 })], 50, null).total).toBe(0)
  })
})

// The three weighed lines of the real Albert receipt, exactly as the parser returned them: the OCR
// (Azure fallback) had dropped the "0.43 x 34.90 Kč" and "0.935 x 19.90 Kč" lines, so only the
// paprika carried a weight and a price per kilo.
describe('weighed lines', () => {
  const weighed = (): ExtractedReceipt =>
    extractedReceipt({
      items: [
        extractedItem({ name: 'JABLKA GALA', quantity: null, unit: null, unitPrice: null, totalPrice: 15, discount: null, confidence: 0.8 }),
        extractedItem({ name: 'PAPRIKA ČERVENÁ', quantity: 0.37, unit: null, unitPrice: 69.9, totalPrice: 25.9, discount: null, confidence: 0.9 }),
        extractedItem({ name: 'BRAMBORY KONZ POZDNÍ', quantity: null, unit: null, unitPrice: null, totalPrice: 18.6, discount: null, confidence: 0.8 }),
      ],
    })

  it('a weight with a price per kilo becomes kilograms, not a fractional number of pieces', () => {
    const [, paprika] = toReceiptLineItems(weighed())
    expect(paprika).toMatchObject({ name: 'PAPRIKA ČERVENÁ', quantity: 0.37, unit: 'kg', price: 69.9 })
  })

  it('a line whose weight and unit price the OCR lost keeps its total but is flagged as having no unit price', () => {
    const [apples, , potatoes] = toReceiptLineItems(weighed())
    expect(apples).toMatchObject({ name: 'JABLKA GALA', quantity: 1, price: 15, unitPriceUnknown: true })
    expect(potatoes).toMatchObject({ name: 'BRAMBORY KONZ POZDNÍ', quantity: 1, price: 18.6, unitPriceUnknown: true })
    expect(receiptTotal(toReceiptLineItems(weighed()))).toBeCloseTo(15 + 0.37 * 69.9 + 18.6, 2) // spending stays right
  })

  it('does not flag a line that has a quantity or a unit price', () => {
    const [ordinary, derived] = toReceiptLineItems(
      extractedReceipt({
        items: [
          extractedItem({ quantity: 2, unitPrice: 24.9, totalPrice: 49.8 }),
          extractedItem({ quantity: 2, unitPrice: null, totalPrice: 49.8 }), // unit price derived from total / quantity
        ],
      }),
    )
    expect(ordinary.unitPriceUnknown).toBeUndefined()
    expect(derived.unitPriceUnknown).toBeUndefined()
    expect(derived.price).toBe(24.9)
  })
})

describe('unitForQuantity', () => {
  it('turns "ks" with a fractional quantity into kg', () => {
    expect(unitForQuantity('ks', 0.37)).toBe('kg')
    expect(unitForQuantity('ks', 0.935)).toBe('kg')
  })

  it('leaves whole quantities and explicit non-piece units alone', () => {
    expect(unitForQuantity('ks', 3)).toBe('ks')
    expect(unitForQuantity('ks', 1)).toBe('ks')
    expect(unitForQuantity('g', 0.5)).toBe('g')
    expect(unitForQuantity('l', 1.5)).toBe('l')
    expect(unitForQuantity('kg', 0.37)).toBe('kg')
  })
})
