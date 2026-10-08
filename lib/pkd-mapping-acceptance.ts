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
    const updatedMapping = db.$with('updated_mapping').as(
      db
        .update(schema.pkdProductTypeMappings)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(
          and(
            eq(schema.pkdProductTypeMappings.id, command.mappingId),
            eq(schema.pkdProductTypeMappings.status, 'candidate'),
            isNull(schema.pkdEntries.productTypeId),
          ),
        )
        .from(schema.pkdEntries)
        .where(eq(schema.pkdEntries.id, schema.pkdProductTypeMappings.pkdEntryId))
        .returning({
          id: schema.pkdProductTypeMappings.id,
          pkdEntryId: schema.pkdProductTypeMappings.pkdEntryId,
          productTypeId: schema.pkdProductTypeMappings.productTypeId,
        }),
    )

    const updatedEntry = db.$with('updated_entry').as(
      db
        .update(schema.pkdEntries)
        .set({ productTypeId: sql`${updatedMapping.productTypeId}`, updatedAt: new Date() })
        .from(updatedMapping)
        .where(eq(schema.pkdEntries.id, updatedMapping.pkdEntryId))
        .returning({ id: schema.pkdEntries.id }),
    )

    const review = await db
      .with(updatedMapping, updatedEntry)
      .insert(schema.pkdProductTypeMappingReviews)
      .select({
        mappingId: updatedMapping.id,
        decision: sql`'accepted'::pkd_product_type_mapping_review_decision`.as('decision'),
        reviewerId: sql`${command.reviewerId}`.as('reviewer_id'),
        note: sql`${command.note}`.as('note'),
      })
      .from(updatedMapping)
      .where(sql`exists (select 1 from ${updatedEntry} where ${updatedEntry.id} = ${updatedMapping.pkdEntryId})`)

    if (review.length === 0) {
      throw new Error('Mapping is no longer a candidate or the PKD entry is already mapped')
    }
    return
  }

  const updatedMapping = db.$with('updated_mapping').as(
    db
      .update(schema.pkdProductTypeMappings)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(
        and(
          eq(schema.pkdProductTypeMappings.id, command.mappingId),
          eq(schema.pkdProductTypeMappings.status, 'candidate'),
        ),
      )
      .returning({ id: schema.pkdProductTypeMappings.id }),
  )

  const review = await db
    .with(updatedMapping)
    .insert(schema.pkdProductTypeMappingReviews)
    .select({
      mappingId: updatedMapping.id,
      decision: sql`'rejected'::pkd_product_type_mapping_review_decision`.as('decision'),
      reviewerId: sql`${command.reviewerId}`.as('reviewer_id'),
      note: sql`${command.note}`.as('note'),
    })
    .from(updatedMapping)

  if (review.length === 0) {
    throw new Error('Mapping is no longer a candidate')
  }
}
