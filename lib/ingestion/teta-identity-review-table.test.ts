import { describe, expect, it } from 'vitest'
import type { TetaIdentityReport } from '@/lib/ingestion/teta-identity-report'
import {
  buildTetaReviewRows,
  parseTetaReviewCsv,
  toTetaReviewCsv,
} from '@/lib/ingestion/teta-identity-review-table'

const report = (): TetaIdentityReport => ({
  source: 'teta',
  generatedAt: '2026-10-22T10:00:00.000Z',
  apply: false,
  decisions: { auto: 1, review: 2, none: 1 },
  linked: [],
  review: [
    {
      externalId: '000000000000002',
      name: 'Nivea Creme hydratační 200 ml',
      reason: "the catalog name does not say 'hydratacni'",
      score: 0.4,
      candidates: [
        {
          productId: 'product-1',
          productName: 'Nivea Creme 200 ml',
          score: 0.4,
          reasons: [],
          blockers: ["the catalog name does not say 'hydratacni'"],
          differences: { onlyTeta: ['hydratacni'], onlyCandidate: [] },
        },
      ],
    },
    {
      externalId: '000000000000001',
      name: 'Nivea Creme 200 ml',
      reason: 'a second candidate is just as close',
      score: 0.49,
      refusedProduct: { productId: 'product-2', productName: 'Nivea Creme 200 ml' },
      candidates: [
        {
          productId: 'product-1',
          productName: 'Nivea Creme 200 ml',
          score: 0.49,
          reasons: [],
          blockers: [],
          differences: { onlyTeta: [], onlyCandidate: [] },
        },
        {
          productId: 'product-2',
          productName: 'Nivea Creme 200 ml',
          score: 0.48,
          reasons: [],
          blockers: ['a second candidate is just as close'],
          differences: { onlyTeta: [], onlyCandidate: [] },
        },
      ],
    },
  ],
  unlinked: [
    {
      externalId: '000000000000003',
      name: 'Nivea Denní krém',
      reason: 'no catalog product is similar enough',
      candidates: [],
    },
  ],
  manual: [],
})

describe('Teta review table', () => {
  it('asks about the candidate the refusal is about', () => {
    const rows = buildTetaReviewRows(report())
    const row = rows.find((entry) => entry.externalId === '000000000000001')
    // The first candidate is not the one the refusal is about — the second one is.
    expect(row?.candidate?.productId).toBe('product-2')
  })

  it('puts the easiest rows first', () => {
    const rows = buildTetaReviewRows(report())
    // The row whose names do not differ at all comes before the one that differs by a word, and
    // the products nothing resembles come last.
    expect(rows.map((row) => row.externalId)).toEqual([
      '000000000000001',
      '000000000000002',
      '000000000000003',
    ])
  })

  it('lists the products nothing resembles as rows of their own', () => {
    const rows = buildTetaReviewRows(report())
    const row = rows.find((entry) => entry.externalId === '000000000000003')
    expect(row?.status).toBe('none')
    expect(row?.candidate).toBeUndefined()
  })

  it('writes the table as CSV', () => {
    const rows = buildTetaReviewRows(report())
    const csv = toTetaReviewCsv(rows)
    expect(csv.split('\n')[0]).toBe(
      'teta_id,teta_name,status,reason,decision,candidate_product_id,candidate_name,score,words_only_teta,words_only_catalog,blockers',
    )
    const line = csv.split('\n').find((entry) => entry.startsWith('000000000000002,'))
    expect(line).toContain('hydratacni')
    expect(line).toContain('product-1')
  })

  it('reads the decisions back', () => {
    const csv = [
      'teta_id,teta_name,status,reason,decision,candidate_product_id,candidate_name,score,words_only_teta,words_only_catalog,blockers',
      '000000000000002,Nivea Creme hydratační 200 ml,review,reason,link,product-1,Nivea Creme 200 ml,0.4,hydratacni,,',
      '000000000000003,Nivea Denní krém,none,reason,none,,,0,,,',
    ].join('\n')
    const decisions = parseTetaReviewCsv(csv)
    expect(decisions.size).toBe(2)
    expect(decisions.get('000000000000002')).toEqual({
      action: 'link',
      productId: 'product-1',
      productName: 'Nivea Creme 200 ml',
    })
    expect(decisions.get('000000000000003')).toEqual({ action: 'none' })
  })

  it('reads a name with a comma in it back', () => {
    const csv = [
      'teta_id,teta_name,status,reason,decision,candidate_product_id,candidate_name',
      '000000000000002,"Nivea Creme, 200 ml",review,reason,link,product-1,Nivea Creme',
    ].join('\n')
    const decisions = parseTetaReviewCsv(csv)
    expect(decisions.get('000000000000002')).toEqual({
      action: 'link',
      productId: 'product-1',
      productName: 'Nivea Creme',
    })
  })

  it('refuses a row that says "link" but names no product', () => {
    const csv = [
      'teta_id,teta_name,status,reason,decision,candidate_product_id,candidate_name',
      '000000000000002,Nivea,review,reason,link,,',
    ].join('\n')
    expect(() => parseTetaReviewCsv(csv)).toThrow('names no catalog product')
  })
})
