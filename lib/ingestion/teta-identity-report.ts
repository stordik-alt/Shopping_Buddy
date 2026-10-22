// The report of the Teta identity review.
//
// One file that holds everything a human needs to look at the decisions of the identity rules: the
// links that were made automatically, the products that need a human, and the products nothing in
// the catalog resembles. Both scripts that produce it — the dry run and the import — write it
// through this module, so the two cannot drift apart (CLAUDE.md section 37: no second
// implementation of the same thing).
//
// The report is the input of the review table (scripts/build-teta-identity-review.ts) and the
// decisions a human makes there are read back by the import
// (lib/ingestion/teta-identity-decisions.ts).

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { TETA_SOURCE, type TetaImportResult } from '@/lib/ingestion/teta-import'
import type { TetaIdentityDecision } from '@/lib/product-identity-teta'

/** One product of the report — the decision and every candidate behind it. */
export type TetaIdentityReportRow = {
  /** Teta's own product code. */
  externalId: string
  /** The name the catalog stores for the product (the brand in front). */
  name: string
  /** Why the decision came out this way. */
  reason: string
  /** The score of the best candidate. */
  score?: number
  /** Every candidate with its score, its blockers and the words the two names do not share. */
  candidates: TetaIdentityDecision['candidates']
  /**
   * The candidate the refusal is about — the best candidate no other Teta product owns.
   *
   * The candidates of a row may start with a product another Teta product already has, and the
   * refusal is about a different one. The review table asks about this one.
   */
  refusedProduct?: { productId: string; productName: string }
}

export type TetaIdentityReport = {
  source: string
  generatedAt: string
  /** Whether the run wrote to the database. */
  apply: boolean
  decisions: { auto: number; review: number; none: number }
  /**
   * The links that were made automatically.
   *
   * They are in the report as well: a human has to be able to look at them too, not only at the
   * ones that were refused.
   */
  linked: {
    externalId: string
    name: string
    productId: string
    productName: string
    score?: number
  }[]
  /** The products whose identity needs a human look. */
  review: TetaIdentityReportRow[]
  /** The products nothing in the catalog resembles — new products, and part of the review too. */
  unlinked: TetaIdentityReportRow[]
  /** What the import did with the decisions a human made. */
  manual: { externalId: string; action: 'link' | 'none'; applied: boolean; reason: string }[]
}

/** The report of an import run. */
export function buildTetaIdentityReport(
  result: TetaImportResult,
  options: { apply: boolean; generatedAt?: string },
): TetaIdentityReport {
  return {
    source: TETA_SOURCE,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    apply: options.apply,
    decisions: result.decisions,
    linked: result.linked.map((decision) => ({
      externalId: decision.externalId,
      name: decision.name,
      productId: decision.productId!,
      productName: decision.productName!,
      ...(decision.score !== undefined ? { score: decision.score } : {}),
    })),
    review: result.review.map(reportRow),
    unlinked: result.unlinked.map(reportRow),
    manual: result.manual,
  }
}

function reportRow(decision: TetaIdentityDecision): TetaIdentityReportRow {
  return {
    externalId: decision.externalId,
    name: decision.name,
    reason: decision.reason,
    ...(decision.score !== undefined ? { score: decision.score } : {}),
    candidates: decision.candidates,
    ...(decision.refusedProduct ? { refusedProduct: decision.refusedProduct } : {}),
  }
}

/** Writes the report. */
export async function writeTetaIdentityReport(path: string, report: TetaIdentityReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf8')
}
