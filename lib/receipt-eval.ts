import { normalizeMatchName } from '@/lib/receipt-list-match'
import { isRoundingLine, type ExtractedReceipt } from '@/lib/receipts'

// Measuring how well a receipt reader reads (docs/18_RECEIPT_READER_LUNA.md, scripts/receipt-eval).
// Compares a reading with the household's confirmed purchase of the same receipt. Pure and
// deterministic, so the report is reproducible from the cached model answers.

/** The confirmed purchase of a receipt — the "right answer". Line amounts are what was paid for the
 *  line (after its discount), the way purchases store them. */
export type ReceiptTruth = {
  store: string | null
  date: string | null
  total: number
  items: { name: string; quantity: number; unit: string; paid: number }[]
}

export type ReceiptComparison = {
  storeOk: boolean
  dateOk: boolean
  totalOk: boolean
  truthItems: number
  readItems: number
  /** Truth lines a read line was paired with. */
  matchedItems: number
  /** Of the matched, how many have the paid amount / quantity / unit right. */
  amountOk: number
  quantityOk: number
  unitOk: number
  /** Everything a household would see is right: store, date, total, every line and no extra line. */
  correct: boolean
}

const MONEY_TOLERANCE = 0.01
/** Line amounts: a purchase keeps a net price per unit rounded to haléře, so quantity × price can differ
 *  from the printed line by a few haléře on a weighed or discounted line. */
const LINE_TOLERANCE = 0.05

/** The paid amount of a read line: its price before discount minus the discount. */
function readPaid(item: ExtractedReceipt['items'][number]): number | null {
  const gross = item.totalPrice ?? (item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : null)
  return gross == null ? null : Math.round((gross - (item.discount ?? 0)) * 100) / 100
}

/** Similarity of two product names, 0–1 (Dice coefficient of letter pairs of the normalized names). */
export function nameSimilarity(a: string, b: string): number {
  const pairs = (text: string) => {
    const clean = normalizeMatchName(text).replace(/ /g, '')
    const result: string[] = []
    for (let i = 0; i < clean.length - 1; i++) result.push(clean.slice(i, i + 2))
    return result
  }
  const left = pairs(a)
  const right = pairs(b)
  if (left.length === 0 || right.length === 0) return normalizeMatchName(a) === normalizeMatchName(b) ? 1 : 0
  const pool = [...right]
  let shared = 0
  for (const pair of left) {
    const index = pool.indexOf(pair)
    if (index >= 0) {
      shared += 1
      pool.splice(index, 1)
    }
  }
  return (2 * shared) / (left.length + right.length)
}

const sameUnit = (a: string | null, b: string) => (a ?? 'ks').trim().toLowerCase() === b.trim().toLowerCase()

/** Pairs read lines with truth lines: the same paid amount counts most, a similar name breaks ties and
 *  pairs lines whose amount was misread. Each line is used once. */
export function compareReading(truth: ReceiptTruth, read: ExtractedReceipt): ReceiptComparison {
  const readItems = read.items.filter((item) => item.name.trim().length > 0 && !isRoundingLine(item.name))
  const unused = new Set(readItems.map((_, index) => index))
  let matchedItems = 0
  let amountOk = 0
  let quantityOk = 0
  let unitOk = 0
  for (const line of truth.items) {
    let best = -1
    let bestScore = 0
    for (const index of unused) {
      const item = readItems[index]
      const paid = readPaid(item)
      const amountMatches = paid != null && Math.abs(paid - line.paid) <= LINE_TOLERANCE
      const similarity = nameSimilarity(item.name, line.name)
      const score = (amountMatches ? 1 : 0) + similarity
      if ((amountMatches || similarity >= 0.5) && score > bestScore) {
        best = index
        bestScore = score
      }
    }
    if (best < 0) continue
    unused.delete(best)
    matchedItems += 1
    const item = readItems[best]
    const paid = readPaid(item)
    if (paid != null && Math.abs(paid - line.paid) <= LINE_TOLERANCE) amountOk += 1
    // A line read without a quantity is one piece, as the import stores it.
    if (Math.abs((item.quantity ?? 1) - line.quantity) <= 0.001) quantityOk += 1
    if (sameUnit(item.unit, line.unit)) unitOk += 1
  }

  const storeOk = truth.store == null || (read.store.name != null && normalizeMatchName(read.store.name).includes(normalizeMatchName(truth.store).split(' ')[0]))
  const dateOk = truth.date == null || read.date === truth.date
  const totalOk = read.total != null && Math.abs(read.total - truth.total) <= MONEY_TOLERANCE
  const lines = truth.items.length
  return {
    storeOk,
    dateOk,
    totalOk,
    truthItems: lines,
    readItems: readItems.length,
    matchedItems,
    amountOk,
    quantityOk,
    unitOk,
    correct: storeOk && dateOk && totalOk && matchedItems === lines && amountOk === lines && readItems.length === lines,
  }
}

