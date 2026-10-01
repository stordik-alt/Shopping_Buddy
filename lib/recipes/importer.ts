import { createHash, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { getRecipeSourceAdapter } from '@/lib/recipes/sources'
import type { Recipe, RecipeSourceAdapter } from '@/lib/recipes/types'
import { RECIPE_PARSER_VERSION } from '@/lib/recipes/parser'
import { r2PutObject } from '@/lib/storage/r2'

const DEFAULT_DELAY_MS = 250
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 10_000
const MAX_IMAGE_REDIRECTS = 2

export type RecipeImportOptions = {
  sourceId: string
  queries: string[]
  limit: number
  delayMs?: number
  dryRun?: boolean
  importImages?: boolean
  acknowledgeSourceTerms?: boolean
  imageHosts?: string[]
}

export type RecipeImportSummary = {
  sourceId: string
  discovered: number
  imported: number
  updated: number
  skipped: number
  failed: number
  imageImported: number
  imageSkipped: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function privateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true
  const a = parts[0]
  const b = parts[1]
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || a === 0 || (a === 192 && b === 168)
}

function privateIpv6(ip: string): boolean {
  const value = ip.toLowerCase()
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')
}

function blockedIp(ip: string): boolean {
  const version = isIP(ip)
  return version === 4 ? privateIpv4(ip) : version === 6 ? privateIpv6(ip) : true
}

async function assertSafeImageUrl(value: string, allowedHosts: string[]): Promise<URL> {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') throw new Error('Image URL must use HTTPS')
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  const hostAllowed = allowedHosts.some((allowedHost) => {
    const pattern = allowedHost.trim().toLowerCase().replace(/\.$/, '')
    if (!pattern) return false
    if (!pattern.includes('*')) return pattern === hostname
    if (pattern === 'ms*.ostium.cz') return /^ms[^.]*\.ostium\.cz$/.test(hostname)
    return false
  })
  if (!hostAllowed) throw new Error('Image host is not allowlisted')
  if (isIP(hostname)) {
    if (blockedIp(hostname)) throw new Error('Image IP is not allowed')
    return parsed
  }
  const addresses = await lookup(hostname, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => blockedIp(address))) {
    throw new Error('Image host resolves to a blocked IP')
  }
  return parsed
}

async function fetchImageBytes(url: string, allowedHosts: string[]): Promise<Buffer> {
  let current = await assertSafeImageUrl(url, allowedHosts)
  for (let redirect = 0; redirect <= MAX_IMAGE_REDIRECTS; redirect += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS)
    try {
      const response = await fetch(current, {
        signal: controller.signal,
        headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.1' },
        redirect: 'manual',
        cache: 'no-store',
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location || redirect === MAX_IMAGE_REDIRECTS) throw new Error('Image redirect not allowed')
        current = await assertSafeImageUrl(new URL(location, current).toString(), allowedHosts)
        continue
      }
      if (!response.ok) throw new Error('Image source returned HTTP ' + response.status)
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
      if (!contentType.startsWith('image/')) throw new Error('Image source returned a non-image content type')
      const contentLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) throw new Error('Image is too large')
      if (!response.body) throw new Error('Image source returned no body')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const result = await reader.read()
        if (result.done) break
        total += result.value.byteLength
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel()
          throw new Error('Image is too large')
        }
        chunks.push(result.value)
      }
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('Image redirect limit reached')
}

function normalizeHostList(sourceDomain: string, configured: string[] | undefined): string[] {
  const values = configured ?? []
  return [...new Set([sourceDomain, ...values.map((value) => value.trim().toLowerCase()).filter(Boolean)])]
}

