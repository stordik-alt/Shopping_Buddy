import { billaConnector } from '@/lib/ingestion/billa'
import { dmConnector } from '@/lib/ingestion/dm'
import { globusConnector } from '@/lib/ingestion/globus'
import { kosikConnector } from '@/lib/ingestion/kosik'
import { lidlConnector } from '@/lib/ingestion/lidl'
import { pennyConnector } from '@/lib/ingestion/penny'
import { rohlikConnector } from '@/lib/ingestion/rohlik'
import { loadExternalProductContext, resolveOrCreateProductFromExternal } from '@/lib/db/queries'
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

// Dry-run by default; --apply is required for any database write (same convention as the seed import).
const APPLY = process.argv.includes('--apply')
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))?.slice('--source='.length)
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length)
const limit = limitArg ? Number(limitArg) : 50_000

if (!Number.isInteger(limit) || limit <= 0) throw new Error('--limit must be a positive integer')

const selected = sourceArg ? CONNECTORS.filter((connector) => connector.source === sourceArg) : CONNECTORS

if (selected.length === 0) {
  throw new Error(`Unknown source "${sourceArg}". Available: ${CONNECTORS.map((connector) => connector.source).join(', ')}`)
}

type Classification = 'already_linked' | 'safe_name_match' | 'sku_collision' | 'new_product'

type ReportRow = {
  source: string
  externalId: string
  name: string
  classification: Classification
  candidateProductId: string | null
  candidateProductName: string | null
}

type SourceReport =
  | {
      source: string
      fetched: number
      normalized: number
      /** Products written in apply mode (a new product created or a ref linked); 0 in a dry-run. */
      writes: number
      counts: Record<Classification, number>
      rows: ReportRow[]
      errors: string[]
    }
  | {
      source: string
      error: string
      fetched: 0
      normalized: 0
      writes: 0
      counts: null
      rows: []
      errors: []
    }

async function auditConnector(connector: PriceConnector<any>, apply: boolean): Promise<SourceReport> {
  let raw: Awaited<ReturnType<PriceConnector<any>['fetchProducts']>>
  try {
    raw = await connector.fetchProducts(limit, { fullCatalog: true })
  } catch (error) {
    return {
      source: connector.source,
      error: error instanceof Error ? error.message : String(error),
      fetched: 0,
      normalized: 0,
      writes: 0,
      counts: null,
      rows: [],
      errors: [],
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

  const counts: Record<Classification, number> = { already_linked: 0, safe_name_match: 0, sku_collision: 0, new_product: 0 }
  const rows: ReportRow[] = []
  const errors: string[] = []
  let writes = 0

  for (const product of prepared) {
    try {
      // Already linked — the idempotency key is the external ref, not the name. Nothing to do.
      if (context.refs.has(product.externalId)) {
        counts.already_linked += 1
        continue
      }

      // Classify first so the report and the write always agree. `context.refs` is mutated as
      // products are written below, so a later product sees an earlier one exactly as ingestion does.
      const resolved = resolveProductForSku(context.catalog, product.name, product.externalId, new Set(context.refs.values()))
      const classification: Classification = resolved.match
        ? 'safe_name_match'
        : resolved.name !== product.name
          ? 'sku_collision'
          : 'new_product'

      if (apply) {
        // The same product-creation / ref-linking path the daily ingestion uses: a safe name match
        // only links the ref, a new product or a same-name SKU collision creates a product (with the
        // brand category override and product type). Re-running is a no-op for what was already
        // linked, because the external ref is the idempotency key.
        await resolveOrCreateProductFromExternal(
          {
            externalId: product.externalId,
            source: connector.source,
            name: product.name,
            category: product.category,
            unit: product.unit,
          },
          context,
        )
        writes += 1
      }

      counts[classification] += 1
      rows.push({
        source: connector.source,
        externalId: product.externalId,
        name: product.name,
        classification,
        candidateProductId: resolved.match?.id ?? null,
        candidateProductName: resolved.match?.name ?? null,
      })
    } catch (error) {
      errors.push(`${product.externalId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { source: connector.source, fetched: raw.length, normalized: prepared.length, writes, counts, rows, errors }
}

async function main() {
  const reports: SourceReport[] = []
  for (const connector of selected) {
    reports.push(await auditConnector(connector, APPLY))
  }

  const totalWrites = reports.reduce((sum, report) => sum + report.writes, 0)

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    writes: totalWrites,
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
