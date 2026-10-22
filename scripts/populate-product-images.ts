import { CURATED_IMAGES } from './curated-image-map'
import { getDb } from '../lib/db/client'
import { productTypes } from '../lib/db/schema'
import { storeProductTypeImageFromBuffer } from '../lib/product-images'
import { fetchPublicImage } from '../lib/ingestion/public-image'
import { and, eq, isNull } from 'drizzle-orm'

const API_REQUEST_INTERVAL_MS = 4_000
const PRODUCT_DELAY_MS = 2_000
let lastApiRequestAt = 0
const SOURCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024

function isRateLimitedApi(url: string) {
  const hostname = new URL(url).hostname
  return hostname === 'world.openfoodfacts.org' || hostname === 'commons.wikimedia.org'
}

async function waitForApiSlot(url: string) {
  if (!isRateLimitedApi(url)) return
  const delay = Math.max(0, API_REQUEST_INTERVAL_MS - (Date.now() - lastApiRequestAt))
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
  lastApiRequestAt = Date.now()
}

/**
 * Respect source API limits and retry temporary rate-limit/server errors.
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitForApiSlot(url)
    try {
      const response = await fetch(url, options)
      if (response.status !== 429 && response.status < 500) return response
      if (attempt === maxRetries) return response

      const retryAfter = response.headers.get('Retry-After')
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN
      const retryAt = retryAfter && !Number.isFinite(retryAfterSeconds) ? Date.parse(retryAfter) : NaN
      const delay = Number.isFinite(retryAfterSeconds)
        ? Math.max(0, retryAfterSeconds * 1000)
        : Number.isFinite(retryAt)
          ? Math.max(0, retryAt - Date.now())
          : Math.pow(2, attempt) * 2000
      console.log(`⚠️ Temporary source error (${response.status}). Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    } catch (error) {
      if (attempt === maxRetries) throw error
      const delay = Math.pow(2, attempt) * 2000
      console.log(`⚠️ Source request failed. Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Source request retries exhausted')
}

/**
 * Tries to find a representative image for a product type using Open Food Facts.
 */
async function findOpenFoodFactsImage(searchQuery: string) {
  try {
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQuery)}&search_simple=1&action=process&json=1&pagesize=5`
    const response = await fetchWithRetry(searchUrl, {
      headers: { 'User-Agent': 'AnitkaProductImagePopulator/1.0' }
    })
    if (!response.ok) return null

    const data: any = await response.json()
    const products = data.products || []

    for (const product of products) {
      const imageUrl = product.image_url
      if (imageUrl) return imageUrl
    }
  } catch (e: any) {
    console.error(`   ⚠️ Open Food Facts error for ${searchQuery}: ${e.message}`)
  }
  return null
}

async function downloadSourceImage(url: string) {
  const { bytes } = await fetchPublicImage(url, {
    'User-Agent': 'AnitkaProductImagePopulator/1.0',
  }, { maxBytes: SOURCE_IMAGE_MAX_BYTES })
  return Buffer.from(bytes)
}

function plainMetadataValue(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : ''
}

/**
 * Iterates through a list of Wikimedia file results to find the first valid image URL.
 */
async function handleFileResults(files: any[], typeKey: string, searchQuery: string, apply: boolean) {
  for (const file of files) {
    try {
      const title = file.title
      const imageUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|thumburl|extmetadata&titles=${encodeURIComponent(title)}`
      const response = await fetchWithRetry(imageUrl, {
        headers: { 'User-Agent': 'AnitkaProductImagePopulator/1.0' }
      })
      if (!response.ok) continue
      const data: any = await response.json()
      const pages = data.query?.pages
      const pageId = Object.keys(pages || {})[0]
      const imageInfo = pages?.[pageId]?.imageinfo?.[0]
      if (!imageInfo) continue

      const directUrl = imageInfo.thumburl || imageInfo.url
      const metadata = imageInfo.extmetadata ?? {}
      const license = plainMetadataValue(metadata.LicenseShortName?.value)
      const licenseUrl = plainMetadataValue(metadata.LicenseUrl?.value)
      const attributionValue = plainMetadataValue(metadata.AttributionRequired?.value).toLowerCase()
      const attributionNotRequired = attributionValue === 'false'
      console.log(`✅ Found image for ${searchQuery}: ${title} (${license || 'license metadata missing'})`)

      if (!apply) {
        console.log(`   Dry run: candidate ${directUrl}${licenseUrl ? ` (license: ${licenseUrl})` : ''}`)
        return { imageRef: null, found: true }
      }

      // The app does not yet persist and display attribution metadata. Until that is implemented,
      // auto-import only files explicitly marked as not requiring attribution (for example CC0 or
      // public domain). Files with missing license metadata are skipped as well.
      if (!license || !attributionNotRequired) {
        console.log(`   ⚠️ Skipping: source needs attribution or has incomplete license metadata.`)
        continue
      }

      try {
        const buffer = await downloadSourceImage(directUrl)
        const imageRef = await storeProductTypeImageFromBuffer(typeKey, buffer)
        return { imageRef, found: true }
      } catch (storeError: any) {
        console.error(`   ⚠️ Failed to store image ${title}: ${storeError.message}`)
        continue
      }
    } catch (e: any) {
      console.error(`   ⚠️ Error processing file ${file.title}: ${e.message}`)
      continue
    }
  }
  return { imageRef: null, found: false }
}