async function storeRecipeImage(recipe: Recipe, adapter: RecipeSourceAdapter, imageHosts: string[]): Promise<string> {
  if (!recipe.imageUrl) throw new Error('Recipe has no image URL')
  const bytes = await fetchImageBytes(recipe.imageUrl, imageHosts)
  const output = await sharp(bytes, { failOn: 'error' })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()
  const digest = createHash('sha256').update(output).digest('hex')
  const key = 'recipe-images/' + adapter.id + '/' + digest + '.webp'
  if (process.env.STORAGE_PROVIDER?.trim().toLowerCase() !== 'r2') {
    throw new Error('Recipe image import requires STORAGE_PROVIDER=r2')
  }
  await r2PutObject(key, output, 'image/webp')
  return 'r2:' + key
}

function recipeSearchText(recipe: Recipe): string {
  const raw = [
    recipe.title,
    recipe.description ?? '',
    ...recipe.ingredients.map((ingredient) => ingredient.name),
  ].join(' ')
  const normalized = raw
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return raw.toLocaleLowerCase('cs-CZ') + ' ' + normalized
}

function recipeValues(recipe: Recipe, id: string, imageRef: string | null, imageUrl: string | null) {
  return {
    id,
    sourceId: recipe.sourceId,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    canonicalUrl: recipe.canonicalUrl,
    title: recipe.title,
    searchText: recipeSearchText(recipe),
    description: recipe.description ?? null,
    imageUrl,
    sourceImageUrl: recipe.imageUrl ?? null,
    imageRef,
    servings: recipe.servings?.toString() ?? null,
    servingsText: recipe.servingsText ?? null,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    category: recipe.category ?? null,
    cuisine: recipe.cuisine ?? null,
    ratingValue: recipe.ratingValue?.toString() ?? null,
    ratingScale: recipe.ratingScale?.toString() ?? null,
    ratingCount: recipe.ratingCount ?? null,
    ratingSource: recipe.ratingSource ?? null,
    ingredients: recipe.ingredients,
    fetchedAt: new Date(recipe.fetchedAt),
    parserVersion: recipe.parserVersion,
    updatedAt: new Date(),
  }
}

export type RecipeImageBackfillOptions = {
  sourceId?: string
  limit: number
  delayMs?: number
  dryRun?: boolean
  imageHosts?: string[]
}

export type RecipeImageBackfillSummary = {
  discovered: number
  imageImported: number
  imageSkipped: number
  failed: number
}

export async function backfillRecipeImages(options: RecipeImageBackfillOptions): Promise<RecipeImageBackfillSummary> {
  if (process.env.RECIPE_IMPORT_IMAGE_COPY_ALLOWED !== 'true') {
    throw new Error('Image copying requires RECIPE_IMPORT_IMAGE_COPY_ALLOWED=true')
  }
  if (process.env.STORAGE_PROVIDER?.trim().toLowerCase() !== 'r2') {
    throw new Error('Recipe image backfill requires STORAGE_PROVIDER=r2')
  }
  if (options.limit < 1 || options.limit > 5000) throw new Error('--limit must be an integer from 1 to 5000')

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.recipeCatalog)
    .where(options.sourceId ? eq(schema.recipeCatalog.sourceId, options.sourceId) : undefined)
    .limit(options.limit)

  const summary: RecipeImageBackfillSummary = { discovered: rows.length, imageImported: 0, imageSkipped: 0, failed: 0 }

  for (const row of rows) {
    if (row.imageRef?.startsWith('r2:')) {
      console.log('SKIP existing image: ' + row.title)
      continue
    }

    try {
      const adapter = getRecipeSourceAdapter(row.sourceId)
      const imageUrl = row.sourceImageUrl || (row.imageUrl && !row.imageUrl.startsWith('/api/') ? row.imageUrl : null)
      if (!imageUrl) {
        summary.imageSkipped += 1
        console.warn('IMAGE-SKIP ' + row.canonicalUrl + ': no source image URL')
        continue
      }

      const sourceDomain = adapter.domains[0] ?? new URL(row.canonicalUrl).hostname
      const hosts = normalizeHostList(sourceDomain, [...(adapter.imageDomains ?? []), ...(options.imageHosts ?? [])])
      if (options.dryRun) {
        console.log('DRY-RUN IMAGE-COPY: ' + row.title + ' — ' + imageUrl)
        summary.imageImported += 1
        continue
      }

      const imageRef = await storeRecipeImage({ imageUrl } as Recipe, adapter, hosts)

      {
        await db
          .update(schema.recipeCatalog)
          .set({
            imageRef,
            imageUrl: '/api/recipes/images/' + row.id,
            updatedAt: new Date(),
          })
          .where(eq(schema.recipeCatalog.id, row.id))
        console.log('IMAGE-BACKFILL ' + adapter.name + ': ' + row.title)
      }
      summary.imageImported += 1
    } catch (error) {
      summary.imageSkipped += 1
      console.warn('IMAGE-SKIP ' + row.canonicalUrl + ': ' + (error instanceof Error ? error.message : String(error)))
    }

    await sleep(options.delayMs ?? DEFAULT_DELAY_MS)
  }

  console.log(JSON.stringify(summary, null, 2))
  return summary
}

