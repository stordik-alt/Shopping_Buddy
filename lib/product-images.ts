import { fetchPublicImage } from '@/lib/ingestion/public-image'
import { r2PutObject } from '@/lib/storage/r2'
import sharp from 'sharp'
import crypto from 'node:crypto'

/**
 * Processes and stores a public image for a product type.
 *
 * Pipeline: Fetch -> Auto-rotate -> Resize -> WebP -> Hash -> Store.
 */
export async function storeProductTypeImage(
  typeKey: string,
  url: string,
  headers: HeadersInit = {},
) {
  // 1. Fetch the image (SSRF guarded)
  const { bytes, contentType } = await fetchPublicImage(url, headers)
  const buffer = Buffer.from(bytes)

  // 2. Process with Sharp
  // - autoRotate: fixes EXIF orientation
  // - resize: max 1600px on longest side, preserve aspect ratio
  // - webp: modern format, quality 82 (sweet spot for food photos)
  const processed = await sharp(buffer)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer()

  // 3. Hash the processed buffer for deduplication
  const hash = crypto.createHash('sha256').update(processed).digest('hex')

  // 4. Store in R2
  // Path: product-type-images/{typeKey}/{hash}.webp
  const key = `product-type-images/${typeKey}/${hash}.webp`
  await r2PutObject(key, processed, 'image/webp')

  return key
}
