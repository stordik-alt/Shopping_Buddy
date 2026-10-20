/**
 * Pure deterministic evaluator for verified structured promotions.
 *
 * Input prices are regular unit prices in integer haléře, before legacy deals or this engine's
 * promotions. Every call recalculates from the supplied current quantities. For safety, this first
 * version selects the single best applicable promotion for the basket; it never stacks promotions
 * or double-counts a legacy deal.
 */
export type PromotionLineInput = {
  lineId: string
  productId: string
  tradeItemId?: string | null
  quantity: number
  unitPriceCents: number
}

export type PromotionEligibleItemInput = {
  productId: string
  tradeItemId?: string | null
  eligibilityRole: 'qualifying' | 'reward' | 'excluded'
  verificationStatus: string
}

export type PromotionRuleInput = {
  id: string
  ruleType: string
  requiredQuantity?: number | string | null
  rewardQuantity?: number | string | null
  discountValue?: number | string | null
  discountUnit?: string | null
  maxApplications?: number | null
  stackingPolicy: 'allowed' | 'forbidden' | 'unknown'
  evaluationStatus: string
}

export type PromotionPriceEffectInput = {
  id: string
  effectType: string
  value: number | string
  currency: string
  appliesTo: string
  maxApplications?: number | null
}

export type PromotionMembershipRequirementInput = {
  id: string
  membershipProgram?: string | null
  requirementType: string
  verificationStatus: string
}

export type PromotionInput = {
  id: string
  title: string
  status: string
  verificationStatus: string
  validFrom?: string | Date | null
  validUntil?: string | Date | null
  eligibleItems: PromotionEligibleItemInput[]
  rules: PromotionRuleInput[]
  priceEffects: PromotionPriceEffectInput[]
  membershipRequirements: PromotionMembershipRequirementInput[]
}

export type PromotionPricingInput = {
  items: PromotionLineInput[]
  promotions: PromotionInput[]
  /** YYYY-MM-DD in the retailer's local calendar. */
  date: string
  membershipPrograms?: string[]
  satisfiedRequirementIds?: string[]
}

export type PromotionLineResult = {
  lineId: string
  quantity: number
  unitPriceCents: number
  /** Effective average in cents when an application limit discounts only part of a line. */
  finalUnitPriceCents: number
  regularTotalCents: number
  finalTotalCents: number
  discountCents: number
  appliedPromotionIds: string[]
}

export type PromotionPricingResult = {
  regularTotalCents: number
  finalTotalCents: number
  discountCents: number
  lines: PromotionLineResult[]
  appliedPromotionIds: string[]
  skippedPromotions: Array<{ promotionId: string; reason: string }>
}

const cents = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : Number.NaN
}