// --- Summary ------------------------------------------------------------------------------------------

export type EvalOutcome = {
  comparison: ReceiptComparison | null
  /** What the pipeline would do: import on its own, send to review, ask for a new photo, or fail. */
  decision: 'auto' | 'review' | 'retake' | 'failed'
  costUsd: number
  ms: number
}

export type EvalSummary = {
  receipts: number
  failed: number
  correct: number
  /** Imported on its own although something is wrong — the figure that must stay at zero. */
  falseAuto: number
  auto: number
  review: number
  retake: number
  itemRecall: number
  itemAmountAccuracy: number
  headerAccuracy: { store: number; date: number; total: number }
  costPerReceiptUsd: number
  msP50: number
  msP95: number
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 1000)

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

export function summarizeEval(outcomes: EvalOutcome[]): EvalSummary {
  const compared = outcomes.flatMap((outcome) => (outcome.comparison ? [outcome.comparison] : []))
  const sum = (pick: (comparison: ReceiptComparison) => number) => compared.reduce((total, comparison) => total + pick(comparison), 0)
  const truthItems = sum((comparison) => comparison.truthItems)
  return {
    receipts: outcomes.length,
    failed: outcomes.filter((outcome) => outcome.decision === 'failed').length,
    correct: compared.filter((comparison) => comparison.correct).length,
    falseAuto: outcomes.filter((outcome) => outcome.decision === 'auto' && !outcome.comparison?.correct).length,
    auto: outcomes.filter((outcome) => outcome.decision === 'auto').length,
    review: outcomes.filter((outcome) => outcome.decision === 'review').length,
    retake: outcomes.filter((outcome) => outcome.decision === 'retake').length,
    itemRecall: ratio(sum((comparison) => comparison.matchedItems), truthItems),
    itemAmountAccuracy: ratio(sum((comparison) => comparison.amountOk), truthItems),
    headerAccuracy: {
      store: ratio(compared.filter((comparison) => comparison.storeOk).length, compared.length),
      date: ratio(compared.filter((comparison) => comparison.dateOk).length, compared.length),
      total: ratio(compared.filter((comparison) => comparison.totalOk).length, compared.length),
    },
    costPerReceiptUsd: outcomes.length === 0 ? 0 : outcomes.reduce((total, outcome) => total + outcome.costUsd, 0) / outcomes.length,
    msP50: percentile(outcomes.map((outcome) => outcome.ms), 50),
    msP95: percentile(outcomes.map((outcome) => outcome.ms), 95),
  }
}

/** USD per token, from the AI Gateway price list (https://ai-gateway.vercel.sh/v1/models, checked
 *  2026-10-05), and Google Vision's price per image. Re-check before relying on the figures. */
export const PRICES = {
  'openai/gpt-6-luna': { input: 0.1e-6, output: 0.5e-6 },
  'google/gemini-2.5-flash-lite': { input: 0.1e-6, output: 0.4e-6 },
  googleVisionPerImage: 1.5 / 1000,
} as const

export function modelCostUsd(model: 'openai/gpt-6-luna' | 'google/gemini-2.5-flash-lite', usage: { inputTokens?: number; outputTokens?: number }): number {
  const price = PRICES[model]
  return (usage.inputTokens ?? 0) * price.input + (usage.outputTokens ?? 0) * price.output
}
