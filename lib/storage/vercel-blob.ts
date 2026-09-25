import { del, get, put } from '@vercel/blob'
import type { ReceiptFileStore } from '@/lib/storage/types'

// The original storage. Kept for reading receipts uploaded before the move to R2 and as the
// rollback target (STORAGE_PROVIDER=vercel). Files are private: their URL is not fetchable by a
// browser, only with the store's token on the server.
export const vercelBlobStore: ReceiptFileStore = {
  provider: 'vercel_blob',

  async put(key, body, contentType) {
    const blob = await put(key, body, { access: 'private', contentType })
    return blob.url
  },

  async get(url) {
    const result = await get(url, { access: 'private' })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    return { body: result.stream, contentType: result.blob.contentType }
  },

  async delete(url) {
    await del(url)
  },
}
