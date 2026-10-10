// Writes the broad Product Taxonomy seed proposal (lib/product-taxonomy-seed) as JSON:
//   - subtype candidates, ready for `pnpm db:product-subtype-candidates ingest --input <file>`
//   - the list of proposed NEW Product Types (these still need rules in lib/product-types.ts).
// Pure file output: no database access, no writes besides the two files.
//
// Usage: tsx scripts/export-product-taxonomy-seed.ts [outDir]   (default: docs/examples)
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSeedSubtypeCandidates, newSeedTypes, PRODUCT_TAXONOMY_SEED, PRODUCT_TAXONOMY_SEED_VERSION } from '../lib/product-taxonomy-seed'

const outDir = resolve(process.argv[2] ?? 'docs/examples')
mkdirSync(outDir, { recursive: true })

const candidates = buildSeedSubtypeCandidates()
writeFileSync(resolve(outDir, 'product-taxonomy-seed-subtype-candidates.json'), `${JSON.stringify({ candidates }, null, 2)}\n`)

const types = newSeedTypes().map(({ key, name, category, subcategory, unit, axis, subtypes }) => ({
  key, name, category, subcategory, unit, axis, subtypes: subtypes.map(([subtypeName]) => subtypeName),
}))
writeFileSync(
  resolve(outDir, 'product-taxonomy-seed-new-types.json'),
  `${JSON.stringify({ version: PRODUCT_TAXONOMY_SEED_VERSION, types }, null, 2)}\n`,
)

console.log(JSON.stringify({
  version: PRODUCT_TAXONOMY_SEED_VERSION,
  types: PRODUCT_TAXONOMY_SEED.length,
  newTypes: types.length,
  subtypeCandidates: candidates.length,
  outDir,
}, null, 2))
