import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { writeTetaIdentityDecisions } from '@/lib/ingestion/teta-identity-decisions'
import type { TetaIdentityReport } from '@/lib/ingestion/teta-identity-report'
import {
  buildTetaReviewRows,
  parseTetaReviewCsv,
  renderTetaReviewHtml,
  toTetaReviewCsv,
} from '@/lib/ingestion/teta-identity-review-table'

// Turns the identity report into the table a human reviews.
//
//   pnpm product:identity-teta-review
//   pnpm product:identity-teta-review -- --decisions=data/external/teta-identity-decisions.json
//
// The first run writes the page and the CSV. The page is where the decisions are made: every row
// has a decision, and the decisions are downloaded as the file the import reads. The CSV is the
// same table for a spreadsheet.
//
// The second run reads the filled CSV and writes the decisions file, which the import reads:
//
//   pnpm db:import-teta -- --apply --decisions=data/external/teta-identity-decisions.json

function arg(name: string): string | undefined
function arg(name: string, fallback: string): string
function arg(name: string, fallback?: string): string | undefined {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3)
  return value ?? fallback
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main(): Promise<void> {
  const reportPath = arg('report', 'data/external/teta-identity-review.json')
  const csvPath = arg('csv', 'data/external/teta-identity-review.csv')
  const htmlPath = arg('html', 'data/external/teta-identity-review.html')
  const decisionsPath = arg('decisions', '')

  const report = JSON.parse(await readFile(reportPath, 'utf8')) as TetaIdentityReport
  const rows = buildTetaReviewRows(report)

  // The page is written every time — it is the report, not the human's work.
  await mkdir(dirname(htmlPath), { recursive: true })
  await writeFile(htmlPath, renderTetaReviewHtml(rows, {
    generatedAt: report.generatedAt ?? new Date().toISOString(),
    decisions: report.decisions,
  }), 'utf8')

  // The CSV holds the decisions, so a CSV that already has some is not overwritten. The table
  // itself does not change from run to run — it is built from the report.
  const existing = await readFile(csvPath, 'utf8').catch(() => null)
  const existingDecisions = existing ? parseTetaReviewCsv(existing) : new Map()
  if (existingDecisions.size > 0 && !hasFlag('force')) {
    console.log(`[teta-review] ${csvPath} already holds ${existingDecisions.size} decisions — kept as it is (--force overwrites it)`)
  } else {
    await mkdir(dirname(csvPath), { recursive: true })
    await writeFile(csvPath, toTetaReviewCsv(rows), 'utf8')
  }

  console.log(JSON.stringify({
    rows: rows.length,
    review: rows.filter((row) => row.status === 'review').length,
    unlinked: rows.filter((row) => row.status === 'none').length,
    htmlFile: htmlPath,
    csvFile: csvPath,
  }, null, 2))

  // The decisions file: what the import reads.
  if (decisionsPath) {
    const decisions = existing ? parseTetaReviewCsv(existing) : new Map()
    if (decisions.size === 0) {
      // The file is not written empty: a decisions file the human made in the review page must not
      // be wiped by a run that found no decisions in the CSV.
      console.log(`[teta-review] the CSV holds no decisions — ${decisionsPath} was left as it is`)
    } else {
      await writeTetaIdentityDecisions(decisionsPath, decisions)
      console.log(`[teta-review] ${decisions.size} decisions written (${decisionsPath})`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
