import { and, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

export type PkdMappingReviewDecision = 'accepted' | 'rejected'

export type PkdMappingAcceptanceInput = {
  mappingId: string
  decision: PkdMappingReviewDecision
  reviewerId?: string | null
  note?: string | null
}

export type PkdMappingAcceptanceCommand = {
  mappingId: string
  decision: PkdMappingReviewDecision
  reviewerId: string | null
  note: string | null
}

export function buildPkdMappingAcceptanceCommand(
  input: PkdMappingAcceptanceInput,
): PkdMappingAcceptanceCommand {
  const mappingId = input.mappingId.trim()
  if (!mappingId) throw new Error('mappingId is required')

  const note = input.note?.trim() || null
  if (input.decision === 'rejected' && !note) {
    throw new Error('A rejection note is required')
  }

  return {
    mappingId,
    decision: input.decision,
    reviewerId: input.reviewerId?.trim() || null,
    note,
  }
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${field} must be a valid UUID`)
  }
}

export async function acceptPkdProductTypeMapping(input: PkdMappingAcceptanceInput): Promise<void> {
  const command = buildPkdMappingAcceptanceCommand(input)
  assertUuid(command.mappingId, 'mappingId')
  if (command.reviewerId) assertUuid(command.reviewerId, 'reviewerId')

  const db = getDb()

  if (command.decision === 'accepted') {
    const result = await db.execute(sql`
      WITH updated_mapping AS (
        UPDATE pkd_product_type_mappings AS mapping
        SET status = 'accepted',
            updated_at = now()
        FROM pkd_entries AS entry
        WHERE mapping.id = ${command.mappingId}::uuid
          AND mapping.status = 'candidate'
          AND entry.id = mapping.pkd_entry_id
          AND entry.product_type_id IS NULL
        RETURNING mapping.id, mapping.pkd_entry_id, mapping.product_type_id
      ),
      updated_entry AS (
        UPDATE pkd_entries AS entry
        SET product_type_id = updated_mapping.product_type_id,
            updated_at = now()
        FROM updated_mapping
        WHERE entry.id = updated_mapping.pkd_entry_id
        RETURNING entry.id
      )
      INSERT INTO pkd_product_type_mapping_reviews (
        mapping_id,
        decision,
        reviewer_id,
        note
      )
      SELECT
        updated_mapping.id,
        'accepted'::pkd_product_type_mapping_review_decision,
        ${command.reviewerId}::uuid,
        ${command.note}
      FROM updated_mapping
      INNER JOIN updated_entry ON updated_entry.id = updated_mapping.pkd_entry_id
      RETURNING mapping_id
    `)

    if (result.rows.length === 0) {
      throw new Error('Mapping is no longer a candidate or the PKD entry is already mapped')
    }
    return
  }

  const result = await db.execute(sql`
    WITH updated_mapping AS (
      UPDATE pkd_product_type_mappings
      SET status = 'rejected',
          updated_at = now()
      WHERE id = ${command.mappingId}::uuid
        AND status = 'candidate'
      RETURNING id
    )
    INSERT INTO pkd_product_type_mapping_reviews (
      mapping_id,
      decision,
      reviewer_id,
      note
    )
    SELECT
      id,
      'rejected'::pkd_product_type_mapping_review_decision,
      ${command.reviewerId}::uuid,
      ${command.note}
    FROM updated_mapping
    RETURNING mapping_id
  `)

  if (result.rows.length === 0) {
    throw new Error('Mapping is no longer a candidate')
  }
}
