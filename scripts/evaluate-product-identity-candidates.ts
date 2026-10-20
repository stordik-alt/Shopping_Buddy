import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  evaluateProductIdentityPairs,
  type LabelledProductIdentityPair,
} from '@/lib/product-identity-evaluation'

function arg(name: string, fallback: string): string {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
}

async function main(): Promise<void> {
  const inputPath = resolve(arg('input', 'data/external/product-identity-matching-fixture.json'))
  const outputPath = resolve(arg('out', 'data/external/product-identity-evaluation-report.json'))
  const threshold = Number(arg('threshold', '0.3'))
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as {
    schemaVersion?: number
    purpose?: string
    pairs?: LabelledProductIdentityPair[]
  }
  if (!Array.isArray(raw.pairs)) {
    throw new Error('Input JSON must contain a pairs[] array of labelled pairs')
  }

  const evaluation = evaluateProductIdentityPairs(raw.pairs, threshold)
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    input: inputPath,
    purpose: raw.purpose ?? 'unspecified',
    evaluationKind: /smoke-test|synthetic/i.test(raw.purpose ?? '')
      ? 'synthetic_smoke_test'
      : 'labelled_evaluation',
    warning: 'Metrics only describe this supplied labelled set; synthetic smoke-test results are not evidence of production accuracy. Scores are heuristics, not probabilities.',
    ...evaluation,
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({
    outputPath,
    evaluationKind: report.evaluationKind,
    total: report.total,
    truePositive: report.truePositive,
    falsePositive: report.falsePositive,
    trueNegative: report.trueNegative,
    falseNegative: report.falseNegative,
    accuracy: report.accuracy,
    precision: report.precision,
    recall: report.recall,
    specificity: report.specificity,
    threshold: report.threshold,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
