import { describe, expect, it } from 'vitest'
import {
  hasRequiredReceiptFields,
  isLineItemConsistent,
  isPotentialDuplicate,
  isReceiptConsistent,
  needsReview,
  normalizeOcrText,
  normalizeReceiptUnit,
  receiptTotal,
  toReceiptLineItems,
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

  it('defaults to "ks" for null or an unrecognized unit, rather than rejecting the item', () => {
    expect(normalizeReceiptUnit(null)).toBe('ks')
    expect(normalizeReceiptUnit('furlongs')).toBe('ks')
  })
})

describe('toReceiptLineItems', () => {
  it('converts a validated extraction into confirmable line items, using the per-unit price', () => {
    const items = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ name: 'Mléko', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, confidence: 0.9 })] }))
    expect(items).toEqual([{ name: 'Mléko', category: 'Potraviny', quantity: 2, unit: 'ks', price: 24.9, confidence: 0.9 }])
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

  it('falls back to unit price when total price is missing', () => {
    const [item] = toReceiptLineItems(extractedReceipt({ items: [extractedItem({ totalPrice: null, unitPrice: 24.9 })] }))
    expect(item.price).toBe(24.9)
  })
})

describe('receiptTotal', () => {
  it('sums price × quantity across items', () => {
    expect(receiptTotal([{ name: 'A', category: 'Potraviny', quantity: 2, unit: 'ks', price: 10 }, { name: 'B', category: 'Potraviny', quantity: 1, unit: 'ks', price: 5 }])).toBe(25)
  })
})
