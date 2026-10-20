import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { generateCrossRetailerCandidates } from '@/lib/product-identity-cross-retailer'
import type { ProductIdentityRecord } from '@/lib/product-identity-candidates'

function arg(name: string, fallback: string): string {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
}
function numberArg(name: string, fallback: number): number {
  const value = Number(arg(name, String(fallback)))
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid --${name}: ${value}`)
  return value
}
type InputRecord = Record<string, unknown>
async function readRecords(path: string, retailer: string): Promise<ProductIdentityRecord[]> {
  const raw = JSON.parse(await readFile(resolve(path), 'utf8')) as {
    source?: string; products?: InputRecord[]; records?: InputRecord[]
  }
  const sourceRecords = raw.products ?? raw.records
  if (!Array.isArray(sourceRecords)) throw new Error(`Input ${path} must contain products[] or records[]`)
  return sourceRecords.map((item) => ({
    id: typeof item.id === 'string' ? item.id : undefined,
    retailer,
    sourceCode: typeof item.sourceCode === 'string' ? item.sourceCode : undefined,
    url: typeof item.url === 'string' ? item.url : undefined,
    name: typeof item.name === 'string' ? item.name : undefined,
    brand: typeof item.brand === 'string' ? item.brand : undefined,
    ean: typeof item.ean === 'string' ? item.ean : undefined,
    categoryPath: Array.isArray(item.categoryPath)
      ? item.categoryPath.filter((part): part is string => typeof part === 'string')
      : undefined,
  }))
}
async function main(): Promise<void> {
  const tetaPath = arg('teta-input', 'data/external/teta-github-pilot.json')
  const dmPath = arg('dm-input', 'data/external/dm-database-export.json')
  const outputPath = resolve(arg('out', 'data/external/teta-dm-identity-candidates-report.json'))
  const minimumScore = numberArg('minimum-score', 0.3)
  const maxCandidates = Math.min(10_000, Math.floor(numberArg('max-candidates', 1000)))
  const [teta, dm] = await Promise.all([readRecords(tetaPath, 'TETA'), readRecords(dmPath, 'DM')])
  const records = [...teta, ...dm]
  const candidates = generateCrossRetailerCandidates(records, {
    leftRetailer: 'TETA', rightRetailer: 'DM', minimumScore, maxCandidates,
  })
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputs: { teta: tetaPath, dm: dmPath },
    inputCounts: {
      teta: teta.length,
      dm: dm.length,
      tetaWithName: teta.filter((record) => record.name?.trim()).length,
      dmWithName: dm.filter((record) => record.name?.trim()).length,
      tetaWithEan: teta.filter((record) => record.ean).length,
      dmWithEan: dm.filter((record) => record.ean).length,
    },
    parameters: { minimumScore, maxCandidates },
    candidateCount: candidates.length,
    policy: 'Cross-retailer candidates only. All candidates require human review. No database writes, product merges, or price imports.',
    candidates,
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({
    outputPath, inputCounts: report.inputCounts,
    candidateCount: report.candidateCount, minimumScore, maxCandidates,
    mode: 'read-only',
  }, null, 2))
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