export async function importRecipeBatch(options: RecipeImportOptions): Promise<RecipeImportSummary> {
  const adapter = getRecipeSourceAdapter(options.sourceId)
  if (!options.acknowledgeSourceTerms) throw new Error('Import requires --acknowledge-source-terms')
  if (options.limit < 1) throw new Error('Import limit must be at least 1')
  if (options.importImages && process.env.RECIPE_IMPORT_IMAGE_COPY_ALLOWED !== 'true') {
    throw new Error('Image copying requires RECIPE_IMPORT_IMAGE_COPY_ALLOWED=true')
  }
  if (adapter.id === 'apetit' && process.env.RECIPE_IMPORT_APETIT_WRITTEN_PERMISSION !== 'true') {
    throw new Error('Apetit import requires RECIPE_IMPORT_APETIT_WRITTEN_PERMISSION=true')
  }

  const summary: RecipeImportSummary = { sourceId: adapter.id, discovered: 0, imported: 0, updated: 0, skipped: 0, failed: 0, imageImported: 0, imageSkipped: 0 }
  const links = new Map<string, string>()
  const knownUrls = new Set<string>()

  if (!options.dryRun) {
    const existingRows = await getDb()
      .select({ canonicalUrl: schema.recipeCatalog.canonicalUrl })
      .from(schema.recipeCatalog)
      .where(eq(schema.recipeCatalog.sourceId, adapter.id))

    for (const row of existingRows) {
      if (row.canonicalUrl) knownUrls.add(row.canonicalUrl)
    }
  }

  for (const query of options.queries) {
    if (links.size >= options.limit) break

    const excludedUrls = new Set([...knownUrls, ...links.keys()])
    const found = await adapter.search(query, {
      limit: options.limit - links.size,
      excludeUrls: excludedUrls,
    })

    for (const result of found) {
      const url = result.canonicalUrl || result.sourceUrl
      if (!knownUrls.has(url) && !links.has(url)) links.set(url, result.title)
      if (links.size >= options.limit) break
    }
  }
  summary.discovered = links.size

  for (const [url] of links) {
    try {
      const recipe = await adapter.getRecipe(url)
      if (!recipe.title || !recipe.canonicalUrl || recipe.ingredients.length === 0) {
        summary.skipped += 1
        continue
      }

      let existing: typeof schema.recipeCatalog.$inferSelect | undefined
      if (!options.dryRun) {
        existing = await getDb().query.recipeCatalog.findFirst({ where: eq(schema.recipeCatalog.canonicalUrl, recipe.canonicalUrl) })
      }

      let imageRef = existing?.imageRef ?? null
      let storedImageUrl = existing?.imageUrl ?? recipe.imageUrl ?? null
      if (options.importImages && recipe.imageUrl && !options.dryRun) {
        try {
          const sourceDomain = adapter.domains[0] ?? new URL(recipe.canonicalUrl).hostname
          const hosts = normalizeHostList(sourceDomain, [...(adapter.imageDomains ?? []), ...(options.imageHosts ?? [])])
          imageRef = await storeRecipeImage(recipe, adapter, hosts)
          summary.imageImported += 1
        } catch (error) {
          summary.imageSkipped += 1
          console.warn('IMAGE-SKIP ' + recipe.canonicalUrl + ': ' + (error instanceof Error ? error.message : String(error)))
        }
      }

      if (options.dryRun) {
        if (options.importImages && recipe.imageUrl) console.log('DRY-RUN IMAGE-COPY skipped: ' + recipe.imageUrl)
        console.log('DRY-RUN ' + adapter.name + ': ' + recipe.title + ' — ' + recipe.canonicalUrl)
        continue
      }

      const db = getDb()
      const id = existing?.id ?? randomUUID()
      const finalImageUrl = imageRef ? '/api/recipes/images/' + id : storedImageUrl
      const values = recipeValues(recipe, id, imageRef, finalImageUrl)
      await db.insert(schema.recipeCatalog).values(values).onConflictDoUpdate({
        target: schema.recipeCatalog.canonicalUrl,
        set: {
          sourceId: values.sourceId, sourceName: values.sourceName, sourceUrl: values.sourceUrl, title: values.title,
          searchText: values.searchText, description: values.description, imageUrl: values.imageUrl, sourceImageUrl: values.sourceImageUrl, imageRef: values.imageRef,
          servings: values.servings, servingsText: values.servingsText, prepTimeMinutes: values.prepTimeMinutes, cookTimeMinutes: values.cookTimeMinutes,
          totalTimeMinutes: values.totalTimeMinutes, category: values.category, cuisine: values.cuisine, ratingValue: values.ratingValue,
          ratingScale: values.ratingScale, ratingCount: values.ratingCount, ratingSource: values.ratingSource, ingredients: values.ingredients,
          fetchedAt: values.fetchedAt, parserVersion: values.parserVersion, updatedAt: values.updatedAt,
        },
      })

      if (existing) summary.updated += 1
      else summary.imported += 1
      console.log('IMPORT ' + adapter.name + ': ' + recipe.title)
    } catch (error) {
      summary.failed += 1
      console.warn('FAIL ' + adapter.name + ': ' + url + ': ' + (error instanceof Error ? error.message : String(error)))
    }
    await sleep(options.delayMs ?? DEFAULT_DELAY_MS)
  }

  console.log(JSON.stringify(summary, null, 2))
  return summary
}

