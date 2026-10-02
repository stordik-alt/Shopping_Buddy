// Provider-neutral receipt file storage. Receipts are the only files the app stores. The rest of the app talks to `lib/storage` only.
// R2 is the only receipt storage provider; household authorization happens before storage access.

export type StorageProvider = 'r2'

/** A stored file as read back from the provider. */
export type StoredFile = {
  body: ReadableStream<Uint8Array>
  contentType: string
}

/** The provider's object key. Household authorization is the caller's responsibility. */
export interface ReceiptFileStore {
  readonly provider: StorageProvider
  /** Stores the bytes under `key` and returns the identifier to read them back with. */
  put(key: string, body: Buffer, contentType: string): Promise<string>
  /** `null` when the file does not exist. Any other failure throws. */
  get(id: string): Promise<StoredFile | null>
  delete(id: string): Promise<void>
}
