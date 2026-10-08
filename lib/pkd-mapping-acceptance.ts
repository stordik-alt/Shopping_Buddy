export type PkdMappingReviewDecision = 'accepted' | 'rejected'

export type PkdMappingAcceptanceInput = {
  mappingId: string
  decision: PkdMappingReviewDecision
  reviewerId?: string | null
  note?: string | null
}

export type PkdMappingAcceptanceCommand =
  | {
      mappingId: string
      decision: 'accepted'
      reviewerId: string | null
      note: string | null
    }
  | {
      mappingId: string
      decision: 'rejected'
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
