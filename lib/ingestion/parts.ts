// Splitting a store's catalog into parts for the rotating daily refresh (see PRICE_SOURCES in
// lib/ingestion/ingest.ts). A whole catalog of ~10,000 products does not fit one cron run, so each run
// refreshes one part and the cursor (`ingestion_cursors`) moves on to the next. The split must be
// deterministic and depend only on a product's (or category's) own stable id — not on its position
// in a listing, which shifts from day to day — so every product lands in the same part every time
// and a full cycle of runs covers each product exactly once.

/** Part `index` (0-based) of `count` equal parts. */
export type CatalogPart = { index: number; count: number }

/** 32-bit FNV-1a: a small, stable string hash (the same on every machine and run). */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Whether the item with this stable key belongs to `part`. No part means the whole catalog. A
 *  numeric id is split by its remainder (already evenly spread); a string by its hash. */
export function inPart(key: string | number, part: CatalogPart | undefined): boolean {
  if (!part || part.count <= 1) return true
  const value = typeof key === 'number' ? Math.abs(Math.trunc(key)) : stableHash(key)
  return value % part.count === part.index
}

/** "3/7" — 1-based, for logs and results. */
export function partLabel(part: CatalogPart): string {
  return `${part.index + 1}/${part.count}`
}
