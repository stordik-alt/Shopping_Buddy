import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describeError } from '@/lib/errors'
import { compareReading, modelCostUsd, PRICES, summarizeEval, type EvalOutcome, type EvalSummary, type ReceiptComparison, type ReceiptTruth } from '@/lib/receipt-eval'
import { prepareReceiptImageForModel, prepareReceiptImageForOcr, type ModelImageVariant } from '@/lib/receipt-image'
import { readPdfTextLayer } from '@/lib/receipt-pdf'
import { RECEIPT_READING_PROMPT_VERSION } from '@/lib/receipt-reading-prompt'
import { createLunaReceiptReader, receiptDecision, toExtractedReceipt, type ReceiptReading, type ReceiptReadingInput } from '@/lib/receipt-reading'
import { azureReceiptTextExtractor, geminiStructuringProvider, googleVisionPdfTextExtractor, googleVisionTextExtractor, isAzureReceiptFallbackConfigured, needsReview, normalizeOcrText, type ExtractedReceipt } from '@/lib/receipts'

// Measures receipt readers on the local dataset (scripts/receipt-eval/export-dataset.ts,
// docs/18_RECEIPT_READER_LUNA.md). Every model answer is cached next to the receipt
// (<id>/results/<variant>.json), so running again — e.g. after changing a metric — costs nothing; delete
// a variant's files to read again. Writes report.md and results.csv to RECEIPT_EVAL_DIR's parent folder.
//
// Run: pnpm receipt-eval:run [variant ...] [--limit N]
//   variants: legacy, luna-none, luna-low, luna-low-ocr, luna-low-split   (default: all)
// Uses .env.local (AI Gateway; Google Vision for `legacy`). No database access.

const DATASET_DIR = process.env.RECEIPT_EVAL_DIR ?? 'C:/tmp/receipt-eval/dataset'
const REPORT_DIR = join(DATASET_DIR, '..')

type Variant = 'legacy' | 'luna-none' | 'luna-low' | 'luna-low-ocr' | 'luna-low-split'
const ALL_VARIANTS: Variant[] = ['legacy', 'luna-none', 'luna-low', 'luna-low-ocr', 'luna-low-split']

type CachedResult = {
  variant: Variant
  readerId: string
  extracted: ExtractedReceipt | null
  reading: ReceiptReading | null
  usage: { inputTokens?: number; outputTokens?: number }
  visionImages: number
  ms: number
  error: string | null
}

type Receipt = { id: string; dir: string; original: Buffer; mimeType: string; truth: ReceiptTruth; truthSource: string }

