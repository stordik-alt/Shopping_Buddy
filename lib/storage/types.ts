// Provider-neutral receipt file storage (docs/cloudflare-migration-architecture.md).
// Receipts are the only files the app stores. The rest of the app talks to `lib/storage` only, never
// to `@vercel/blob` or R2 directly, so the provider can change without touching the pipeline.

export type StorageProvider = 'vercel_blob' | 'r2'

/** A stored file as read back from a provider. */
export type StoredFile = {
  body: ReadableStream<Uint8Array>
  contentType: string
}

/** One provider. `key` is the provider's own identifier: the object key for R2, the blob URL for
 *  Vercel Blob (its `get`/`del` take the URL). Household authorization is the caller's job and
 *  happens before any of these calls (lib/receipt-access.ts, assertOwnsReceiptImport). */
export interface ReceiptFileStore {
  readonly provider: StorageProvider
  /** Stores the bytes under `key` and returns the identifier to read them back with. */
  put(key: string, body: Buffer, contentType: string): Promise<string>
  /** `null` when the file does not exist. Any other failure throws. */
  get(id: string): Promise<StoredFile | null>
  delete(id: string): Promise<void>
}
