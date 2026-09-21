export type GpsCoords = { lat: number; lng: number }

export function distanceKm(a: GpsCoords, b: GpsCoords) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Closest of several locations (e.g. every branch of a store chain) to the user, with its
 *  distance. Used to surface distance as one factor without picking a store automatically —
 *  per docs/05_BUSINESS_RULES.md, "distance is one factor, not an automatic command to use the
 *  nearest store." */
export function nearestLocation<T extends { gps: GpsCoords }>(userCoords: GpsCoords, locations: T[]): { location: T; distanceKm: number } | null {
  if (locations.length === 0) return null
  return locations.map((location) => ({ location, distanceKm: distanceKm(userCoords, location.gps) })).sort((a, b) => a.distanceKm - b.distanceKm)[0]
}
