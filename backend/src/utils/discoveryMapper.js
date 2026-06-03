/**
 * Discovery V1 Mapper - Protocol-grade mapper for strict M2M Oracle compliance
 *
 * This module enforces the Flypost Discovery Protocol by mapping stored events
 * to the strict what/where/when structure defined in flypost-discovery-v1.schema.json.
 *
 * Layer 2 (Intelligence) data like attendance, feedback, sentiment is explicitly excluded.
 *
 * Hardened for M2M Infrastructure ("The Oracle for Reality"):
 * - Strips consumer/UI fields (machines use externalListingUrl for deeper context)
 * - Adds externalListingUrl field for hand-off to external listings (nullable but required key)
 * - Adds dataHash field for data integrity verification (lowercase hex)
 * - Maintains tiered precision for geo/address (public vs brokerage)
 */

import { generateShareUrl } from './shareUrl.js'

/**
 * Valid Discovery API category enum values (snake_case singular)
 */
export const VALID_DISCOVERY_CATEGORIES = [
  'open_house',
  'garage_sale',
  'estate_sale',
  'moving_sale',
  'yard_sale',
  'apartment',
  'job_posting',
  'live_event',
  'community_alert',
  'happy_hour',
  'missing_pet',
  'other'
]

/**
 * Category normalization mappings
 * Maps various input formats to canonical snake_case singular values
 */
const CATEGORY_MAPPINGS = {
  // Open house variants
  'open-houses': 'open_house',
  'open-house': 'open_house',
  'open house': 'open_house',
  'open houses': 'open_house',
  'openhouse': 'open_house',
  'openhouses': 'open_house',
  'open_house': 'open_house',

  // Garage sale variants
  'garage-sales': 'garage_sale',
  'garage-sale': 'garage_sale',
  'garage sale': 'garage_sale',
  'garage sales': 'garage_sale',
  'garagesale': 'garage_sale',
  'garagesales': 'garage_sale',
  'garage_sale': 'garage_sale',

  // Yard sale variants
  'yard-sales': 'yard_sale',
  'yard-sale': 'yard_sale',
  'yard sale': 'yard_sale',
  'yard sales': 'yard_sale',
  'yardsale': 'yard_sale',
  'yardsales': 'yard_sale',
  'yard_sale': 'yard_sale',

  // Estate sale variants
  'estate-sales': 'estate_sale',
  'estate-sale': 'estate_sale',
  'estate sale': 'estate_sale',
  'estate sales': 'estate_sale',
  'estatesale': 'estate_sale',
  'estatesales': 'estate_sale',
  'estate_sale': 'estate_sale',

  // Moving sale variants
  'moving-sales': 'moving_sale',
  'moving-sale': 'moving_sale',
  'moving sale': 'moving_sale',
  'moving sales': 'moving_sale',
  'movingsale': 'moving_sale',
  'movingsales': 'moving_sale',
  'moving_sale': 'moving_sale',

  // Apartment variants
  apartments: 'apartment',
  apartment: 'apartment',
  'apartment-rentals': 'apartment',
  'apartment-rental': 'apartment',
  'apartment rentals': 'apartment',
  'apartment rental': 'apartment',

  // Job posting variants
  'job-postings': 'job_posting',
  'job-posting': 'job_posting',
  'job postings': 'job_posting',
  'job posting': 'job_posting',
  jobs: 'job_posting',
  job: 'job_posting',
  'job_postings': 'job_posting',
  'job_posting': 'job_posting',

  // Live event variants
  'live-events': 'live_event',
  'live-event': 'live_event',
  'live events': 'live_event',
  'live event': 'live_event',
  events: 'live_event',
  event: 'live_event',
  'live_events': 'live_event',
  'live_event': 'live_event',

  // Community alert variants
  'community-alerts': 'community_alert',
  'community-alert': 'community_alert',
  'community alerts': 'community_alert',
  'community alert': 'community_alert',
  alerts: 'community_alert',
  alert: 'community_alert',
  'community_alerts': 'community_alert',
  'community_alert': 'community_alert',

  // Happy hour variants
  'happy-hours': 'happy_hour',
  'happy-hour': 'happy_hour',
  'happy hours': 'happy_hour',
  'happy hour': 'happy_hour',
  'happy_hours': 'happy_hour',
  'happy_hour': 'happy_hour',

  // Missing pet variants
  'missing-pets': 'missing_pet',
  'missing-pet': 'missing_pet',
  'missing pets': 'missing_pet',
  'missing pet': 'missing_pet',
  'lost pets': 'missing_pet',
  'lost pet': 'missing_pet',
  'missing_pets': 'missing_pet',
  'missing_pet': 'missing_pet',

  // Other
  other: 'other'
}

