/**
 * Shared geo utilities for distance calculation and event coordinate resolution.
 *
 * The Haversine formula here is copied verbatim from the verification gate in
 * routes/presence.js (distanceKm) so discovery and presence agree numerically.
 * Presence keeps its own private copy intentionally (out of scope to refactor);
 * if/when that is consolidated, this is the canonical home.
 */

const EARTH_RADIUS_KM = 6371
const KM_PER_MILE = 1.60934

function toRadians(degrees) {
  return degrees * (Math.PI / 180)
}

/**
 * Great-circle distance between two coordinates, in kilometers.
 */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

/**
 * Great-circle distance between two coordinates, in miles.
 */
export function distanceMi(lat1, lng1, lat2, lng2) {
  return distanceKm(lat1, lng1, lat2, lng2) / KM_PER_MILE
}

/**
 * Resolve an event's coordinates from the possible field shapes.
 *
 * Precedence (stored shape first, output shape last):
 *   1. location.geo.{latitude,longitude}  — canonical stored events
 *   2. flypost.geo.{latitude,longitude}   — legacy stored events
 *   3. where.{latitude,longitude}          — already-mapped Discovery V1 output
 *
 * Uses Number.isFinite so a valid 0 coordinate is not dropped.
 *
 * @param {object} event
 * @returns {{lat: number, lng: number} | null}
 */
export function getEventGeo(event) {
  if (!event) return null

  const candidates = [
    event.location?.geo,
    event.flypost?.geo,
    event.where,
  ]

  for (const c of candidates) {
    if (!c) continue
    // Reject null/undefined/'' explicitly: Number(null) and Number('') are 0,
    // which would otherwise resolve a coordinate-less event to (0, 0).
    if (c.latitude == null || c.latitude === '' || c.longitude == null || c.longitude === '') {
      continue
    }
    const lat = Number(c.latitude)
    const lng = Number(c.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng }
    }
  }

  return null
}
