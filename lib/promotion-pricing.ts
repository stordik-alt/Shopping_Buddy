/**
 * Pure, deterministic pricing for verified structured promotions.
 *
 * Inputs use regular unit prices in integer minor units (haléře). The function is deliberately
 * isolated from legacy deals and persistence: callers pass the current shopping-list quantities
 * on every recalculation, and legacy deal prices must not be pre-discounted into unitPriceCents.
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

type Unit = { lineIndex: number; unitPriceCents: number }

const money = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN
  return Math.round(parsed * 100)
}

const numberValue = (value: number | string | null | undefined): number | null => {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const datePart = (value: string | Date | null | undefined): string | null => {
  if (value == null) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  const trimmed = value.trim()
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : null
}

function eligibleRoleForLine(
  promotion: PromotionInput,
  line: PromotionLineInput,
): 'qualifying' | 'reward' | null {
  const matches = promotion.eligibleItems.filter((item) => {
    if (item.productId !== line.productId || item.verificationStatus !== 'verified') return false
    // A product-level row (NULL tradeItemId) applies to all variants of that product. A specific
    // trade item row only matches the exact trade item; it never falls back to product-only matching.
    return item.tradeItemId == null || item.tradeItemId === (line.tradeItemId ?? null)
  })
  if (matches.some((item) => item.eligibilityRole === 'excluded')) return null
  if (matches.some((item) => item.eligibilityRole === 'qualifying')) return 'qualifying'
  if (matches.some((item) => item.eligibilityRole === 'reward')) return 'reward'
  return null
}

function skipReason(
  promotion: PromotionInput,
  input: PromotionPricingInput,
): string | null {
  if (promotion.status !== 'active') return 'promotion_not_active'
  if (promotion.verificationStatus !== 'verified') return 'promotion_not_verified'
  const from = datePart(promotion.validFrom)
  const until = datePart(promotion.validUntil)
  if ((promotion.validFrom != null && from == null) || (promotion.validUntil != null && until == null)) {
    return 'invalid_validity_date'
  }
  if (from && input.date < from) return 'not_yet_valid'
  if (until && input.date > until) return 'expired'
  if (promotion.priceEffects.length === 0) return 'no_price_effect'
  if (promotion.priceEffects.some((effect) => effect.currency !== 'CZK')) return 'unsupported_currency'
  if (promotion.rules.some((rule) => rule.evaluationStatus !== 'verified')) return 'rule_not_verified'
  if (promotion.rules.some((rule) => rule.stackingPolicy !== 'allowed' && rule.stackingPolicy !== 'forbidden')) {
    return 'stacking_policy_unknown'
  }
  for (const requirement of promotion.membershipRequirements) {
    if (requirement.verificationStatus !== 'verified' || requirement.requirementType === 'unknown') {
      return 'membership_requirement_unverified'
    }
    if (
      requirement.requirementType === 'membership_required' &&
      (!requirement.membershipProgram ||
        !input.membershipPrograms?.includes(requirement.membershipProgram))
    ) return 'membership_required'
    if (
      (requirement.requirementType === 'app_coupon_required' ||
        requirement.requirementType === 'activation_required') &&
      !input.satisfiedRequirementIds?.includes(requirement.id)
    ) return 'membership_action_required'
  }
  return null
}

function quantityThresholdMet(
  promotion: PromotionInput,
  lineIndexes: number[],
  items: PromotionLineInput[],
): boolean {
  for (const rule of promotion.rules) {
    if (rule.ruleType !== 'minimum_quantity') continue
    const required = numberValue(rule.requiredQuantity)
    if (required == null || required <= 0) return false
    const quantity = lineIndexes.reduce((sum, index) => sum + items[index].quantity, 0)
    if (quantity < required) return false
  }
  return true
}

function expandUnits(lineIndexes: number[], items: PromotionLineInput[]): Unit[] | null {
  const units: Unit[] = []
  for (const lineIndex of lineIndexes) {
    const quantity = items[lineIndex].quantity
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000) return null
    for (let i = 0; i < quantity; i++) {
      units.push({ lineIndex, unitPriceCents: items[lineIndex].unitPriceCents })
    }
  }
  return units
}

function applyPromotion(
  promotion: PromotionInput,
  input: PromotionPricingInput,
  currentPrices: number[],
): { prices: number[]; discountCents: number; reason?: string } {
  const lineIndexes = input.items
    .map((line, index) => ({ line, index, role: eligibleRoleForLine(promotion, line) }))
    .filter((entry) => entry.role === 'qualifying' || entry.role === 'reward')
    .map((entry) => entry.index)
  if (lineIndexes.length === 0) return { prices: currentPrices, discountCents: 0, reason: 'no_eligible_items' }
  if (!quantityThresholdMet(promotion, lineIndexes, input.items)) {
    return { prices: currentPrices, discountCents: 0, reason: 'minimum_quantity_not_met' }
  }

  const rules = promotion.rules
  const buyGetRule = rules.find((rule) => rule.ruleType === 'buy_x_get_y' || rule.ruleType === 'cheapest_free')
  const cheapestFreeEffect = promotion.priceEffects.find((effect) => effect.effectType === 'cheapest_item_free')
  const next = [...currentPrices]
  let applications = 0
  let discountCents = 0

  if (buyGetRule || cheapestFreeEffect) {
    if (!buyGetRule || !cheapestFreeEffect || cheapestFreeEffect.appliesTo !== 'cheapest_eligible_item') {
      return { prices: currentPrices, discountCents: 0, reason: 'unsupported_buy_get_configuration' }
    }
    const required = numberValue(buyGetRule.requiredQuantity)
    const reward = numberValue(buyGetRule.rewardQuantity)
    const maxApplications = buyGetRule.maxApplications ?? cheapestFreeEffect.maxApplications ?? Number.POSITIVE_INFINITY
    if (!required || !reward || required <= 0 || reward <= 0 || !Number.isInteger(required) ||
        !Number.isInteger(reward) || !Number.isInteger(maxApplications) && maxApplications !== Number.POSITIVE_INFINITY) {
      return { prices: currentPrices, discountCents: 0, reason: 'invalid_buy_get_rule' }
    }
    const units = expandUnits(lineIndexes, input.items)
    if (!units) return { prices: currentPrices, discountCents: 0, reason: 'fractional_or_excess_quantity' }
    const groupSize = required + reward
    const groupCount = Math.min(Math.floor(units.length / groupSize), maxApplications)
    const freeCount = groupCount * reward
    const cheapest = units
      .map((unit, index) => ({ ...unit, index }))
      .sort((a, b) => a.unitPriceCents - b.unitPriceCents || a.index - b.index)
    for (const unit of cheapest.slice(0, freeCount)) {
      const price = next[unit.lineIndex]
      if (price > 0) {
        next[unit.lineIndex] = Math.max(0, price - unit.unitPriceCents)
        discountCents += unit.unitPriceCents
      }
    }
    return { prices: next, discountCents }
  }

  const supportedRuleTypes = new Set(['minimum_quantity', 'unit_price_override', 'percent_discount', 'fixed_discount', 'basket_threshold', 'loyalty_membership'])
  if (rules.some((rule) => !supportedRuleTypes.has(rule.ruleType))) {
    return { prices: currentPrices, discountCents: 0, reason: 'unsupported_rule_type' }
  }

  for (const effect of promotion.priceEffects) {
    const maxApplications = effect.maxApplications ?? Number.POSITIVE_INFINITY
    if (effect.effectType === 'basket_amount_off' || effect.effectType === 'basket_percent_off') {
      if (applications > 0) return { prices: currentPrices, discountCents: 0, reason: 'multiple_basket_effects_unsupported' }
      const eligibleTotal = lineIndexes.reduce((sum, index) => sum + next[index] * input.items[index].quantity, 0)
      const raw = Number(effect.value)
      if (!Number.isFinite(raw) || raw < 0) return { prices: currentPrices, discountCents: 0, reason: 'invalid_effect_value' }
      const requested = effect.effectType === 'basket_percent_off'
        ? Math.round(eligibleTotal * Math.min(raw, 100) / 100)
        : money(effect.value)
      const applied = Math.min(eligibleTotal, requested)
      // Allocate the basket discount proportionally in cents, with deterministic line-order remainder.
      let remaining = applied
      const eligible = lineIndexes.filter((index) => next[index] > 0 && input.items[index].quantity > 0)
      for (const index of eligible) {
        if (remaining <= 0) break
        const lineTotal = next[index] * input.items[index].quantity
        const share = index === eligible[eligible.length - 1]
          ? remaining
          : Math.min(remaining, Math.floor(applied * lineTotal / Math.max(eligibleTotal, 1)))
        const perUnit = Math.floor(share / input.items[index].quantity)
        const unitsForDiscount = Math.min(input.items[index].quantity, Math.ceil(share / Math.max(perUnit, 1)))
        const actual = Math.min(remaining, lineTotal, perUnit * unitsForDiscount)
        if (actual > 0) {
          const reductionPerUnit = Math.min(next[index], Math.ceil(actual / input.items[index].quantity))
          const before = next[index]
          next[index] = Math.max(0, before - reductionPerUnit)
          const real = (before - next[index]) * input.items[index].quantity
          discountCents += real
          remaining -= real
        }
      }
      applications += 1
      continue
    }

    if (!['fixed_unit_price', 'percent_off', 'amount_off'].includes(effect.effectType)) {
      return { prices: currentPrices, discountCents: 0, reason: 'unsupported_price_effect' }
    }
    if (effect.appliesTo !== 'qualifying_items' && effect.appliesTo !== 'reward_items') {
      return { prices: currentPrices, discountCents: 0, reason: 'unsupported_effect_scope' }
    }
    const targetIndexes = lineIndexes.filter((index) => eligibleRoleForLine(promotion, input.items[index]) ===
      (effect.appliesTo === 'reward_items' ? 'reward' : 'qualifying'))
    const raw = Number(effect.value)
    if (!Number.isFinite(raw) || raw < 0) return { prices: currentPrices, discountCents: 0, reason: 'invalid_effect_value' }
    for (const index of targetIndexes) {
      const quantity = input.items[index].quantity
      const unitsToApply = Math.min(quantity, Math.max(0, maxApplications - applications))
      if (unitsToApply <= 0) continue
      const before = next[index]
      const requestedUnitPrice = effect.effectType === 'fixed_unit_price'
        ? money(effect.value)
        : effect.effectType === 'percent_off'
          ? Math.round(before * (1 - Math.min(raw, 100) / 100))
          : Math.max(0, before - money(effect.value))
      const after = Math.min(before, requestedUnitPrice)
      next[index] = after
      discountCents += (before - after) * unitsToApply
      applications += unitsToApply
      if (applications >= maxApplications) break
    }
  }
  return { prices: next, discountCents }
}

/**
 * Recalculate a shopping-list snapshot. Only verified, active, supported CZK promotions are applied.
 * Unknown rules, eligibility, membership requirements or stacking policies fail closed.
 */