const numeric = (value: number | string | null | undefined): number | null => {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const datePart = (value: string | Date | null | undefined): string | null => {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null
}

function matchedRole(promotion: PromotionInput, line: PromotionLineInput): 'qualifying' | 'reward' | null {
  const matches = promotion.eligibleItems.filter((item) => {
    if (item.productId !== line.productId || item.verificationStatus !== 'verified') return false
    return item.tradeItemId == null || item.tradeItemId === (line.tradeItemId ?? null)
  })
  if (matches.some((item) => item.eligibilityRole === 'excluded')) return null
  if (matches.some((item) => item.eligibilityRole === 'qualifying')) return 'qualifying'
  if (matches.some((item) => item.eligibilityRole === 'reward')) return 'reward'
  return null
}

function rejectionReason(promotion: PromotionInput, input: PromotionPricingInput): string | null {
  if (promotion.status !== 'active') return 'promotion_not_active'
  if (promotion.verificationStatus !== 'verified') return 'promotion_not_verified'
  const from = datePart(promotion.validFrom)
  const until = datePart(promotion.validUntil)
  if ((promotion.validFrom != null && !from) || (promotion.validUntil != null && !until)) return 'invalid_validity_date'
  if (from && input.date < from) return 'not_yet_valid'
  if (until && input.date > until) return 'expired'
  if (!promotion.priceEffects.length) return 'no_price_effect'
  if (promotion.priceEffects.some((effect) => effect.currency !== 'CZK')) return 'unsupported_currency'
  if (promotion.rules.some((rule) => rule.evaluationStatus !== 'verified')) return 'rule_not_verified'
  if (promotion.rules.some((rule) => rule.stackingPolicy === 'unknown')) return 'stacking_policy_unknown'
  for (const requirement of promotion.membershipRequirements) {
    if (requirement.verificationStatus !== 'verified' || requirement.requirementType === 'unknown') {
      return 'membership_requirement_unverified'
    }
    if (requirement.requirementType === 'membership_required' &&
      (!requirement.membershipProgram || !input.membershipPrograms?.includes(requirement.membershipProgram))) {
      return 'membership_required'
    }
    if ((requirement.requirementType === 'app_coupon_required' || requirement.requirementType === 'activation_required') &&
      !input.satisfiedRequirementIds?.includes(requirement.id)) return 'membership_action_required'
  }
  return null
}

function calculateOne(
  promotion: PromotionInput,
  input: PromotionPricingInput,
): { totals: number[]; discountCents: number; reason?: string } {
  const roles = input.items.map((line) => matchedRole(promotion, line))
  const eligibleIndexes = roles.map((role, index) => role ? index : -1).filter((index) => index >= 0)
  if (!eligibleIndexes.length) return { totals: input.items.map((item) => Math.round(item.unitPriceCents * item.quantity)), discountCents: 0, reason: 'no_eligible_items' }

  for (const rule of promotion.rules) {
    if (rule.ruleType === 'minimum_quantity') {
      const required = numeric(rule.requiredQuantity)
      if (required == null || required <= 0) return { totals: [], discountCents: 0, reason: 'invalid_minimum_quantity' }
      const quantity = eligibleIndexes.reduce((sum, index) => sum + input.items[index].quantity, 0)
      if (quantity < required) return { totals: input.items.map((item) => Math.round(item.unitPriceCents * item.quantity)), discountCents: 0, reason: 'minimum_quantity_not_met' }
    }
  }

  const baseTotals = input.items.map((item) => Math.round(item.unitPriceCents * item.quantity))
  const totals = [...baseTotals]
  if (promotion.priceEffects.length !== 1) {
    return { totals: baseTotals, discountCents: 0, reason: 'multiple_price_effects_unsupported' }
  }
  const effect = promotion.priceEffects[0]
  const rawValue = numeric(effect.value)
  if (rawValue == null || rawValue < 0) return { totals: baseTotals, discountCents: 0, reason: 'invalid_effect_value' }
  const maxApplications = effect.maxApplications ?? Number.POSITIVE_INFINITY
  if (maxApplications <= 0) return { totals: baseTotals, discountCents: 0, reason: 'application_limit_reached' }

  const buyGet = promotion.rules.find((rule) => rule.ruleType === 'buy_x_get_y' || rule.ruleType === 'cheapest_free')
  if (buyGet || effect.effectType === 'cheapest_item_free') {
    if (!buyGet || effect.effectType !== 'cheapest_item_free' || effect.appliesTo !== 'cheapest_eligible_item') {
      return { totals: baseTotals, discountCents: 0, reason: 'unsupported_buy_get_configuration' }
    }
    const required = numeric(buyGet.requiredQuantity)
    const reward = numeric(buyGet.rewardQuantity)
    if (!required || !reward || !Number.isInteger(required) || !Number.isInteger(reward) || required <= 0 || reward <= 0) {
      return { totals: baseTotals, discountCents: 0, reason: 'invalid_buy_get_rule' }
    }
    const units: Array<{ lineIndex: number; price: number }> = []
    for (const index of eligibleIndexes) {
      const quantity = input.items[index].quantity
      if (!Number.isInteger(quantity) || quantity > 10000) {
        return { totals: baseTotals, discountCents: 0, reason: 'buy_get_requires_integer_quantities' }
      }
      for (let unit = 0; unit < quantity; unit++) units.push({ lineIndex: index, price: input.items[index].unitPriceCents })
    }
    const applications = Math.min(
      Math.floor(units.length / (required + reward)),
      buyGet.maxApplications ?? effect.maxApplications ?? Number.POSITIVE_INFINITY,
    )
    const freeCount = applications * reward
    const cheapest = [...units].sort((a, b) => a.price - b.price || a.lineIndex - b.lineIndex)
    let remainingFree = freeCount
    const freeByLine = new Map<number, number>()
    for (const unit of cheapest) {
      if (!remainingFree) break
      freeByLine.set(unit.lineIndex, (freeByLine.get(unit.lineIndex) ?? 0) + unit.price)
      remainingFree--
    }
    for (const [index, discount] of freeByLine) totals[index] = Math.max(0, totals[index] - discount)
    const discountCents = baseTotals.reduce((sum, total, index) => sum + total - totals[index], 0)
    return { totals, discountCents }
  }

  if (!['minimum_quantity', 'unit_price_override', 'percent_discount', 'fixed_discount', 'basket_threshold', 'loyalty_membership'].includes(
    promotion.rules.find((rule) => !['minimum_quantity', 'unit_price_override', 'percent_discount', 'fixed_discount', 'basket_threshold', 'loyalty_membership'].includes(rule.ruleType))?.ruleType ?? 'minimum_quantity',
  )) return { totals: baseTotals, discountCents: 0, reason: 'unsupported_rule_type' }

  if (effect.effectType === 'basket_amount_off' || effect.effectType === 'basket_percent_off') {
    const eligibleTotal = eligibleIndexes.reduce((sum, index) => sum + totals[index], 0)
    const requested = effect.effectType === 'basket_percent_off'
      ? Math.round(eligibleTotal * Math.min(rawValue, 100) / 100)
      : cents(effect.value)
    if (!Number.isFinite(requested)) return { totals: baseTotals, discountCents: 0, reason: 'invalid_effect_value' }
    let remaining = Math.min(eligibleTotal, requested)
    const totalWeight = eligibleTotal
    for (const index of eligibleIndexes) {
      if (!remaining) break
      const share = index === eligibleIndexes[eligibleIndexes.length - 1]
        ? remaining
        : Math.min(remaining, Math.floor(requested * totals[index] / Math.max(totalWeight, 1)))
      const applied = Math.min(totals[index], share)
      totals[index] -= applied
      remaining -= applied
    }
  } else {
    if (!['fixed_unit_price', 'percent_off', 'amount_off'].includes(effect.effectType)) {
      return { totals: baseTotals, discountCents: 0, reason: 'unsupported_price_effect' }
    }
    if (effect.appliesTo !== 'qualifying_items' && effect.appliesTo !== 'reward_items') {
      return { totals: baseTotals, discountCents: 0, reason: 'unsupported_effect_scope' }
    }
    let applications = 0
    for (const index of eligibleIndexes) {
      if (roles[index] !== (effect.appliesTo === 'reward_items' ? 'reward' : 'qualifying')) continue
      const item = input.items[index]
      const units = Number.isInteger(item.quantity) ? item.quantity : (maxApplications === Number.POSITIVE_INFINITY ? item.quantity : 0)
      const discountedUnits = Math.max(0, Math.min(units, maxApplications - applications))
      if (discountedUnits <= 0) continue
      const beforeUnit = item.unitPriceCents
      const afterUnit = effect.effectType === 'fixed_unit_price'
        ? Math.min(beforeUnit, cents(effect.value))
        : effect.effectType === 'percent_off'
          ? Math.round(beforeUnit * (1 - Math.min(rawValue, 100) / 100))
          : Math.max(0, beforeUnit - cents(effect.value))
      if (!Number.isFinite(afterUnit)) return { totals: baseTotals, discountCents: 0, reason: 'invalid_effect_value' }
      const perUnitSavings = beforeUnit - afterUnit
      const discount = Math.min(totals[index], Math.round(perUnitSavings * discountedUnits))
      totals[index] = Math.max(0, totals[index] - discount)
      applications += discountedUnits
      if (applications >= maxApplications) break
    }
  }
  const discountCents = baseTotals.reduce((sum, total, index) => sum + total - totals[index], 0)
  return { totals, discountCents }
}

export function calculatePromotionPrices(input: PromotionPricingInput): PromotionPricingResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be YYYY-MM-DD')
  for (const item of input.items) {
    if (!item.lineId || !item.productId) throw new Error('each item requires lineId and productId')
    if (!Number.isFinite(item.quantity) || item.quantity < 0) throw new Error('quantity must be finite and non-negative')
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) throw new Error('unitPriceCents must be a non-negative integer')
  }
  const regularTotals = input.items.map((item) => Math.round(item.unitPriceCents * item.quantity))
  const skippedPromotions: PromotionPricingResult['skippedPromotions'] = []
  const candidates: Array<{ promotion: PromotionInput; totals: number[]; discountCents: number }> = []

  for (const promotion of input.promotions) {
    const reason = rejectionReason(promotion, input)
    if (reason) {
      skippedPromotions.push({ promotionId: promotion.id, reason })
      continue
    }
    const result = calculateOne(promotion, input)
    if (result.reason) {
      skippedPromotions.push({ promotionId: promotion.id, reason: result.reason })
      continue
    }
    if (result.discountCents <= 0) {
      skippedPromotions.push({ promotionId: promotion.id, reason: 'no_discount_applied' })
      continue
    }
    candidates.push({ promotion, totals: result.totals, discountCents: result.discountCents })
  }

  candidates.sort((a, b) => b.discountCents - a.discountCents || a.promotion.id.localeCompare(b.promotion.id))
  const winner = candidates[0]
  for (const candidate of candidates.slice(1)) {
    skippedPromotions.push({ promotionId: candidate.promotion.id, reason: 'overlapping_promotion_not_selected' })
  }
  const finalTotals = winner?.totals ?? regularTotals
  const appliedPromotionIds = winner ? [winner.promotion.id] : []
  const lines = input.items.map((item, index) => {
    const regularTotalCents = regularTotals[index]
    const finalTotalCents = finalTotals[index]
    return {
      lineId: item.lineId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      finalUnitPriceCents: item.quantity > 0 ? Math.round(finalTotalCents / item.quantity) : item.unitPriceCents,
      regularTotalCents,
      finalTotalCents,
      discountCents: regularTotalCents - finalTotalCents,
      appliedPromotionIds: winner && finalTotalCents < regularTotalCents ? [winner.promotion.id] : [],
    }
  })
  const regularTotalCents = lines.reduce((sum, line) => sum + line.regularTotalCents, 0)
  const finalTotalCents = lines.reduce((sum, line) => sum + line.finalTotalCents, 0)
  return {
    regularTotalCents,
    finalTotalCents,
    discountCents: regularTotalCents - finalTotalCents,
    lines,
    appliedPromotionIds,
    skippedPromotions,
  }
}
