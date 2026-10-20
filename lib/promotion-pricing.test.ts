import { describe, expect, it } from 'vitest'
import { calculatePromotionPrices, type PromotionInput } from '@/lib/promotion-pricing'

const line = (lineId: string, productId: string, unitPriceCents: number, quantity = 1, tradeItemId?: string) => ({
  lineId, productId, unitPriceCents, quantity, tradeItemId,
})

function promotion(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    id: 'promo-a',
    title: 'Test promotion',
    status: 'active',
    verificationStatus: 'verified',
    validFrom: '2026-10-01',
    validUntil: '2026-10-31',
    eligibleItems: [{
      productId: 'product-a',
      eligibilityRole: 'qualifying',
      verificationStatus: 'verified',
    }],
    rules: [],
    priceEffects: [{
      id: 'effect-a',
      effectType: 'percent_off',
      value: 10,
      currency: 'CZK',
      appliesTo: 'qualifying_items',
    }],
    membershipRequirements: [],
    ...overrides,
  }
}

const calculate = (items: ReturnType<typeof line>[], promotions: PromotionInput[], extra: Partial<Parameters<typeof calculatePromotionPrices>[0]> = {}) =>
  calculatePromotionPrices({ items, promotions, date: '2026-10-20', ...extra })

describe('calculatePromotionPrices', () => {
  it('calculates percentage discounts in integer haléře and recalculates from current quantity', () => {
    const result = calculate([line('line-a', 'product-a', 199, 2)], [promotion()])
    expect(result.regularTotalCents).toBe(398)
    expect(result.finalTotalCents).toBe(358)
    expect(result.discountCents).toBe(40)
    expect(result.lines[0].finalUnitPriceCents).toBe(179)
  })

  it('applies a minimum quantity across a mixed eligible assortment', () => {
    const promo = promotion({
      eligibleItems: [
        { productId: 'product-a', eligibilityRole: 'qualifying', verificationStatus: 'verified' },
        { productId: 'product-b', eligibilityRole: 'qualifying', verificationStatus: 'verified' },
      ],
      rules: [{
        id: 'rule-min', ruleType: 'minimum_quantity', requiredQuantity: 3,
        stackingPolicy: 'allowed', evaluationStatus: 'verified',
      }],
    })
    const result = calculate([line('a', 'product-a', 100, 1), line('b', 'product-b', 200, 2)], [promo])
    expect(result.discountCents).toBe(50)
    expect(result.lines.map((entry) => entry.finalTotalCents)).toEqual([90, 360])
  })

  it('does not apply a promotion when the minimum quantity is not met', () => {
    const promo = promotion({
      rules: [{
        id: 'rule-min', ruleType: 'minimum_quantity', requiredQuantity: 3,
        stackingPolicy: 'allowed', evaluationStatus: 'verified',
      }],
    })
    const result = calculate([line('a', 'product-a', 100, 2)], [promo])
    expect(result.discountCents).toBe(0)
    expect(result.skippedPromotions).toContainEqual({ promotionId: 'promo-a', reason: 'minimum_quantity_not_met' })
  })

  it('requires the matching club membership', () => {
    const promo = promotion({
      membershipRequirements: [{
        id: 'club-req', membershipProgram: 'club-x', requirementType: 'membership_required',
        verificationStatus: 'verified',
      }],
    })
    const withoutClub = calculate([line('a', 'product-a', 1000)], [promo])
    const withClub = calculate([line('a', 'product-a', 1000)], [promo], { membershipPrograms: ['club-x'] })
    expect(withoutClub.discountCents).toBe(0)
    expect(withoutClub.skippedPromotions[0].reason).toBe('membership_required')
    expect(withClub.discountCents).toBe(100)
  })

  it('treats the end date as inclusive and skips expired promotions', () => {
    const promo = promotion({ validUntil: '2026-10-19' })
    const result = calculate([line('a', 'product-a', 1000)], [promo])
    expect(result.discountCents).toBe(0)
    expect(result.skippedPromotions[0].reason).toBe('expired')
  })

  it('honours a maximum number of discounted units deterministically', () => {
    const promo = promotion({
      priceEffects: [{
        id: 'effect-a', effectType: 'percent_off', value: 10, currency: 'CZK',
        appliesTo: 'qualifying_items', maxApplications: 1,
      }],
      eligibleItems: [
        { productId: 'product-a', eligibilityRole: 'qualifying', verificationStatus: 'verified' },
        { productId: 'product-b', eligibilityRole: 'qualifying', verificationStatus: 'verified' },
      ],
    })
    const result = calculate([line('a', 'product-a', 1000), line('b', 'product-b', 2000)], [promo])
    expect(result.lines.map((entry) => entry.finalTotalCents)).toEqual([900, 2000])
    expect(result.discountCents).toBe(100)
  })

  it('chooses only the best overlapping promotion instead of double-counting discounts', () => {
    const lower = promotion({ id: 'promo-10', priceEffects: [{
      id: 'effect-10', effectType: 'percent_off', value: 10, currency: 'CZK', appliesTo: 'qualifying_items',
    }] })
    const higher = promotion({ id: 'promo-25', priceEffects: [{
      id: 'effect-25', effectType: 'percent_off', value: 25, currency: 'CZK', appliesTo: 'qualifying_items',
    }] })
    const result = calculate([line('a', 'product-a', 1000)], [lower, higher])
    expect(result.discountCents).toBe(250)
    expect(result.appliedPromotionIds).toEqual(['promo-25'])
    expect(result.skippedPromotions).toContainEqual({ promotionId: 'promo-10', reason: 'overlapping_promotion_not_selected' })
  })

  it('applies buy-two-get-one-free across a mixed assortment, making the cheapest eligible unit free', () => {
    const promo = promotion({
      eligibleItems: ['product-a', 'product-b', 'product-c'].map((productId) => ({
        productId, eligibilityRole: 'qualifying' as const, verificationStatus: 'verified',
      })),
      rules: [{
        id: 'rule-buy-get', ruleType: 'buy_x_get_y', requiredQuantity: 2, rewardQuantity: 1,
        stackingPolicy: 'forbidden', evaluationStatus: 'verified',
      }],
      priceEffects: [{
        id: 'effect-free', effectType: 'cheapest_item_free', value: 1, currency: 'CZK',
        appliesTo: 'cheapest_eligible_item',
      }],
    })
    const result = calculate([
      line('a', 'product-a', 100),
      line('b', 'product-b', 200),
      line('c', 'product-c', 300),
    ], [promo])
    expect(result.discountCents).toBe(100)
    expect(result.lines.map((entry) => entry.finalTotalCents)).toEqual([0, 200, 300])
  })

  it('does not apply unverified promotions or unverified eligibility rows', () => {
    const unverifiedPromotion = promotion({ verificationStatus: 'unverified' })
    const unverifiedItem = promotion({
      eligibleItems: [{ productId: 'product-a', eligibilityRole: 'qualifying', verificationStatus: 'unverified' }],
    })
    const result = calculate([line('a', 'product-a', 1000)], [unverifiedPromotion, unverifiedItem])
    expect(result.discountCents).toBe(0)
    expect(result.skippedPromotions).toContainEqual({ promotionId: 'promo-a', reason: 'promotion_not_verified' })
    expect(result.skippedPromotions).toContainEqual({ promotionId: 'promo-a', reason: 'no_eligible_items' })
  })

  it('does not match a different exact trade-item identity', () => {
    const promo = promotion({
      eligibleItems: [{
        productId: 'product-a', tradeItemId: 'trade-item-1',
        eligibilityRole: 'qualifying', verificationStatus: 'verified',
      }],
    })
    const result = calculate([line('a', 'product-a', 1000, 1, 'trade-item-2')], [promo])
    expect(result.discountCents).toBe(0)
    expect(result.skippedPromotions[0].reason).toBe('no_eligible_items')
  })
})