function normalizeCategoryInternal(input) {
  if (!input || typeof input !== 'string') {
    return null
  }

  const normalized = input.toLowerCase().trim()
  if (!normalized) return null

  if (VALID_DISCOVERY_CATEGORIES.includes(normalized)) return normalized
  if (CATEGORY_MAPPINGS[normalized]) return CATEGORY_MAPPINGS[normalized]

  const underscored = normalized.replace(/[\s-]+/g, '_')
  if (VALID_DISCOVERY_CATEGORIES.includes(underscored)) return underscored

  const singular = underscored.replace(/s$/, '')
  if (VALID_DISCOVERY_CATEGORIES.includes(singular)) return singular

  return null
}

/**
 * Normalize a category value to Discovery API enum format (snake_case singular)
 * @param {string} input - Raw category input
 * @returns {string} - Normalized category value
 */
export function normalizeCategory(input) {
  const category = normalizeCategoryInternal(input)
  if (category) return category

  console.log(`⚠️  Unknown category "${input}", defaulting to "other"`)
  return 'other'
}

/**
 * Normalize a category used as an API filter.
 * Unlike normalizeCategory(), this returns null for unknown values so routes can
 * reject invalid caller input instead of silently broadening it to "other".
 * @param {string} input - Raw category input
 * @returns {string|null} Normalized category or null when unsupported
 */
export function normalizeCategoryForFilter(input) {
  return normalizeCategoryInternal(input)
}

/**
 * Normalizes a date string to RFC3339 UTC format
 * @param {string} dateStr - Date string (ISO 8601)
 * @returns {string|null} RFC3339 UTC timestamp
 */
function normalizeToUTC(dateStr) {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    return date.toISOString()
  } catch {
    return null
  }
}

