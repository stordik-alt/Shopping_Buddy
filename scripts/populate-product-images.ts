import { CURATED_IMAGES } from './curated-image-map'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { getDb } from '../lib/db/client'
import { productTypes } from '../lib/db/schema'
import { storeProductTypeImage } from '../lib/product-images'
import { eq } from 'drizzle-orm'

/**
 * Helper to handle Wikimedia API rate limits (429) with exponential backoff.
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options)
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, i) * 2000
      console.log(`⚠️ Rate limited (429). Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
      continue
    }
    return response
  }
  const response = await fetch(url, options)
  if (response.status === 429) {
     console.log(`⚠️ Rate limited (429) after max retries.`)
  }
  return response
}

/**
 * Iterates through a list of Wikimedia file results to find the first valid image URL.
 */
async function handleFileResults(files: any[], typeKey: string, searchQuery: string) {
  for (const file of files) {
    try {
      const title = file.title
      // Request thumburl specifically to avoid downloading huge original files
      const imageUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|thumburl&titles=${encodeURIComponent(title)}`
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

      console.log(`✅ Found image for ${searchQuery}: ${title} (${directUrl.includes('thumb') ? 'thumb' : 'orig'})`)

      try {
        // BYPASS storeProductTypeImage (which uses fetchPublicImage) to avoid "flyer image failed" proxy rate limits
        const imgResponse = await fetchWithRetry(directUrl, {
          headers: { 'User-Agent': 'AnitkaProductImagePopulator/1.0' }
        })
        if (!imgResponse.ok) throw new Error(`Image download failed: ${imgResponse.status}`)

        const buffer = Buffer.from(await imgResponse.arrayBuffer())
        const imageRef = await storeProductTypeImageFromBuffer(typeKey, buffer)
        return imageRef
      } catch (storeError: any) {
        console.error(`   ⚠️ Failed to store image ${title}: ${storeError.message}`)
        continue
      }
    } catch (e: any) {
      console.error(`   ⚠️ Error processing file ${file.title}: ${e.message}`)
      continue
    }
  }
  return null
}

async function populateProductImages() {
  const db = getDb()
  console.log('🚀 Starting product image population (File-based sourcing pivot)...')

  let successCount = 0
  let failureCount = 0

  const types = await db.select().from(productTypes)

  for (const type of types) {
    const { key, name } = type

    // Skip if already has image
    if (type.imageRef) {
      continue
    }

    try {
      // Determine the best search query: 1. Curated Map -> 2. Product Name
      const searchQuery = CURATED_IMAGES[key] || name
      console.log(`🔍 Searching for: ${searchQuery} (${key})...`)

      const encodedQuery = encodeURIComponent(searchQuery)

      // 1. Search for actual files in the File namespace
      // We use 'srnamespace=6' for the File namespace.
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=file:${encodedQuery}+product&srnamespace=6&srlimit=5`
      const searchResponse = await fetchWithRetry(searchUrl, {
        headers: { 'User-Agent': 'AnitkaProductImagePopulator/1.0' }
      })
      if (!searchResponse.ok) throw new Error(`Wikimedia Search API failed: ${searchResponse.status}`)
      const searchData: any = await searchResponse.json()
      let searchResults = searchData.query?.search

      if (!searchResults || searchResults.length === 0) {
        // Try broader search if "product" keyword failed
        const broadSearchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=file:${encodedQuery}&srnamespace=6&srlimit=5`
        const broadResponse = await fetchWithRetry(broadSearchUrl, {
          headers: { 'User-Agent': 'AnitkaProductImagePopulator/1.0' }
        })
        if (!broadResponse.ok) throw new Error(`Wikimedia Broad Search API failed: ${broadResponse.status}`)
        const broadData: any = await broadResponse.json()
        searchResults = broadData.query?.search
      }

      if (!searchResults || searchResults.length === 0) {
        throw new Error('No matching files found')
      }

      const imageRef = await handleFileResults(searchResults, key, searchQuery)
      if (imageRef) {
        await db.update(productTypes).set({ imageRef }).where(eq(productTypes.key, key))
        successCount++
      } else {
        throw new Error('No valid image URLs found in results')
      }
    } catch (error: any) {
      console.error(`❌ ${name} (${key}): ${error.message}`)
      failureCount++
    }

    // Baseline delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log(`\n✨ Population complete!`)
  console.log(`✅ Successes: ${successCount}`)
  console.log(`❌ Failures: ${failureCount}`)
}

populateProductImages().catch((error) => {
  console.error('Fatal error during population:', error)
  process.exit(1)
})
