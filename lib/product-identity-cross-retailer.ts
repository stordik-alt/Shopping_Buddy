import {
  compareProductIdentityRecords,
  type ProductIdentityCandidate,
  type ProductIdentityRecord,
} from './product-identity-candidates'
import { normalizeProductIdentityText } from './product-identity-normalization'

export function generateCrossRetailerCandidates(
  records: ProductIdentityRecord[],
  options: { leftRetailer: string; rightRetailer: string; minimumScore?: number; maxCandidates?: number },
): ProductIdentityCandidate[] {
  const minimumScore = options.minimumScore ?? 0.3
  const maxCandidates = Math.max(0, Math.min(10_000, Math.floor(options.maxCandidates ?? 1000)))
  const leftKey = normalizeProductIdentityText(options.leftRetailer)
  const rightKey = normalizeProductIdentityText(options.rightRetailer)
  if (!leftKey || !rightKey || leftKey === rightKey) {
    throw new Error('leftRetailer and rightRetailer must identify two different retailers')
  }

  const left = records.filter((record) => normalizeProductIdentityText(record.retailer) === leftKey)
  const right = records.filter((record) => normalizeProductIdentityText(record.retailer) === rightKey)
  const candidates: ProductIdentityCandidate[] = []

  for (const leftRecord of left) {
    if (!leftRecord.name?.trim()) continue
    for (const rightRecord of right) {
      if (!rightRecord.name?.trim()) continue
      const candidate = compareProductIdentityRecords(leftRecord, rightRecord)
      if (candidate.score >= minimumScore) candidates.push(candidate)
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score
      || normalizeProductIdentityText(a.left.name).localeCompare(normalizeProductIdentityText(b.left.name), 'cs')
      || normalizeProductIdentityText(a.right.name).localeCompare(normalizeProductIdentityText(b.right.name), 'cs'))
    .slice(0, maxCandidates)
}