export function calculatePromotionPrices(input: PromotionPricingInput): PromotionPricingResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be YYYY-MM-DD')
  for (const item of input.items) {
    if (!item.lineId || !item.productId) throw new Error('each item requires lineId and productId')
    if (!Number.isFinite(item.quantity) || item.quantity < 0) throw new Error('quantity must be a finite non-negative number')
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) throw new Error('unitPriceCents must be a non-negative integer')
  }

  const prices = input.items.map((item) => item.unitPriceCents)
  const linePromotionIds = input.items.map(() => [] as string[])
  const skippedPromotions: PromotionPricingResult['skippedPromotions'] = []
  const applicable: PromotionInput[] = []

  for (const promotion of input.promotions) {
    const reason = skipReason(promotion, input)
    if (reason) {
      skippedPromotions.push({ promotionId: promotion.id, reason })
      continue
    }
    applicable.push(promotion)
  }

  // Promotions are deterministic: explicit "forbidden" rules make the promotion exclusive.
  // If any exclusive promotion qualifies, choose the one with the largest savings (stable ID tie-break).
  const exclusive = applicable.filter((promotion) => promotion.rules.some((rule) => rule.stackingPolicy === 'forbidden'))
  let selected = applicable.filter((promotion) => !promotion.rules.some((rule) => rule.stackingPolicy === 'forbidden'))
  if (exclusive.length > 0) {
    const candidates = exclusive.map((promotion) => {
      const result = applyPromotion(promotion, input, prices)
      return { promotion, result }
    }).filter((entry) => !entry.result.reason && entry.result.discountCents > 0)
      .sort((a, b) => b.result.discountCents - a.result.discountCents || a.promotion.id.localeCompare(b.promotion.id))
    selected = candidates.length ? [candidates[0].promotion] : selected
    for (const candidate of exclusive) {
      if (!candidates.some((entry) => entry.promotion.id === candidate.id)) {
        skippedPromotions.push({ promotionId: candidate.id, reason: 'exclusive_promotion_not_selected' })
      }
    }
  }

  const appliedPromotionIds: string[] = []
  let currentPrices = prices
  for (const promotion of selected.sort((a, b) => a.id.localeCompare(b.id))) {
    const result = applyPromotion(promotion, input, currentPrices)
    if (result.reason) {
      skippedPromotions.push({ promotionId: promotion.id, reason: result.reason })
      continue
    }
    if (result.discountCents <= 0) {
      skippedPromotions.push({ promotionId: promotion.id, reason: 'no_discount_applied' })
      continue
    }
    currentPrices = result.prices
    appliedPromotionIds.push(promotion.id)
    input.items.forEach((item, index) => {
      if (currentPrices[index] < prices[index] && !linePromotionIds[index].includes(promotion.id)) {
        linePromotionIds[index].push(promotion.id)
      }
    })
  }

  const lines = input.items.map((item, index) => {
    const regularTotalCents = item.unitPriceCents * item.quantity
    const finalTotalCents = currentPrices[index] * item.quantity
    return {
      lineId: item.lineId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      finalUnitPriceCents: currentPrices[index],
      regularTotalCents,
      finalTotalCents,
      discountCents: regularTotalCents - finalTotalCents,
      appliedPromotionIds: linePromotionIds[index],
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