async function populateProductImages() {
  const db = getDb()
  const apply = process.argv.includes('--apply')
  console.log(`🚀 Starting product image population (${apply ? 'apply' : 'dry run'})...`)

  let successCount = 0
  let failureCount = 0
  let candidateCount = 0
  let noImageCount = 0

  const types = await db.select().from(productTypes)

  for (const type of types) {
    const { key, name } = type

    if (type.imageRef) continue

    try {
      const searchQuery = CURATED_IMAGES[key] || name
      console.log(`🔍 Searching for: ${searchQuery} (${key})...`)

      // Tier 1: Open Food Facts (Fast, retail-focused)
      const offImageUrl = await findOpenFoodFactsImage(searchQuery)
      if (offImageUrl) {
        console.log(`✨ Open Food Facts candidate (CC BY-SA; attribution support required before import): ${offImageUrl}`)
        candidateCount++
      }

      // Tier 2: Wikimedia Commons (Fallback, generic)
      const encodedQuery = encodeURIComponent(searchQuery)
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=file:${encodedQuery}+product&srnamespace=6&srlimit=5`
      const searchResponse = await fetchWithRetry(searchUrl, {
        headers: { 'User-Agent': 'AnitkaProductImagePopulator/1.0' }
      })
      if (searchResponse.ok) {
        const searchData: any = await searchResponse.json()
        let searchResults = searchData.query?.search

        if (!searchResults || searchResults.length === 0) {
          const broadSearchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=file:${encodedQuery}&srnamespace=6&srlimit=5`
          const broadResponse = await fetchWithRetry(broadSearchUrl, {
            headers: { 'User-Agent': 'AnitkaProductImagePopulator/1.0' }
          })
          if (broadResponse.ok) {
            const broadData: any = await broadResponse.json()
            searchResults = broadData.query?.search
          }
        }

        if (searchResults && searchResults.length > 0) {
          const result = await handleFileResults(searchResults, key, searchQuery, apply)
          if (result.found) {
            if (result.imageRef) {
              await db.update(productTypes)
                .set({ imageRef: result.imageRef })
                .where(and(eq(productTypes.key, key), isNull(productTypes.imageRef)))
              successCount++
            } else {
              candidateCount++
            }
            continue
          }
        }
      }
      noImageCount++
    } catch (error: any) {
      console.error(`❌ ${name} (${key}): ${error.message}`)
      failureCount++
    } finally {
      await new Promise(resolve => setTimeout(resolve, PRODUCT_DELAY_MS))
    }
  }

  console.log(`\n✨ Population complete!`)
  console.log(`✅ Successes: ${successCount}`)
  console.log(`❌ Failures: ${failureCount}`)
  console.log(`🔎 Candidates found: ${candidateCount}`)
  console.log(`⏭️  No eligible Commons image found: ${noImageCount}`)
  if (!apply) console.log('No R2 objects or database rows were changed. Pass --apply to store the selected candidates.')
}

populateProductImages().catch((error) => {
  console.error('Fatal error during population:', error)
  process.exit(1)
})
