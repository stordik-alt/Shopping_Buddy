import type { productSourceEnum } from '@/lib/db/schema'
import type { ItemCategory, ItemUnit } from '@/lib/types'

// Shared shape of the External Source -> Fetcher -> Normalizer -> Validator -> Database pipeline
// (docs/02_ARCHITECTURE.md, CLAUDE.md section 32). Each store connector supplies its own fetching
// and normalizing; `lib/ingestion/ingest.ts` owns the one shared persistence step, so a new store
// never needs its own copy of the "resolve product -> record price -> upsert deal" logic.

/** Which external source a product identity/price came from — derived from the `product_source`
 *  Postgres enum, so a new connector cannot be added without the migration that adds its value. */
export type IngestionSource = (typeof productSourceEnum.enumValues)[number]

/** A validated, normalized product — the connector-independent output of every normalizer. */
export type NormalizedProduct = {
  /** The source's own stable product id (never the name) — the idempotency key per CLAUDE.md
   *  section 34. */
  externalId: string
  name: string
  category: ItemCategory
  /** Unit the `unitPrice` is expressed in (a normalized unit: kg, l or ks where the source allows). */
  unit: ItemUnit
  /** Unit price of the regular price; `null` together with `regularPrice`. */
  unitPrice: number | null
  /** The regular (non-promotional) price. For a product sold by weight it is the price per `unit`.
   *  `null` when the source publishes only a promotional price and no regular/reference price — then
   *  no price observation is recorded, since an offer price must not masquerade as the everyday
   *  price (CLAUDE.md sections 16 and 18). */
  regularPrice: number | null
  currency: string
  recordedAt: string
  /** A promotion with a known validity window. Connectors whose source publishes no end date must
   *  leave this undefined and set `promotionWithoutValidity` instead — a validity window is never
   *  invented (CLAUDE.md section 15). */
  deal?: { dealPrice: number; validFrom: string; validUntil: string }
  /** The source shows a promotion for this product but gives no usable validity window, so it could
   *  not be stored as a deal. Only counted in the ingestion result. */
  promotionWithoutValidity?: boolean
}

export type FetchOptions = { deadline?: number }

/** One store's connector: how to fetch a small, deterministic batch of raw products and how to turn
 *  each into a `NormalizedProduct`. `Raw` is the source's own response shape. */
export type PriceConnector<Raw = unknown> = {
  source: IngestionSource
  /** Must match `stores.chain` — the seeded store chain the prices are attributed to. */
  chain: string
  /** Fetches up to `limit` raw products. Throws when the source is unreachable (the caller isolates
   *  that failure so other connectors still run). `options.deadline` (epoch ms) is the run's time
   *  budget: once it has passed, no further request is started and the products fetched so far are
   *  returned. */
  fetchProducts(limit: number, options?: FetchOptions): Promise<Raw[]>
  /** Source id of a raw record, used to label per-product errors. */
  rawId(raw: Raw): string
  /** Validates + normalizes one record; `null` when it is unusable or not a grocery item. */
  normalize(raw: Raw, today: string): NormalizedProduct | null
}

export type IngestResult = {
  processed: number
  recorded: number
  newProducts: number
  deals: number
  /** Promotions seen but not stored because the source gives no validity window. */
  promotionsWithoutValidity: number
  skipped: number
  /** True when the run's time budget ran out and some fetched products were not processed. */
  truncated: boolean
  errors: string[]
}
