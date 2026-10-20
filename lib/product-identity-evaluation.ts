import {
  compareProductIdentityRecords,
  type ProductIdentityRecord,
} from '@/lib/product-identity-candidates'

export type ProductIdentityLabel = 'same_product' | 'different_product'

export type LabelledProductIdentityPair = {
  id: string
  left: ProductIdentityRecord
  right: ProductIdentityRecord
  expected: ProductIdentityLabel
  syntheticRight?: boolean
  reason?: string
}

export type ProductIdentityEvaluation = {
  threshold: number
  total: number
  labelledSame: number
  labelledDifferent: number
  truePositive: number
  falsePositive: number
  trueNegative: number
  falseNegative: number
  accuracy: number | null
  precision: number | null
  recall: number | null
  specificity: number | null
  results: Array<{
    id: string
    expected: ProductIdentityLabel
    predicted: ProductIdentityLabel
    score: number
    correct: boolean
    syntheticRight: boolean
    reason?: string
  }>
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4))
}

export function evaluateProductIdentityPairs(
  pairs: LabelledProductIdentityPair[],
  threshold = 0.3,
): ProductIdentityEvaluation {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be between 0 and 1')
  }

  const ids = new Set<string>()
  for (const pair of pairs) {
    if (!pair.id.trim()) throw new Error('Every labelled pair must have a non-empty id')
    if (ids.has(pair.id)) throw new Error(`Duplicate labelled pair id: ${pair.id}`)
    ids.add(pair.id)
    if (pair.expected !== 'same_product' && pair.expected !== 'different_product') {
      throw new Error(`Invalid expected label for pair ${pair.id}`)
    }
  }

  let truePositive = 0
  let falsePositive = 0
  let trueNegative = 0
  let falseNegative = 0
  const results = pairs.map((pair) => {
    const score = compareProductIdentityRecords(pair.left, pair.right).score
    const predicted: ProductIdentityLabel = score >= threshold ? 'same_product' : 'different_product'
    const correct = predicted === pair.expected
    if (pair.expected === 'same_product' && predicted === 'same_product') truePositive += 1
    else if (pair.expected === 'different_product' && predicted === 'same_product') falsePositive += 1
    else if (pair.expected === 'different_product' && predicted === 'different_product') trueNegative += 1
    else falseNegative += 1
    return {
      id: pair.id,
      expected: pair.expected,
      predicted,
      score,
      correct,
      syntheticRight: pair.syntheticRight === true,
      ...(pair.reason ? { reason: pair.reason } : {}),
    }
  })

  const total = pairs.length
  const labelledSame = pairs.filter((pair) => pair.expected === 'same_product').length
  const labelledDifferent = total - labelledSame
  return {
    threshold,
    total,
    labelledSame,
    labelledDifferent,
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    accuracy: ratio(truePositive + trueNegative, total),
    precision: ratio(truePositive, truePositive + falsePositive),
    recall: ratio(truePositive, truePositive + falseNegative),
    specificity: ratio(trueNegative, trueNegative + falsePositive),
    results,
  }
}