export function parseRecipeImportCli(argv: string[]): Omit<RecipeImportOptions, 'sourceId'> {
  const queries: string[] = []
  const imageHosts: string[] = []
  let limit = 20
  let delayMs = DEFAULT_DELAY_MS
  let dryRun = false
  let importImages = false
  let acknowledgeSourceTerms = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if ((arg === '--query' || arg === '-q') && next) { queries.push(next); index += 1 }
    else if (arg?.startsWith('--query=')) queries.push(arg.slice('--query='.length))
    else if (arg?.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length))
    else if (arg?.startsWith('--delay-ms=')) delayMs = Number(arg.slice('--delay-ms='.length))
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--images') importImages = true
    else if (arg === '--acknowledge-source-terms') acknowledgeSourceTerms = true
    else if (arg?.startsWith('--image-host=')) imageHosts.push(arg.slice('--image-host='.length))
  }

  if (queries.length === 0) throw new Error('At least one --query is required')
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--limit must be an integer from 1 to 5000')
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60_000) throw new Error('--delay-ms must be an integer from 0 to 60000')
  return { queries, limit, delayMs, dryRun, importImages, acknowledgeSourceTerms, imageHosts }
}

export async function runRecipeImportCli(sourceId: string): Promise<void> {
  const options = parseRecipeImportCli(process.argv.slice(2))
  await importRecipeBatch({ sourceId, ...options })
}

export const RECIPE_IMPORTER_PARSER_VERSION = RECIPE_PARSER_VERSION