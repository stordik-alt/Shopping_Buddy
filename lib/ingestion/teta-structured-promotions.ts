import { normalizeTetaProduct } from '@/lib/ingestion/teta'
import type { TetaProductSnapshot, TetaPriceOfferSnapshot } from '@/lib/ingestion/teta-source-model'

/**
 * A review-only candidate derived from the ANITKA Teta snapshot contract.
 * It is intentionally not a database row: source IDs still need to be resolved to canonical
 * product/trade-item identities and a reviewer must verify the terms before it can affect prices.
 */
export type TetaStructuredPromotionCandidate = {
  source: 'teta'
  sourcePromotionId: string
  sourceProductId: string
  sourceUrl: string
  title: string
  promotionType: 'simple_discount' | 'multi_buy' | 'loyalty_price'
  status: 'needs_review'
  scope: 'online'
  verificationStatus: 'unverified'
  validFrom: string | null
  validUntil: string | null
  rules: Array<{
    ruleType: 'minimum_quantity' | 'loyalty_membership'
    requiredQuantity?: number
    stackingPolicy: 'unknown'
    evaluationStatus: 'unsupported'
  }>
  membershipRequirements: Array<{
    requirementType: 'membership_required' | 'unknown'
    verificationStatus: 'unverified'
    requirementText?: string
  }>
  priceEffects: Array<{
    effectType: 'fixed_unit_price'
    value: number
    currency: 'CZK'
    appliesTo: 'qualifying_items'
  }>
  reviewReasons: string[]
}

const sameMoney = (a: { amount: number; currency: string }, b: { amount: number; currency: string }) =>
  a.amount === b.amount && a.currency === b.currency

function sourceDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

/**
 * Creates conservative candidates for structured promotion review.
 *
 * - Plain promotions only receive a fixed unit-price effect if the catalog card price and the
 *   explicit offer agree, a higher regular price is explicitly stated, and the existing normalizer
 *   can validate the package/unit price.
 * - Multi-buy and club offers retain their conditions but never get an invented discount formula.
 * - Every result remains needs_review/unverified and cannot be applied by the pricing engine.
 */
export function mapTetaSnapshotToPromotionCandidates(
  snapshot: TetaProductSnapshot,
  today: string,
): TetaStructuredPromotionCandidate[] {
  const { catalog } = snapshot
  const normalized = normalizeTetaProduct({
    id: catalog.sourceId,
    name: catalog.name,
    brand: catalog.brand,
    price: catalog.displayedPrice.amount,
    currency: catalog.displayedPrice.currency,
    originalPrice: catalog.regularPrice?.currency === catalog.displayedPrice.currency
      ? catalog.regularPrice.amount
      : undefined,
    package: snapshot.detail?.package ?? catalog.package,
    unitPrice: catalog.unitPrice
      ? { price: catalog.unitPrice.amount, per: catalog.unitPrice.per, unit: catalog.unitPrice.unit }
      : undefined,
    categoryPath: catalog.categoryPath,
    ean: snapshot.detail?.ean,
    promotionValidUntil: undefined,
  }, today)

  return (snapshot.offers ?? []).map((offer: TetaPriceOfferSnapshot, index) => {
    const reviewReasons: string[] = []
    const isMatchedDisplayedPromotion =
      offer.kind === 'promotion' &&
      sameMoney(offer.price, catalog.displayedPrice) &&
      !offer.minimumQuantity &&
      !offer.terms
    const validFrom = sourceDate(offer.validFrom)
    const validUntil = sourceDate(offer.validUntil)
    if (offer.validFrom && !validFrom) reviewReasons.push('invalid_valid_from')
    if (offer.validUntil && !validUntil) reviewReasons.push('invalid_valid_until')
    if (validFrom && validUntil && validUntil < validFrom) reviewReasons.push('validity_order_invalid')
    if (!validUntil) reviewReasons.push('explicit_valid_until_missing')

    const rules: TetaStructuredPromotionCandidate['rules'] = []
    const membershipRequirements: TetaStructuredPromotionCandidate['membershipRequirements'] = []
    const priceEffects: TetaStructuredPromotionCandidate['priceEffects'] = []
    let promotionType: TetaStructuredPromotionCandidate['promotionType'] = 'simple_discount'

    if (offer.kind === 'multi_buy') {
      promotionType = 'multi_buy'
      if (Number.isInteger(offer.minimumQuantity) && (offer.minimumQuantity ?? 0) >= 2) {
        rules.push({
          ruleType: 'minimum_quantity',
          requiredQuantity: offer.minimumQuantity,
          stackingPolicy: 'unknown',
          evaluationStatus: 'unsupported',
        })
      } else {
        reviewReasons.push('multi_buy_minimum_quantity_missing')
      }
      reviewReasons.push('multi_buy_reward_and_discount_formula_not_verified')
    } else if (offer.kind === 'club') {
      promotionType = 'loyalty_price'
      membershipRequirements.push({
        requirementType: 'unknown',
        verificationStatus: 'unverified',
        ...(offer.terms ? { requirementText: offer.terms } : {}),
      })
      reviewReasons.push('membership_program_and_conditions_require_review')
    } else if (offer.kind === 'promotion') {
      if (!isMatchedDisplayedPromotion) reviewReasons.push('offer_not_unambiguously_matched_to_displayed_price')
      if (!normalized || normalized.regularPrice <= offer.price.amount) {
        reviewReasons.push('explicit_regular_price_not_verified_as_higher')
      }
      if (!normalized || normalized.unitPrice <= 0 || normalized.currency !== 'CZK') {
        reviewReasons.push('normalized_unit_price_unavailable')
      }
      if (
        isMatchedDisplayedPromotion &&
        validUntil &&
        normalized &&
        normalized.regularPrice > offer.price.amount &&
        normalized.unitPrice > 0 &&
        normalized.currency === 'CZK'
      ) {
        priceEffects.push({
          effectType: 'fixed_unit_price',
          value: normalized.unitPrice,
          currency: 'CZK',
          appliesTo: 'qualifying_items',
        })
      }
    } else {
      reviewReasons.push('regular_price_observation_is_not_a_promotion')
    }

    if (offer.price.currency !== 'CZK') reviewReasons.push('unsupported_currency')
    if (!snapshot.catalog.sourceId.trim()) reviewReasons.push('source_product_identity_missing')
    if (!snapshot.catalog.productUrl.trim()) reviewReasons.push('source_url_missing')
    if (offer.terms) reviewReasons.push('free_text_terms_require_review')

    return {
      source: 'teta',
      sourcePromotionId: `${catalog.sourceId}:${offer.kind}:${index}`,
      sourceProductId: catalog.sourceId,
      sourceUrl: catalog.productUrl,
      title: `${catalog.name} — ${offer.kind === 'club' ? 'klubová cena' : offer.kind === 'multi_buy' ? 'množstevní akce' : offer.kind === 'promotion' ? 'akce' : 'běžná cena'}`,
      promotionType,
      status: 'needs_review',
      scope: 'online',
      verificationStatus: 'unverified',
      validFrom,
      validUntil,
      rules,
      membershipRequirements,
      priceEffects,
      reviewReasons: [...new Set(reviewReasons)],
    }
  })
}
