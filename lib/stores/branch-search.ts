import type { GpsCoords } from '@/lib/geo'

// Pure helpers of the store directory's server-side branch search (lib/db/store-branch-search.ts).
// They live apart from the database code so the paging and radius maths stay deterministic and testable.

/** Branches per page: what fits on a phone screen without scrolling far, and few enough to keep the
 *  data pulled from Neon per page small (the directory holds ~1,800 branches). */
export const BRANCH_PAGE_SIZE = 5

/** Search radius around the user's real position. */
export const NEARBY_RADIUS_KM = 5

/** Where to look for branches: everywhere, in a typed town, or around the user's position. */
export type Locality = { kind: 'all' } | { kind: 'city'; text: string } | { kind: 'gps'; center: GpsCoords; radiusKm: number }

/** Longest town text accepted; a crafted request cannot make the database match a huge pattern. */
export const MAX_LOCALITY_TEXT = 80

// One degree of latitude is ~111.2 km everywhere; one degree of longitude shrinks with cos(latitude).
const KM_PER_DEGREE = 111.2

/** Latitude/longitude rectangle that contains every point within `radiusKm` of `center`. Used as a
 *  cheap index-friendly pre-filter before the exact (haversine) distance is applied. */
export function boundingBox(center: GpsCoords, radiusKm: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / KM_PER_DEGREE
  // Near the poles the rectangle would blow up; the Czech Republic never gets there, but the guard
  // keeps the function correct for any input.
  const lngDelta = radiusKm / (KM_PER_DEGREE * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01))
  return { minLat: center.lat - latDelta, maxLat: center.lat + latDelta, minLng: center.lng - lngDelta, maxLng: center.lng + lngDelta }
}

/** Number of pages for `total` branches; at least 1, so an empty result still reads "1/1". */
export function pageCount(total: number, pageSize: number = BRANCH_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** A requested page forced into 1..pageCount (a stale page number after the result shrank). */
export function clampPage(page: number, total: number, pageSize: number = BRANCH_PAGE_SIZE): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), pageCount(total, pageSize))
}

/** Escapes `%`, `_` and `\` so user text is matched literally inside an SQL `LIKE` pattern. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`)
}
