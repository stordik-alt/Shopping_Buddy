// The decisions a human made in the Teta identity review.
//
// The rules in lib/product-identity-teta.ts link a Teta product to a catalog product only when the
// evidence is unambiguous. Everything else waits in the review table (docs/44), where a human looks
// at it and says what is right. This file is what the human's answers look like: one entry per
// Teta product code — either a link to a catalog product, or the decision that the two are not the
// same product.
//
// The import reads the file and writes into its own report what it did with every decision. A
// decision that cannot be applied — the catalog product does not exist, another Teta product
// already owns it, the Teta product is imported already — is refused and reported, never applied
// half way (CLAUDE.md section 26: errors are explicit).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** The Teta product is the catalog product with this id. */
export type TetaManualLink = {
  action: 'link'
  productId: string
  /** The name of that product, for the report — it is not needed to make the link. */
  productName?: string
}

/** The Teta product is not the same product as anything in the catalog. */
export type TetaManualNone = {
  action: 'none'
}

export type TetaManualDecision = TetaManualLink | TetaManualNone

export type TetaIdentityDecisionsFile = {
  source: 'teta'
  generatedAt?: string
  decisions: Record<string, TetaManualDecision>
}

/**
 * The decisions of the file, read and checked.
 *
 * A file that is not shaped as it should be is an error, not something to guess around: a
 * decision that is read wrong would link a product to the wrong thing.
 */
export function parseTetaIdentityDecisions(content: string): Map<string, TetaManualDecision> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    throw new Error(`The decisions file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('The decisions file has to be a JSON object.')
  }
  const file = parsed as Partial<TetaIdentityDecisionsFile>
  if (file.source !== undefined && file.source !== 'teta') {
    throw new Error(`The decisions file is for '${String(file.source)}', not for Teta.`)
  }
  if (typeof file.decisions !== 'object' || file.decisions === null) {
    throw new Error('The decisions file has to hold a "decisions" object.')
  }

  const decisions = new Map<string, TetaManualDecision>()
  for (const [externalId, decision] of Object.entries(file.decisions)) {
    if (typeof externalId !== 'string' || externalId.length === 0) {
      throw new Error('A decision is filed under an empty product code.')
    }
    if (typeof decision !== 'object' || decision === null) {
      throw new Error(`The decision for '${externalId}' is not an object.`)
    }
    const action = (decision as { action?: unknown }).action
    if (action === 'none') {
      decisions.set(externalId, { action: 'none' })
      continue
    }
    if (action === 'link') {
      const productId = (decision as { productId?: unknown }).productId
      if (typeof productId !== 'string' || productId.length === 0) {
        throw new Error(`The decision for '${externalId}' links to no catalog product.`)
      }
      const productName = (decision as { productName?: unknown }).productName
      decisions.set(externalId, {
        action: 'link',
        productId,
        ...(typeof productName === 'string' ? { productName } : {}),
      })
      continue
    }
    throw new Error(`The decision for '${externalId}' has an unknown action: ${JSON.stringify(action)}`)
  }
  return decisions
}

/** Reads the decisions file. */
export async function readTetaIdentityDecisions(path: string): Promise<Map<string, TetaManualDecision>> {
  const content = await readFile(path, 'utf8')
  return parseTetaIdentityDecisions(content)
}

/** Writes the decisions file. */
export async function writeTetaIdentityDecisions(
  path: string,
  decisions: Map<string, TetaManualDecision>,
  generatedAt = new Date().toISOString(),
): Promise<void> {
  const file: TetaIdentityDecisionsFile = {
    source: 'teta',
    generatedAt,
    decisions: Object.fromEntries([...decisions.entries()].sort(([left], [right]) => left.localeCompare(right))),
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(file, null, 2) + '\n', 'utf8')
}
