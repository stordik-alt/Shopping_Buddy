import { r2Store } from '@/lib/storage/r2'
import type { ReceiptFileStore, StorageProvider, StoredFile } from '@/lib/storage/types'

export type { StorageProvider, StoredFile } from '@/lib/storage/types'

// Receipt file storage entry point. `receipt_imports.image_url` stores an R2 reference:
//   r2:receipts/{householdId}/{uuid}.{ext}
// All receipt files have been migrated from Vercel Blob to R2.

const R2_PREFIX = 'r2:'

// The only keys the app writes: receipts/{householdId uuid}/{random uuid}.{detected extension}.
// Anything else in an R2 reference is refused rather than passed to the bucket, so a corrupted or
// hand-edited row can never address another household's folder or an arbitrary object.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const RECEIPT_KEY_PATTERN = new RegExp(`^receipts/(${UUID})/${UUID}\\.(jpg|png|webp|pdf)$`, 'i')

export function isValidReceiptKey(key: string): boolean {
  return RECEIPT_KEY_PATTERN.test(key)
}

/** The storage key for a new receipt file. */
export function receiptKey(householdId: string, extension: 'jpg' | 'png' | 'webp' | 'pdf'): string {
  const key = `receipts/${householdId}/${crypto.randomUUID()}.${extension}`
  if (!isValidReceiptKey(key)) throw new Error('Invalid household id for a receipt key')
  return key
}

/** Which provider a stored reference points at, and its provider-level id. */
export function parseStorageRef(ref: string): { provider: StorageProvider; id: string } {
  if (ref.startsWith(R2_PREFIX)) {
    const key = ref.slice(R2_PREFIX.length)
    if (!isValidReceiptKey(key)) throw new Error('Invalid R2 receipt reference')
    return { provider: 'r2', id: key }
  }
  throw new Error('Unknown receipt storage reference')
}

export function r2Ref(key: string): string {
  if (!isValidReceiptKey(key)) throw new Error('Invalid R2 receipt key')
  return `${R2_PREFIX}${key}`
}

const STORES: Record<StorageProvider, ReceiptFileStore> = { r2: r2Store }

/** Stores a new receipt file and returns the reference to save in `receipt_imports.image_url`. */
export async function putReceiptFile(householdId: string, body: Buffer, file: { extension: 'jpg' | 'png' | 'webp' | 'pdf'; mimeType: string }): Promise<string> {
  const provider: StorageProvider = 'r2'
  const key = receiptKey(householdId, file.extension)
  const id = await STORES[provider].put(key, body, file.mimeType)
  return r2Ref(id)
}

/** Reads a stored receipt file; `null` when it no longer exists. */
export async function getReceiptFile(ref: string): Promise<StoredFile | null> {
  const { provider, id } = parseStorageRef(ref)
  return STORES[provider].get(id)
}

export async function deleteReceiptFile(ref: string): Promise<void> {
  const { provider, id } = parseStorageRef(ref)
  await STORES[provider].delete(id)
}
