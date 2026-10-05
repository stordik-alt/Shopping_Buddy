import { describe, expect, it } from 'vitest'
import { compareReading, modelCostUsd, nameSimilarity, summarizeEval, type EvalOutcome, type ReceiptTruth } from '@/lib/receipt-eval'
import type { ExtractedReceipt } from '@/lib/receipts'

const truth: ReceiptTruth = {
  store: 'Albert',
  date: '2026-10-05',
  total: 165.48,
  items: [
    { name: 'KUŘ.PRSA 500G', quantity: 1, unit: 'ks', paid: 99.8 },
    { name: 'ROHLÍK TUKOVÝ', quantity: 4, unit: 'ks', paid: 11.6 },
    { name: 'BANÁNY', quantity: 0.836, unit: 'kg', paid: 29.18 },
    { name: 'MLÉKO POLOT. 1L', quantity: 1, unit: 'ks', paid: 24.9 },
  ],
}

function read(items: Partial<ExtractedReceipt['items'][number]>[], overrides: Partial<ExtractedReceipt> = {}): ExtractedReceipt {
  return {
    store: { name: 'ALBERT CR s.r.o.', address: null, city: null, confidence: 0.9 },
    date: '2026-10-05',
    time: null,
    receiptNumber: null,
    currency: 'CZK',
    items: items.map((item) => ({ name: '', category: null, quantity: 1, unit: 'ks', unitPrice: null, totalPrice: null, discount: null, confidence: 0.9, ...item })),
    subtotal: null,
    discountTotal: 20,
    total: 165.48,
    confidence: 0.9,
    ...overrides,
  }
}

const allRight = [
  { name: 'KUR.PRSA 500G', totalPrice: 119.8, discount: 20 },
  { name: 'ROHLIK TUKOVY', quantity: 4, unitPrice: 2.9, totalPrice: 11.6 },
  { name: 'BANANY', quantity: 0.836, unit: 'kg', unitPrice: 34.9, totalPrice: 29.18 },
  { name: 'MLEKO POLOT. 1L', totalPrice: 24.9 },
]

describe('compareReading', () => {
  it('counts a reading that matches the confirmed purchase as correct, comparing what was paid per line', () => {
    expect(compareReading(truth, read(allRight))).toEqual({
      storeOk: true,
      dateOk: true,
      totalOk: true,
      truthItems: 4,
      readItems: 4,
      matchedItems: 4,
      amountOk: 4,
      quantityOk: 4,
      unitOk: 4,
      correct: true,
    })
  })

  it('ignores a rounding line, as the import does', () => {
    expect(compareReading(truth, read([...allRight, { name: 'ZAOKROUHLENÍ', totalPrice: 0.02 }])).correct).toBe(true)
  })

  it('a misread price, a missing line, an extra line or a wrong total is not correct', () => {
    const misread = compareReading(truth, read([{ ...allRight[0] }, { ...allRight[1], totalPrice: 17.6, unitPrice: 4.4 }, allRight[2], allRight[3]]))
    expect(misread).toMatchObject({ matchedItems: 4, amountOk: 3, correct: false })
    expect(compareReading(truth, read(allRight.slice(0, 3))).correct).toBe(false)
    expect(compareReading(truth, read([...allRight, { name: 'TAŠKA', totalPrice: 3 }])).correct).toBe(false)
    expect(compareReading(truth, read(allRight, { total: 165.0 }))).toMatchObject({ totalOk: false, correct: false })
    expect(compareReading(truth, read(allRight, { date: '2026-10-04' }))).toMatchObject({ dateOk: false, correct: false })
  })

  it('name similarity is accent- and case-insensitive', () => {
    expect(nameSimilarity('MLÉKO POLOT. 1L', 'mleko polot 1l')).toBe(1)
    expect(nameSimilarity('BANÁNY', 'ROHLÍK')).toBeLessThan(0.3)
  })
})

describe('summarizeEval', () => {
  it('counts the outcomes, the false automatic imports and the cost', () => {
    const right = compareReading(truth, read(allRight))
    const wrong = compareReading(truth, read(allRight.slice(0, 3)))
    const outcomes: EvalOutcome[] = [
      { comparison: right, decision: 'auto', costUsd: 0.001, ms: 3000 },
      { comparison: wrong, decision: 'auto', costUsd: 0.001, ms: 5000 },
      { comparison: wrong, decision: 'review', costUsd: 0.002, ms: 4000 },
      { comparison: null, decision: 'failed', costUsd: 0, ms: 1000 },
    ]
    const summary = summarizeEval(outcomes)
    expect(summary).toMatchObject({ receipts: 4, failed: 1, correct: 1, falseAuto: 1, auto: 2, review: 1, retake: 0, msP50: 3000, msP95: 5000 })
    expect(summary.itemRecall).toBe(0.833)
    expect(summary.costPerReceiptUsd).toBeCloseTo(0.001)
  })

  it('prices model usage from the gateway price list', () => {
    expect(modelCostUsd('openai/gpt-6-luna', { inputTokens: 2000, outputTokens: 1000 })).toBeCloseTo(0.0007)
  })
})