function isSafeHttpsUrl(value) {
  if (!value || typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Maps a stored event object to DiscoveryEventV1 format (Protocol-Grade Schema)
 * Enforces strict what/where/when structure without consumer UI concerns
 *
 * @param {object} event - The full stored event object
 * @param {object} options - Mapping options
 * @param {string} options.accessTier - Access tier: 'public' or 'brokerage'
 * @returns {object|null} DiscoveryEventV1 object conforming to flypost-discovery-v1.schema.json
 */
export function toDiscoveryEventV1(event, options = {}) {
  if (!event) return null

  const { accessTier = 'brokerage' } = options
  const isPublicTier = accessTier === 'public'

  // Required: eventId
  const eventId = event.flypost?.eventId || event.id
  if (!eventId) return null

  // Required: dataHash (lowercase hex)
  let dataHash = event.hash?.value || event.flypost?.hash?.value
  if (!dataHash) return null
  dataHash = dataHash.toLowerCase()

  // Required: what
  const rawCategory = event.flypost?.category || 'open_house'
  const category = normalizeCategory(rawCategory)

  const what = { type: category }

  // Optional: what.label (max 80 chars)
  if (event.name && typeof event.name === 'string') {
    const label = event.name.trim()
    if (label.length > 0) {
      what.label = label.length > 80 ? label.substring(0, 80) : label
    }
  }

  // Required: where (must have coordinates)
  const geo = event.location?.geo
  if (!geo || geo.latitude === undefined || geo.longitude === undefined) {
    return null
  }

  const where = {}

  if (isPublicTier) {
    where.latitude = parseFloat(geo.latitude.toFixed(2))
    where.longitude = parseFloat(geo.longitude.toFixed(2))
  } else {
    where.latitude = geo.latitude
    where.longitude = geo.longitude
  }

  // Optional: where.address (flattened, max 200 chars)
  // Include full street-level address for all tiers (no redaction)
  if (event.location?.address) {
    const addr = event.location.address
    const parts = []

    // Always include full address (street + locality + region + postal + country)
    if (addr.streetAddress) parts.push(addr.streetAddress)
    if (addr.addressLocality) parts.push(addr.addressLocality)
    if (addr.addressRegion) parts.push(addr.addressRegion)
    if (addr.postalCode) parts.push(addr.postalCode)
    if (addr.addressCountry) parts.push(addr.addressCountry)

    const addressStr = parts.join(', ')
    if (addressStr.length > 0) {
      where.address =
        addressStr.length > 200 ? addressStr.substring(0, 200) : addressStr
    }
  }

  // Required: when (UTC)
  const startUTC = normalizeToUTC(event.startDate)
  const endUTC = normalizeToUTC(event.endDate || event.startDate)
  if (!startUTC || !endUTC) return null

  const when = { start: startUTC, end: endUTC }
  
  // Optional: timezone (IANA timezone string)
  // Source from event.flypost.timezone if available
  if (event.flypost?.timezone && typeof event.flypost.timezone === 'string') {
    when.timezone = event.flypost.timezone
  }

  // Required: externalListingUrl key must exist (nullable)
  let externalListingUrl = null
  if (event.url && typeof event.url === 'string') {
    externalListingUrl = event.url
  } else if (event.flypost?.url && typeof event.flypost.url === 'string') {
    externalListingUrl = event.flypost.url
  } else if (
    event.flypost?.sourceUrl &&
    typeof event.flypost.sourceUrl === 'string'
  ) {
    externalListingUrl = event.flypost.sourceUrl
  }

  // Optional: source (if present, must include kind + url per schema)
  let sourceKind = null
  let sourceUrl = null

  if (event.flypost?.sourceType || event.flypost?.source?.kind) {
    const sourceType = event.flypost.source?.kind || event.flypost.sourceType
    const validSourceTypes = ['mls', 'brokerage_roster', 'manual', 'third_party']
    if (validSourceTypes.includes(sourceType)) {
      sourceKind = sourceType
    }
  }

  if (event.flypost?.source?.url || event.flypost?.sourceUrl) {
    const u = event.flypost.source?.url || event.flypost.sourceUrl
    sourceUrl = u && typeof u === 'string' ? u : null
  }

  // Generate share URL (public, non-sensitive field)
  const shareUrl = generateShareUrl(event)

  const discoveryEvent = { eventId, dataHash, what, where, when, externalListingUrl, shareUrl }

  // Optional: distance_mi — emitted from the internal _distanceKm set by the
  // near-query filter. Computed from full-precision source geo before `where`
  // coordinates are rounded, so the public 2-decimal rounding never affects it.
  if (Number.isFinite(event._distanceKm)) {
    discoveryEvent.distance_mi = parseFloat((event._distanceKm / 1.60934).toFixed(2))
  }

  if (isSafeHttpsUrl(event.flypost?.heroImageUrl)) {
    discoveryEvent.imageUrl = event.flypost.heroImageUrl
  }

  // Add source only if kind is known (url may be null; schema allows null)
  if (sourceKind !== null) {
    discoveryEvent.source = { kind: sourceKind, url: sourceUrl }
  }

  // Optional: occurrences (multi-slot events)
  const rawOccurrences = event.occurrences
  if (Array.isArray(rawOccurrences) && rawOccurrences.length > 0) {
    discoveryEvent.occurrences = rawOccurrences.map(occ => {
      const mapped = {
        occurrenceId: occ.occurrenceId,
        startDate: occ.startDate,
        endDate: occ.endDate,
      }
      if (occ.label) mapped.label = occ.label
      if (occ.local) {
        mapped.local = {
          date: occ.local.date,
          startTime: occ.local.startTime,
          endTime: occ.local.endTime,
        }
      }
      return mapped
    })
  }

  return discoveryEvent
}

/**
 * Maps an array of stored events to DiscoveryEventV1 format
 * @param {array} events - Array of stored event objects
 * @param {object} options - Mapping options (passed to toDiscoveryEventV1)
 * @returns {array} Array of DiscoveryEventV1 objects
 */
export function toDiscoveryEventsV1(events, options = {}) {
  if (!Array.isArray(events)) return []
  return events.map(e => toDiscoveryEventV1(e, options)).filter(Boolean)
}
