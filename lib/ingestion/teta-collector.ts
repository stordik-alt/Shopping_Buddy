// Collects Teta's public online catalog into NDJSON files.
//
// The catalog is walked in two layers, because a category listing page carries much less than a
// product page:
//
//   1. the 14 top-level categories, one listing page each (40 products per page), and
//   2. one product page per product, which is where the package size, the brand attribute and the
//      description live.
//
// The walk is resumable: a JSON state file records which listing pages and which product pages are
// done, so an interrupted run continues where it stopped instead of starting over. The output is
// append-only NDJSON — one normalized record per line — which is the format the importer reads.
//
// Everything here is deliberately slow: one request per second, the retailer's robots.txt rules
// respected, and nothing but public pages (CLAUDE.md sections 9 and 15). A 13,000-product catalog
// read at that pace takes hours, which is why the run is split into chunks (GitHub Actions) and
// why the state file exists.

import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { TETA_TOP_LEVEL_CATEGORY_LIST } from '@/lib/ingestion/teta'
import {
  tetaCatalogFromDetail,
  tetaCatalogFromListingPayload,
  type TetaCatalogProduct,
} from '@/lib/ingestion/teta-catalog'
import {
  parseTetaDetailPayload,
  parseTetaListingPayload,
} from '@/lib/ingestion/teta-payload'
import { fetchTetaDetailPage, fetchTetaListingPage } from '@/lib/ingestion/teta-public-html'

/** One line of the NDJSON output. */
export type TetaCatalogRecord = TetaCatalogProduct & {
  /** Which layer the record came from. */
  kind: 'listing' | 'detail'
}

export type TetaCollectState = {
  schemaVersion: 1
  startedAt: string
  categories: Record<string, { pagesDone: number[]; lastPage?: number; totalItems?: number }>
  /** Product slug -> 'done' | 'failed'. */
  details: Record<string, 'done' | 'failed'>
}

export function emptyTetaCollectState(): TetaCollectState {
  return { schemaVersion: 1, startedAt: new Date().toISOString(), categories: {}, details: {} }
}

/** The state of a finished run, read back from disk. */
export async function readTetaCollectState(path: string): Promise<TetaCollectState> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as TetaCollectState
    if (parsed.schemaVersion !== 1) throw new Error(`Unknown Teta collect state version: ${parsed.schemaVersion}`)
    return { ...emptyTetaCollectState(), ...parsed }
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return emptyTetaCollectState()
    throw error
  }
}

