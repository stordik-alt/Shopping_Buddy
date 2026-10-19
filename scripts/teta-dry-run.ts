// Dry run of the proposed Teta importer over a local fixture file (docs/42_TETA_DATA_SOURCE_AUDIT.md).
// No network, no database: prints what an import would accept/reject. Usage:
//   pnpm teta:dry-run [path-to-fixture.json]
import { readFileSync } from 'node:fs'
import { dryRunTeta, parseTetaFixture } from '@/lib/ingestion/teta'

const path = process.argv[2] ?? 'lib/ingestion/fixtures/teta-catalog.sample.json'
const report = dryRunTeta(parseTetaFixture(readFileSync(path, 'utf8')), new Date().toISOString().slice(0, 10))
console.log(JSON.stringify({ ...report, accepted: report.accepted.length }, null, 2))
