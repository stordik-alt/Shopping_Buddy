import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  generateProductIdentityCandidates,
  type ProductIdentityRecord,
} from '@/lib/product-identity-candidates'

function arg(name: string, fallback: string): string {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
}

function numberArg(name: string, fallback: number): number {
  const value = Number(arg(name, String(fallback)))
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid --${name}: ${value}`)
  return value
}

async function main(): Promise<void> {
  const inputPath = resolve(arg('input', 'data/external/teta-github-pilot.json'))
  const outputPath = resolve(arg('out', 'data/external/product-identity-candidates-report.json'))
  const minimumScore = numberArg('minimum-score', 0.3)
  const maxCandidates = Math.min(10000, Math.floor(numberArg('max-candidates', 1000)))
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as {
    source?: string
    collectedAt?: string
    products?: Array<Record<string, unknown>>
    records?: Array<Record<string, unknown>>
  }
  const sourceRecords = raw.products ?? raw.records
  if (!Array.isArray(sourceRecords)) {
    throw new Error('Input JSON must contain a products[] or records[] array')
  }

  const retailer = /teta/i.test(raw.source ?? inputPath) ? 'TETA' : 'UNKNOWN'
  const records: ProductIdentityRecord[] = sourceRecords.map((item, index) => ({
    id: typeof item.id === 'string' ? item.id : undefined,
    retailer: typeof item.retailer === 'string' ? item.retailer : retailer,
    sourceCode: typeof item.sourceCode === 'string' ? item.sourceCode : undefined,
    url: typeof item.url === 'string' ? item.url : undefined,
    name: typeof item.name === 'string' ? item.name : undefined,
    brand: typeof item.brand === 'string' ? item.brand : undefined,
    ean: typeof item.ean === 'string' ? item.ean : undefined,
    categoryPath: Array.isArray(item.categoryPath)
      ? item.categoryPath.filter((part): part is string => typeof part === 'string')
      : undefined,
  }))

  const candidates = generateProductIdentityCandidates(records, { minimumScore, maxCandidates })
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    input: inputPath,
    source: raw.source ?? null,
    collectedAt: raw.collectedAt ?? null,
    inputRecordCount: records.length,
    recordsWithName: records.filter((record) => record.name?.trim()).length,
    recordsWithEan: records.filter((record) => record.ean).length,
    parameters: { minimumScore, maxCandidates },
    candidateCount: candidates.length,
    policy: 'All candidates require human review. No database writes, product merges, or price imports.',
    candidates,
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({
    outputPath,
    inputRecordCount: report.inputRecordCount,
    recordsWithName: report.recordsWithName,
    recordsWithEan: report.recordsWithEan,
    candidateCount: report.candidateCount,
    minimumScore,
    maxCandidates,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