function loadDataset(limit: number): Receipt[] {
  if (!existsSync(DATASET_DIR)) throw new Error(`No dataset at ${DATASET_DIR} — run pnpm receipt-eval:export first`)
  return readdirSync(DATASET_DIR)
    .filter((id) => existsSync(join(DATASET_DIR, id, 'truth.json')))
    .sort()
    .slice(0, limit)
    .map((id) => {
      const dir = join(DATASET_DIR, id)
      const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as { mimeType: string; truthSource: string }
      const file = readdirSync(dir).find((name) => name.startsWith('original.'))!
      return { id, dir, original: readFileSync(join(dir, file)), mimeType: meta.mimeType, truth: JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8')), truthSource: meta.truthSource }
    })
}

/** A tall photo cut into overlapping parts, top to bottom — tests that several photos of one receipt
 *  come back as one receipt with no line twice. Null for a photo too short to be worth splitting. */
async function splitIntoParts(jpeg: Buffer): Promise<Buffer[] | null> {
  const { width = 0, height = 0 } = await sharp(jpeg).metadata()
  if (height < width * 1.6) return null
  const parts = height > width * 3 ? 3 : 2
  const overlap = Math.round(height * 0.08)
  const step = Math.ceil(height / parts)
  return Promise.all(
    Array.from({ length: parts }, (_, index) => {
      const top = Math.max(0, index * step - overlap)
      const bottom = Math.min(height, (index + 1) * step + overlap)
      return sharp(jpeg).extract({ left: 0, top, width, height: bottom - top }).jpeg({ quality: 85 }).toBuffer()
    }),
  )
}

async function lunaInput(receipt: Receipt, variant: ModelImageVariant, split: boolean): Promise<ReceiptReadingInput | null> {
  if (receipt.mimeType === 'application/pdf') {
    // A digital receipt's text layer is read as text (exact and free); a scanned PDF goes as it is.
    const layer = await readPdfTextLayer(receipt.original.toString('base64'))
    if (layer.text != null) return { text: layer.text }
    return split ? null : { images: [{ base64: receipt.original.toString('base64'), mimeType: 'application/pdf' }] }
  }
  const prepared = await prepareReceiptImageForModel(receipt.original, variant)
  if (!split) return { images: [{ base64: prepared.buffer.toString('base64'), mimeType: prepared.mimeType }] }
  const parts = await splitIntoParts(prepared.buffer)
  return parts ? { images: parts.map((part) => ({ base64: part.toString('base64'), mimeType: 'image/jpeg' })) } : null
}

async function readWith(receipt: Receipt, variant: Variant): Promise<CachedResult | null> {
  const started = Date.now()
  let usage: CachedResult['usage'] = {}
  if (variant === 'legacy') {
    let visionImages = 0
    let provider = 'vision'
    let text: string
    if (receipt.mimeType === 'application/pdf') {
      const layer = await readPdfTextLayer(receipt.original.toString('base64'))
      if (layer.text != null) {
        text = layer.text
        provider = 'pdf-text-layer'
      } else {
        text = (await googleVisionPdfTextExtractor.extractText({ base64: receipt.original.toString('base64'), mimeType: 'application/pdf' })).fullText
        visionImages = 1
      }
    } else {
      // As in production (lib/receipt-import.ts): Google Vision, and Azure only when Vision fails.
      const prepared = await prepareReceiptImageForOcr(receipt.original)
      const image = { base64: prepared.buffer.toString('base64'), mimeType: prepared.mimeType }
      try {
        text = (await googleVisionTextExtractor.extractText(image)).fullText
        visionImages = 1
      } catch (visionError) {
        if (!isAzureReceiptFallbackConfigured()) throw visionError
        text = (await azureReceiptTextExtractor.extractText(image)).fullText
        provider = `azure (vision failed: ${describeError(visionError).slice(0, 120)})`
      }
    }
    const extracted = await geminiStructuringProvider.structure(normalizeOcrText(text), { onUsage: (value) => (usage = value) })
    return { variant, readerId: `${provider}+google/gemini-2.5-flash-lite`, extracted, reading: null, usage, visionImages, ms: Date.now() - started, error: null }
  }
  const effort = variant === 'luna-none' ? 'none' : 'low'
  const input = await lunaInput(receipt, variant === 'luna-low-ocr' ? 'ocr' : 'plain', variant === 'luna-low-split')
  if (!input) return null // not applicable (a short photo or a PDF for the split test)
  const reader = createLunaReceiptReader({ reasoningEffort: effort })
  const reading = await reader.read(input, { onUsage: (value) => (usage = value) })
  return { variant, readerId: reader.id, extracted: toExtractedReceipt(reading), reading, usage, visionImages: 0, ms: Date.now() - started, error: null }
}

function costOf(result: CachedResult): number {
  if (result.variant === 'legacy') return modelCostUsd('google/gemini-2.5-flash-lite', result.usage) + result.visionImages * PRICES.googleVisionPerImage
  return modelCostUsd('openai/gpt-6-luna', result.usage)
}

/** What the pipeline would do with the result. The placement gate (needs the product catalog) is left
 *  out for every variant alike, so the comparison stays fair. */
function decide(result: CachedResult): EvalOutcome['decision'] {
  if (result.error || !result.extracted) return 'failed'
  const checksPassed = !needsReview(result.extracted)
  if (result.reading) return receiptDecision(result.reading, { checksPassed }).decision
  return checksPassed ? 'auto' : 'review'
}

async function main() {
  const args = process.argv.slice(2)
  const limitIndex = args.indexOf('--limit')
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Number.POSITIVE_INFINITY
  const variants = (args.filter((arg, index) => !arg.startsWith('--') && (limitIndex < 0 || index !== limitIndex + 1)) as Variant[]).filter((arg) => ALL_VARIANTS.includes(arg))
  const chosen = variants.length > 0 ? variants : ALL_VARIANTS
  const dataset = loadDataset(limit)
  console.log(`${dataset.length} receipts, variants: ${chosen.join(', ')}, prompt ${RECEIPT_READING_PROMPT_VERSION}`)

  const rows: { id: string; truthSource: string; variant: Variant; outcome: EvalOutcome; comparison: ReceiptComparison | null; error: string | null }[] = []
  for (const variant of chosen) {
    for (const receipt of dataset) {
      const cacheDir = join(receipt.dir, 'results')
      const cacheFile = join(cacheDir, `${variant}.json`)
      let result: CachedResult | null
      if (existsSync(cacheFile)) {
        result = JSON.parse(readFileSync(cacheFile, 'utf8')) as CachedResult
      } else {
        try {
          result = await readWith(receipt, variant)
        } catch (error) {
          const message = describeError(error)
          // Without access to the model there is nothing to measure; do not cache 30 identical refusals.
          if (/free tier|no_providers_available|RestrictedModels/i.test(message)) throw new Error(`${variant}: the AI Gateway refuses the model — ${message}`)
          result = { variant, readerId: variant, extracted: null, reading: null, usage: {}, visionImages: 0, ms: 0, error: message }
        }
        if (result) {
          mkdirSync(cacheDir, { recursive: true })
          writeFileSync(cacheFile, JSON.stringify(result, null, 2))
        }
      }
      if (!result) continue
      const comparison = result.extracted ? compareReading(receipt.truth, result.extracted) : null
      rows.push({ id: receipt.id, truthSource: receipt.truthSource, variant, comparison, error: result.error, outcome: { comparison, decision: decide(result), costUsd: costOf(result), ms: result.ms } })
      process.stdout.write('.')
    }
    process.stdout.write('\n')
  }

  const summaries = chosen.map((variant) => [variant, summarizeEval(rows.filter((row) => row.variant === variant).map((row) => row.outcome))] as const)
  writeFileSync(join(REPORT_DIR, 'report.md'), report(summaries, rows))
  writeFileSync(
    join(REPORT_DIR, 'results.csv'),
    ['id,truthSource,variant,decision,correct,storeOk,dateOk,totalOk,truthItems,readItems,matchedItems,amountOk,costUsd,ms,error']
      .concat(
        rows.map((row) =>
          [row.id, row.truthSource, row.variant, row.outcome.decision, row.comparison?.correct ?? '', row.comparison?.storeOk ?? '', row.comparison?.dateOk ?? '', row.comparison?.totalOk ?? '', row.comparison?.truthItems ?? '', row.comparison?.readItems ?? '', row.comparison?.matchedItems ?? '', row.comparison?.amountOk ?? '', row.outcome.costUsd.toFixed(6), row.outcome.ms, JSON.stringify(row.error ?? '')].join(','),
        ),
      )
      .join('\n'),
  )
  console.log(`Report: ${join(REPORT_DIR, 'report.md')}`)
}

function report(summaries: (readonly [Variant, EvalSummary])[], rows: { id: string; truthSource: string; variant: Variant; outcome: EvalOutcome }[]): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)} %`
  const header = '| Varianta | Účtenek | Správně | Falešný auto | Auto | Ke schválení | Vyfotit znovu | Chyba | Položky nalezeny | Částky položek | Obchod | Datum | Celkem | Cena/účtenka | p50 | p95 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  const lines = summaries.map(
    ([variant, s]) =>
      `| ${variant} | ${s.receipts} | ${s.correct} | **${s.falseAuto}** | ${s.auto} | ${s.review} | ${s.retake} | ${s.failed} | ${percent(s.itemRecall)} | ${percent(s.itemAmountAccuracy)} | ${percent(s.headerAccuracy.store)} | ${percent(s.headerAccuracy.date)} | ${percent(s.headerAccuracy.total)} | $${s.costPerReceiptUsd.toFixed(5)} | ${(s.msP50 / 1000).toFixed(1)} s | ${(s.msP95 / 1000).toFixed(1)} s |`,
  )
  // Receipts whose "right answer" is only the old reading and a new reader disagrees with it: look at
  // the photo — either the new reader or the old answer is wrong.
  const toCheck = rows.filter((row) => row.truthSource === 'as-read' && row.variant !== 'legacy' && row.outcome.comparison && !row.outcome.comparison.correct)
  return [
    `# Měření čtení účtenek — ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Prompt: ${RECEIPT_READING_PROMPT_VERSION}. „Falešný auto“ = účtenka by se uložila sama, ale něco je špatně (cíl 0). Brána umístění v zásobách (potřebuje katalog) se nepočítá u žádné varianty.`,
    '',
    header,
    ...lines,
    '',
    `## Ke kontrole ručně (${toCheck.length})`,
    'Správná odpověď je zde jen dřívější přečtení (domácnost nic neopravila) a nová čtečka nesouhlasí — podívejte se na fotku.',
    '',
    ...toCheck.map((row) => `- ${row.id} — ${row.variant} (${row.outcome.decision})`),
    '',
  ].join('\n')
}

main().catch((error) => {
  console.error(describeError(error))
  process.exit(1)
})