export async function writeTetaCollectState(path: string, state: TetaCollectState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/** The pages of one category that still have to be read. */
export function listingPagesToFetch(state: TetaCollectState, taxon: string, lastPage: number): number[] {
  const done = new Set(state.categories[taxon]?.pagesDone ?? [])
  const pages: number[] = []
  for (let page = 1; page <= lastPage; page += 1) {
    if (!done.has(page)) pages.push(page)
  }
  return pages
}

export type TetaCollectorDeps = {
  fetchListing(taxon: string, page: number): Promise<string>
  fetchDetail(slug: string): Promise<string>
}

const defaultDeps: TetaCollectorDeps = {
  fetchListing: fetchTetaListingPage,
  fetchDetail: fetchTetaDetailPage,
}

export type TetaListingRun = {
  products: number
  pages: number
  failures: string[]
  state: TetaCollectState
}

/**
 * Reads the category listings and writes one record per product.
 *
 * `limit` bounds how many listing pages this run reads, so the work can be split into chunks; the
 * state file remembers the rest. A page that fails is recorded and the walk continues — one broken
 * page must not lose the other 339.
 */
export async function collectTetaListings(options: {
  outputPath: string
  statePath: string
  categories?: string[]
  limit?: number
  deps?: TetaCollectorDeps
  state?: TetaCollectState
  log?: (message: string) => void
}): Promise<TetaListingRun> {
  const deps = options.deps ?? defaultDeps
  const state = options.state ?? (await readTetaCollectState(options.statePath))
  const categories = options.categories ?? TETA_TOP_LEVEL_CATEGORY_LIST
  const failures: string[] = []
  let products = 0
  let pages = 0

  await mkdir(dirname(options.outputPath), { recursive: true })

  for (const taxon of categories) {
    // The first page tells how many pages the category has.
    let lastPage = state.categories[taxon]?.lastPage
    let firstPageHtml: string | null = null
    if (lastPage === undefined) {
      try {
        firstPageHtml = await deps.fetchListing(taxon, 1)
      } catch (error) {
        failures.push(`listing ${taxon} page 1: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      const payload = parseTetaListingPayload(firstPageHtml)
      lastPage = payload.pagination.lastPage
      state.categories[taxon] = {
        pagesDone: state.categories[taxon]?.pagesDone ?? [],
        lastPage,
        totalItems: payload.pagination.totalItems,
      }
    }

    const pending = listingPagesToFetch(state, taxon, lastPage)
    const budget = options.limit === undefined ? pending.length : Math.min(pending.length, Math.max(0, options.limit - pages))
    for (const page of pending.slice(0, budget)) {
      let html = firstPageHtml
      try {
        if (!html) html = await deps.fetchListing(taxon, page)
        const payload = parseTetaListingPayload(html)
        const records = tetaCatalogFromListingPayload(payload).map((product): TetaCatalogRecord => ({
          ...product,
          kind: 'listing',
        }))
        await appendFile(options.outputPath, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8')
        products += records.length
        pages += 1
        state.categories[taxon].pagesDone.push(page)
        state.categories[taxon].pagesDone.sort((a, b) => a - b)
        options.log?.(`${taxon} page ${page}/${lastPage}: ${records.length} products`)
      } catch (error) {
        failures.push(`listing ${taxon} page ${page}: ${error instanceof Error ? error.message : String(error)}`)
        options.log?.(`listing ${taxon} page ${page} failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        firstPageHtml = null
      }
      await writeTetaCollectState(options.statePath, state)
    }
  }

  await writeTetaCollectState(options.statePath, state)
  return { products, pages, failures, state }
}

export type TetaDetailRun = {
  products: number
  failures: string[]
  state: TetaCollectState
}

/**
 * Reads the product pages of the products the listing pass found and writes one record per
 * product. The product page is what carries the package size and the brand attribute, so this is
 * the layer that makes the catalog comparable with other retailers.
 */
export async function collectTetaDetails(options: {
  outputPath: string
  statePath: string
  slugs: string[]
  limit?: number
  deps?: TetaCollectorDeps
  state?: TetaCollectState
  log?: (message: string) => void
}): Promise<TetaDetailRun> {
  const deps = options.deps ?? defaultDeps
  const state = options.state ?? (await readTetaCollectState(options.statePath))
  const failures: string[] = []
  let products = 0

  await mkdir(dirname(options.outputPath), { recursive: true })

  const pending = options.slugs.filter((slug) => state.details[slug] !== 'done')
  const budget = options.limit === undefined ? pending.length : Math.min(pending.length, Math.max(0, options.limit))

  for (const slug of pending.slice(0, budget)) {
    try {
      const html = await deps.fetchDetail(slug)
      const detail = parseTetaDetailPayload(html)
      const product = tetaCatalogFromDetail(detail)
      if (!product) {
        state.details[slug] = 'failed'
        failures.push(`detail ${slug}: unusable product`)
        continue
      }
      const record: TetaCatalogRecord = { ...product, kind: 'detail' }
      await appendFile(options.outputPath, JSON.stringify(record) + '\n', 'utf8')
      products += 1
      state.details[slug] = 'done'
    } catch (error) {
      state.details[slug] = 'failed'
      failures.push(`detail ${slug}: ${error instanceof Error ? error.message : String(error)}`)
    }
    await writeTetaCollectState(options.statePath, state)
  }

  await writeTetaCollectState(options.statePath, state)
  return { products, failures, state }
}

/** The product slugs of a listing NDJSON file, in the order they appear. */
export async function readTetaSlugs(path: string): Promise<string[]> {
  const raw = await readFile(path, 'utf8')
  const slugs: string[] = []
  const seen = new Set<string>()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line) as { slug?: string }
      if (record.slug && !seen.has(record.slug)) {
        seen.add(record.slug)
        slugs.push(record.slug)
      }
    } catch {
      // A half-written line (an interrupted run) is skipped; the page is read again.
    }
  }
  return slugs
}

/** The records of an NDJSON file, keyed by their product code — the last record of a product wins,
 *  which is the product page's record when both layers are present. */
export async function readTetaCatalogRecords(path: string): Promise<Map<string, TetaCatalogRecord>> {
  const records = new Map<string, TetaCatalogRecord>()
  const raw = await readFile(path, 'utf8')
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line) as TetaCatalogRecord
      if (record.externalId) records.set(record.externalId, record)
    } catch {
      // A half-written line is skipped; its product is read again.
    }
  }
  return records
}
