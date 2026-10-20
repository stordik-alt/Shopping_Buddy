import { describe, expect, it } from 'vitest'
import { mapTetaSnapshotToPromotionCandidates } from '@/lib/ingestion/teta-structured-promotions'
import type { TetaProductSnapshot } from '@/lib/ingestion/teta-source-model'

function snapshot(overrides: Partial<TetaProductSnapshot> = {}): TetaProductSnapshot {
  return {
    catalog: {
      sourceId: 'teta-sku-1',
      productUrl: 'https://www.tetadrogerie.cz/eshop/katalog/test',
      name: 'Testovací sprchový gel',
      brand: 'TestBrand',
      categoryPath: ['Tělo', 'Sprchové gely'],
      package: { amount: '250', unit: 'ml' },
      displayedPrice: { amount: 50, currency: 'CZK' },
      regularPrice: { amount: 75, currency: 'CZK' },
      unitPrice: { amount: 20, per: 100, unit: 'ml' },
    },
    detail: {
      sourceId: 'teta-sku-1',
      productUrl: 'https://www.tetadrogerie.cz/eshop/katalog/test',
      package: { amount: '250', unit: 'ml' },
    },
    offers: [{
      kind: 'promotion',
      price: { amount: 50, currency: 'CZK' },
      validFrom: '2026-10-01',
      validUntil: '2026-10-31',
    }],
    ...overrides,
  }
}

describe('mapTetaSnapshotToPromotionCandidates', () => {
  it('maps a matched, explicitly dated discount to a review-only unit-price candidate', () => {
    const [candidate] = mapTetaSnapshotToPromotionCandidates(snapshot(), '2026-10-20')
    expect(candidate.promotionType).toBe('simple_discount')
    expect(candidate.priceEffects).toEqual([{
      effectType: 'fixed_unit_price',
      value: 200,
      currency: 'CZK',
      appliesTo: 'qualifying_items',
    }])
    expect(candidate.validFrom).toBe('2026-10-01')
    expect(candidate.validUntil).toBe('2026-10-31')
    expect(candidate.status).toBe('needs_review')
    expect(candidate.verificationStatus).toBe('unverified')
  })

  it('does not invent a price effect when the promotion has no explicit end date', () => {
    const [candidate] = mapTetaSnapshotToPromotionCandidates(snapshot({
      offers: [{ kind: 'promotion', price: { amount: 50, currency: 'CZK' } }],
    }), '2026-10-20')
    expect(candidate.priceEffects).toEqual([])
    expect(candidate.reviewReasons).toContain('explicit_valid_until_missing')
  })

  it('keeps club prices conditional and unverified', () => {
    const [candidate] = mapTetaSnapshotToPromotionCandidates(snapshot({
      offers: [{
        kind: 'club',
        price: { amount: 40, currency: 'CZK' },
        terms: 'Po přihlášení do klubu',
        validUntil: '2026-10-31',
      }],
    }), '2026-10-20')
    expect(candidate.promotionType).toBe('loyalty_price')
    expect(candidate.membershipRequirements[0].requirementType).toBe('unknown')
    expect(candidate.priceEffects).toEqual([])
    expect(candidate.reviewReasons).toContain('membership_program_and_conditions_require_review')
  })

  it('keeps multi-buy conditions without guessing a reward formula', () => {
    const [candidate] = mapTetaSnapshotToPromotionCandidates(snapshot({
      offers: [{
        kind: 'multi_buy',
        price: { amount: 40, currency: 'CZK' },
        minimumQuantity: 2,
        terms: 'Při nákupu dvou kusů',
        validUntil: '2026-10-31',
      }],
    }), '2026-10-20')
    expect(candidate.promotionType).toBe('multi_buy')
    expect(candidate.rules[0].requiredQuantity).toBe(2)
    expect(candidate.priceEffects).toEqual([])
    expect(candidate.reviewReasons).toContain('multi_buy_reward_and_discount_formula_not_verified')
  })

  it('ignores ordinary price observations', () => {
    const result = mapTetaSnapshotToPromotionCandidates(snapshot({
      offers: [{ kind: 'regular', price: { amount: 50, currency: 'CZK' } }],
    }), '2026-10-20')
    expect(result).toEqual([])
  })

  it('does not attach a discount when the offer price does not match the displayed price', () => {
    const [candidate] = mapTetaSnapshotToPromotionCandidates(snapshot({
      offers: [{
        kind: 'promotion',
        price: { amount: 45, currency: 'CZK' },
        validUntil: '2026-10-31',
      }],
    }), '2026-10-20')
    expect(candidate.priceEffects).toEqual([])
    expect(candidate.reviewReasons).toContain('offer_not_unambiguously_matched_to_displayed_price')
  })
})
