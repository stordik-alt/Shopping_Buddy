import { billaConnector } from '@/lib/ingestion/billa'
import { dmConnector } from '@/lib/ingestion/dm'
import { globusConnector } from '@/lib/ingestion/globus'
import { kosikConnector } from '@/lib/ingestion/kosik'
import { lidlConnector } from '@/lib/ingestion/lidl'
import { pennyConnector } from '@/lib/ingestion/penny'
import { rohlikConnector } from '@/lib/ingestion/rohlik'
import { loadExternalProductContext } from '@/lib/db/queries'
import { resolveProductForSku } from '@/lib/products'
import type { PriceConnector } from '@/lib/ingestion/types'

const CONNECTORS: PriceConnector<any>[] = [
  billaConnector,
  pennyConnector,
  lidlConnector,
  dmConnector,
  globusConnector,
  rohlikConnector,
  kosikConnector,
]

const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))?.slice('--source='.length)
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length)
const limit = limitArg ? Number(limitArg) : 50_000

if (!Number.isInteger(limit) || limit <= 0) throw new Error('--limit must be a positive integer')

const selected = sourceArg ? CONNECTORS.filter((connector) => connector.source === sourceArg) : CONNECTORS

if (selected.length === 0) {
  throw new Error(`Unknown source "${sourceArg}". Available: ${CONNECTORS.map((connector) => connector.source).join(', ')}`)
}

type Classification = 'already_linked' | 'safe_name_match' | 'sku_collision' | 'new_product'

type SourceReport =
  | {
      source: string
      fetched: number
      normalized: number
      counts: Record<Classification, number>
      rows: Array<{
        source: string
        externalId: string
        name: string
        classification: Classification
        candidateProductId: string | null
        candidateProductName: string | null
      }>
    }
  | {
      source: string
      error: string
      fetched: 0
      normalized: 0
      counts: null
      rows: []
    }

async function auditConnector(connector: PriceConnector<any>): Promise<SourceReport> {
  let raw: Awaited<ReturnType<PriceConnector<any>['fetchProducts']>>
  try {
    raw = await connector.fetchProducts(limit, { fullCatalog: true })
  } catch (error) {
    return {
      source: connector.source,
      error: error instanceof Error ? error.message : String(error),
      fetched: 0,
      normalized: 0,
      counts: null,
      rows: [],
    }
  }

  const prepared = raw.flatMap((item) => {
    try {
      const normalized = connector.normalize(item, new Date().toISOString().slice(0, 10))
      return normalized ? [normalized] : []
    } catch {
      return []
    }
  })

  const context = await loadExternalProductContext(connector.source, {
    externalIds: prepared.map((product) => product.externalId),
    names: prepared.map((product) => product.name),
  })
  const linkedProductIds = new Set(context.refs.values())

  const rows = prepared.map((product) => {
    if (context.refs.has(product.externalId)) {
      return {
        source: connector.source,
        externalId: product.externalId,
        name: product.name,
        classification: 'already_linked' as Classification,
        candidateProductId: context.refs.get(product.externalId) ?? null,
        candidateProductName: context.catalog.find((item) => item.id === context.refs.get(product.externalId))?.name ?? null,
      }
    }

    const resolved = resolveProductForSku(context.catalog, product.name, product.externalId, linkedProductIds)
    const classification: Classification = resolved.match
      ? 'safe_name_match'
      : resolved.name !== product.name
        ? 'sku_collision'
        : 'new_product'

    return {
      source: connector.source,
      externalId: product.externalId,
      name: product.name,
      classification,
      candidateProductId: resolved.match?.id ?? null,
      candidateProductName: resolved.match?.name ?? null,
    }
  })

  const counts = rows.reduce<Record<Classification, number>>(
    (result, row) => {
      result[row.classification] += 1
      return result
    },
    { already_linked: 0, safe_name_match: 0, sku_collision: 0, new_product: 0 },
  )

  return { source: connector.source, fetched: raw.length, normalized: prepared.length, counts, rows }
}

async function main() {
  const reports: SourceReport[] = []
  for (const connector of selected) {
    reports.push(await auditConnector(connector))
  }

  console.log(JSON.stringify({
    mode: 'dry-run',
    writes: 0,
    reports: reports.map((report) =>
      'rows' in report
        ? { ...report, rows: report.rows.filter((row) => row.classification !== 'already_linked') }
        : report,
    ),
  }, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
