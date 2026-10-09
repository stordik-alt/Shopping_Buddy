import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRawSql } from '@/lib/db/raw-sql'
import {
  canApproveProductSubtypeCandidate,
  deduplicateProductSubtypeCandidates,
  normalizeProductSubtypeCandidate,
  normalizeSubtypeLabel,
  type ProductSubtypeCandidateInput,
} from '@/lib/product-subtype-candidates'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function has(flag: string): boolean {
  return process.argv.includes(flag)
}

function usage(): never {
  console.error(`Usage:
  pnpm db:product-subtype-candidates -- list
  pnpm db:product-subtype-candidates -- ingest --input ./subtype-candidates.json [--apply]
  pnpm db:product-subtype-candidates -- approve --key <candidate-key>
  pnpm db:product-subtype-candidates -- reject --key <candidate-key> --reason "<reason>"

Ingest input is a JSON array of candidates with parentTypeKey, name, sourceType, sourceName,
and optional definition, includes, excludes, sourceVersion, sourceRecordIds and evidence.
Ingest is DRY RUN unless --apply is provided. Approval/rejection are explicit writes.
`)
  process.exit(2)
}

async function main() {
  const action = process.argv[2]
  if (!['list', 'ingest', 'approve', 'reject'].includes(action)) usage()

  const databaseUrl = process.env.NEON_PROD_DATABASE_URL
    ?? process.env.DATABASE_URL_UNPOOLED
    ?? process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('Set NEON_PROD_DATABASE_URL or DATABASE_URL before running this command.')
  const sql = createRawSql(databaseUrl)

  try {
    if (action === 'list') {
      const rows = await sql`
        SELECT c.candidate_key AS "candidateKey", c.parent_product_type_key AS "parentTypeKey",
               COALESCE(pt.name, c.parent_product_type_key) AS "parentTypeName",
               c.name, c.status, c.source_type AS "sourceType", c.source_name AS "sourceName",
               c.source_record_ids AS "sourceRecordIds", c.review_note AS "reviewNote", c.created_at AS "createdAt"
        FROM product_subtype_candidates c
        LEFT JOIN product_types pt ON pt.key = c.parent_product_type_key
        WHERE c.status = 'candidate'
        ORDER BY pt.name, c.normalized_name
      `
      console.log(JSON.stringify({ mode: 'read-only', pending: rows.length, candidates: rows }, null, 2))
      return
    }

    if (action === 'ingest') {
      const inputPath = arg('--input')
      if (!inputPath) usage()
      const raw = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as unknown
      const inputs = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && 'candidates' in raw && Array.isArray((raw as { candidates: unknown }).candidates)
        ? (raw as { candidates: unknown[] }).candidates
        : null)
      if (!inputs) throw new Error('Input must be a JSON array or an object with a candidates array.')
      const candidates = deduplicateProductSubtypeCandidates(inputs as ProductSubtypeCandidateInput[])
      const apply = has('--apply')
      const results: Array<Record<string, unknown>> = []

      for (const candidate of candidates) {
        if (!apply) {
          results.push({
            candidateKey: candidate.candidateKey,
            parentTypeKey: candidate.parentTypeKey,
            name: candidate.name,
            sourceType: candidate.sourceType,
            sourceName: candidate.sourceName,
            sourceRecordIds: candidate.sourceRecordIds,
            approvalReady: canApproveProductSubtypeCandidate(candidate),
            status: 'would_insert_or_merge',
          })
          continue
        }
        const evidence = { records: [{ sourceType: candidate.sourceType, sourceName: candidate.sourceName, sourceVersion: candidate.sourceVersion ?? null, evidence: candidate.evidence }] }
        const rows = await sql`
          INSERT INTO product_subtype_candidates (
            parent_product_type_key, parent_product_type_id, candidate_key, name, normalized_name, definition, includes, excludes,
            source_type, source_name, source_version, source_record_ids, evidence, status
          )
          VALUES (
            ${candidate.parentTypeKey}, (SELECT id FROM product_types WHERE key = ${candidate.parentTypeKey} LIMIT 1),
            ${candidate.candidateKey}, ${candidate.name}, ${candidate.normalizedName}, ${candidate.definition},
            ${JSON.stringify(candidate.includes)}::jsonb, ${JSON.stringify(candidate.excludes)}::jsonb,
            ${candidate.sourceType}, ${candidate.sourceName}, ${candidate.sourceVersion ?? null},
            ${JSON.stringify(candidate.sourceRecordIds)}::jsonb, ${JSON.stringify(evidence)}::jsonb, 'candidate'
          )
          ON CONFLICT (candidate_key) DO UPDATE SET
            definition = CASE WHEN product_subtype_candidates.definition = '' THEN EXCLUDED.definition ELSE product_subtype_candidates.definition END,
            includes = (
              SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
              FROM (SELECT DISTINCT value FROM jsonb_array_elements(product_subtype_candidates.includes || EXCLUDED.includes) AS item(value)) AS unique_values
            ),
            excludes = (
              SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
              FROM (SELECT DISTINCT value FROM jsonb_array_elements(product_subtype_candidates.excludes || EXCLUDED.excludes) AS item(value)) AS unique_values
            ),
            source_record_ids = (
              SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
              FROM jsonb_array_elements(product_subtype_candidates.source_record_ids || EXCLUDED.source_record_ids) AS item(value)
            ),
            evidence = jsonb_build_object(
              'records',
              (CASE WHEN jsonb_typeof(product_subtype_candidates.evidence->'records') = 'array'
                    THEN product_subtype_candidates.evidence->'records'
                    ELSE jsonb_build_array(product_subtype_candidates.evidence) END)
              ||
              (CASE WHEN jsonb_typeof(EXCLUDED.evidence->'records') = 'array'
                    THEN EXCLUDED.evidence->'records'
                    ELSE jsonb_build_array(EXCLUDED.evidence) END)
            ),
            updated_at = now()
          WHERE product_subtype_candidates.status = 'candidate'
          RETURNING id, status
        `
        results.push({
          candidateKey: candidate.candidateKey,
          status: rows.length ? 'inserted_or_merged' : 'skipped_existing_review_decision',
        })
      }

      console.log(JSON.stringify({
        mode: apply ? 'APPLY' : 'DRY RUN',
        inputCount: inputs.length,
        deduplicatedCandidateCount: candidates.length,
        errorCount: results.filter((result) => result.status === 'error').length,
        results,
      }, null, 2))
      if (results.some((result) => result.status === 'error')) process.exitCode = 1
      return
    }

    const key = arg('--key')
    if (!key) usage()

    if (action === 'reject') {
      const reason = arg('--reason')?.trim()
      if (!reason) throw new Error('--reject requires a non-empty --reason.')
      const rows = await sql`
        UPDATE product_subtype_candidates
        SET status = 'rejected', review_note = ${reason}, updated_at = now()
        WHERE candidate_key = ${key} AND status = 'candidate'
        RETURNING candidate_key
      `
      if (!rows.length) throw new Error('Candidate not found or it already has a final review decision.')
      console.log(JSON.stringify({ action: 'rejected', candidateKey: key, reason }, null, 2))
      return
    }

    const candidates = await sql`
      SELECT c.id, c.candidate_key AS "candidateKey", c.parent_product_type_id AS "parentProductTypeId",
             c.parent_product_type_key AS "parentTypeKey", c.name, c.normalized_name AS "normalizedName",
             c.definition, c.includes, c.excludes, c.status
      FROM product_subtype_candidates c
      WHERE c.candidate_key = ${key}
      LIMIT 1
    `
    const candidate = candidates[0] as {
      id: string; candidateKey: string; parentProductTypeId: string; parentTypeKey: string; name: string;
      normalizedName: string; definition: string; includes: string[]; excludes: string[]; status: string
    } | undefined
    if (!candidate || candidate.status !== 'candidate') throw new Error('Candidate not found or it already has a final review decision.')

    const parents = await sql`SELECT id FROM product_types WHERE key = ${candidate.parentTypeKey} LIMIT 1`
    if (!parents.length) {
      throw new Error(`Parent Product Type "${candidate.parentTypeKey}" does not exist in the active database yet. The proposal remains queued; create/review the parent type before approving this subtype.`)
    }
    const parentProductTypeId = String(parents[0].id)

    const readiness = canApproveProductSubtypeCandidate({
      definition: candidate.definition,
      includes: candidate.includes ?? [],
      excludes: candidate.excludes ?? [],
    })
    if (!readiness.approved) throw new Error(`Candidate is not ready for approval. Missing: ${readiness.missing.join(', ')}`)

    const existing = await sql`
      SELECT id, key, name FROM product_subtypes WHERE product_type_id = ${parentProductTypeId}
    `
    const duplicate = existing.find((item) => normalizeSubtypeLabel(String(item.name)) === candidate.normalizedName)
    if (duplicate) {
      await sql`
        UPDATE product_subtype_candidates
        SET status = 'duplicate', duplicate_of_subtype_id = ${String(duplicate.id)},
            review_note = ${`Equivalent active subtype already exists: ${String(duplicate.key)}`}, updated_at = now()
        WHERE id = ${candidate.id} AND status = 'candidate'
      `
      console.log(JSON.stringify({ action: 'duplicate', candidateKey: key, existingSubtypeKey: duplicate.key }, null, 2))
      return
    }

    const keyCollision = await sql`SELECT id, product_type_id FROM product_subtypes WHERE key = ${candidate.candidateKey} LIMIT 1`
    if (keyCollision.length) throw new Error('Stable subtype key already exists with a different identity; resolve the collision manually.')
    const rows = await sql`
      WITH inserted AS (
        INSERT INTO product_subtypes (product_type_id, key, name, description, sort_order, is_active)
        VALUES (${parentProductTypeId}, ${candidate.candidateKey}, ${candidate.name}, ${candidate.definition}, 1000, true)
        RETURNING id, key
      ), updated AS (
        UPDATE product_subtype_candidates
        SET status = 'approved', parent_product_type_id = ${parentProductTypeId},
            approved_subtype_id = (SELECT id FROM inserted),
            review_note = 'Explicitly approved; no existing products were reassigned.', updated_at = now()
        WHERE id = ${candidate.id} AND status = 'candidate'
          AND EXISTS (SELECT 1 FROM inserted)
        RETURNING candidate_key, approved_subtype_id
      )
      SELECT updated.candidate_key AS "candidateKey", updated.approved_subtype_id AS "subtypeId",
             inserted.key AS "subtypeKey"
      FROM updated JOIN inserted ON inserted.id = updated.approved_subtype_id
    `
    if (!rows.length) throw new Error('Approval was not completed; candidate may have changed concurrently. Re-run list and inspect the candidate.')
    console.log(JSON.stringify({ action: 'approved', ...rows[0], note: 'No existing products were reassigned.' }, null, 2))
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
