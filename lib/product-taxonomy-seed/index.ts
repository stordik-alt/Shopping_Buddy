import type { ProductSubtypeCandidateInput } from '@/lib/product-subtype-candidates'
import { NEPOTRAVINOVE } from './nepotravinove'
import { POTRAVINY_CERSTVE } from './potraviny-cerstve'
import { POTRAVINY_TRVANLIVE } from './potraviny-trvanlive'
import { DEFAULT_SUBTYPE_EXCLUDES, PRODUCT_TAXONOMY_SEED_VERSION, type SeedType } from './types'

export { PRODUCT_TAXONOMY_SEED_VERSION } from './types'
export type { SeedType, SeedSubtype } from './types'

export const PRODUCT_TAXONOMY_SEED: readonly SeedType[] = [...POTRAVINY_CERSTVE, ...POTRAVINY_TRVANLIVE, ...NEPOTRAVINOVE]

/**
 * The seed as review-queue input (`pnpm db:product-subtype-candidates ingest --input ...`). Every
 * entry carries a definition and include/exclude boundaries so it is approval-ready, but stays a
 * `candidate`: this proposal never activates a subtype or assigns a product by itself.
 */
export function buildSeedSubtypeCandidates(seed: readonly SeedType[] = PRODUCT_TAXONOMY_SEED): ProductSubtypeCandidateInput[] {
  return seed.flatMap((type) =>
    type.subtypes.map(([name, includes, excludes]) => ({
      parentTypeKey: type.key,
      name,
      definition: `Poddruh typu „${type.name}“ rozlišený podle osy: ${type.axis}. Poddruh „${name}“.`,
      includes: [includes],
      excludes: [excludes ?? DEFAULT_SUBTYPE_EXCLUDES],
      sourceType: 'manual' as const,
      sourceName: 'Product Taxonomy seed proposal (retail assortment knowledge)',
      sourceVersion: PRODUCT_TAXONOMY_SEED_VERSION,
      sourceRecordIds: [],
      evidence: {
        category: type.category,
        subcategory: type.subcategory,
        parentTypeName: type.name,
        parentTypeExistsInCode: type.existing,
        reviewStatus: 'proposal_only_not_approved',
      },
    })),
  )
}

/** Types the seed proposes that do not exist in lib/product-types.ts yet (they need rules before use). */
export const newSeedTypes = (seed: readonly SeedType[] = PRODUCT_TAXONOMY_SEED) => seed.filter((type) => !type.existing)
