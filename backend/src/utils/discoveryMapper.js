/**
 * Discovery V1 Mapper - Protocol-grade mapper for strict M2M Oracle compliance
 * 
 * This module enforces the Flypost Discovery Protocol by mapping stored events
 * to the strict what/where/when structure defined in flypost-discovery-v1.schema.json.
 * 
 * STRICT STRIPPING: Removes description, organizer/agent info, price, beds, baths, photos.
 * These are "Human UI" concerns handled by the url field.
 */

/**
 * Valid Discovery API category enum values (snake_case singular)
 */
const VALID_CATEGORIES = [
  'open_house',
  'garage_sale',
  'estate_sale',
  'moving_sale',
  'yard_sale',
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
  
  // Other
  'other': 'other'
}

/**
 * Normalize a category value to Discovery API enum format (snake_case singular)
 * @param {string} input - Raw category input
 * @returns {string} - Normalized category value
 */
export function normalizeCategory(input) {
  if (!input || typeof input !== 'string') {
    return 'other'
  }
  
  // Lowercase and trim
  const normalized = input.toLowerCase().trim()
  
  // Check if it's already a valid category
  if (VALID_CATEGORIES.includes(normalized)) {
    return normalized
  }
  
  // Check against mappings
  if (CATEGORY_MAPPINGS[normalized]) {
    return CATEGORY_MAPPINGS[normalized]
  }
  
  // Try converting spaces/hyphens to underscores and removing trailing 's'
  const underscored = normalized.replace(/[\s-]+/g, '_')
  
  // Try exact match after underscoring
  if (VALID_CATEGORIES.includes(underscored)) {
    return underscored
  }
  
  // Try removing trailing 's' (plural to singular)
  const singular = underscored.replace(/s$/, '')
  if (VALID_CATEGORIES.includes(singular)) {
    return singular
  }
  
  // Default to 'other' for unknown categories
  console.log(`⚠️  Unknown category "${input}", defaulting to "other"`)
  return 'other'
}

/**
 * Normalizes a date string to RFC3339 UTC format
 * @param {string} dateStr - Date string (ISO 8601)
 * @returns {string} RFC3339 UTC timestamp
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

/**
 * Maps a stored event object to DiscoveryEventV1 format (Protocol-Grade Schema)
 * Enforces strict what/where/when structure without consumer UI concerns
 * 
 * @param {object} event - The full stored event object
 * @param {object} options - Mapping options
 * @param {string} options.accessTier - Access tier: 'public' or 'brokerage'
 * @returns {object} DiscoveryEventV1 object conforming to flypost-discovery-v1.schema.json
 */
export function toDiscoveryEventV1(event, options = {}) {
  if (!event) return null
  
  const { accessTier = 'brokerage' } = options
  const isPublicTier = accessTier === 'public'
  
  // Required: eventId (stable Flypost ID)
  const eventId = event.flypost?.eventId || event.id
  if (!eventId) return null
  
  // Required: dataHash (sourced from event.hash.value, must be lowercase hex)
  let dataHash = event.hash?.value || event.flypost?.hash?.value
  if (!dataHash) return null
  // Ensure lowercase hex format
  dataHash = dataHash.toLowerCase()
  
  // Required: what (event type)
  const rawCategory = event.flypost?.category || 'open_house'
  const category = normalizeCategory(rawCategory)
  
  const what = {
    type: category
  }
  
  // Optional: what.label (minimal title, max 80 chars)
  if (event.name && typeof event.name === 'string') {
    const label = event.name.trim()
    if (label.length > 0) {
      what.label = label.length > 80 ? label.substring(0, 80) : label
    }
  }
  
  // Required: where (latitude, longitude, optional address)
  const geo = event.location?.geo
  if (!geo || geo.latitude === undefined || geo.longitude === undefined) {
    return null // Cannot create discovery event without coordinates
  }
  
  const where = {}
  
  // Apply precision based on access tier
  if (isPublicTier) {
    // Public tier: reduce precision to ~1km accuracy (2 decimal places)
    where.latitude = parseFloat(geo.latitude.toFixed(2))
    where.longitude = parseFloat(geo.longitude.toFixed(2))
  } else {
    // Brokerage tier: full precision
    where.latitude = geo.latitude
    where.longitude = geo.longitude
  }
  
  // Optional: where.address (human-readable, max 200 chars)
  if (event.location?.address) {
    const addr = event.location.address
    let addressStr = ''
    
    if (isPublicTier) {
      // Public tier: city, region, country only
      const parts = []
      if (addr.addressLocality) parts.push(addr.addressLocality)
      if (addr.addressRegion) parts.push(addr.addressRegion)
      if (addr.addressCountry) parts.push(addr.addressCountry)
      addressStr = parts.join(', ')
    } else {
      // Brokerage tier: full address
      const parts = []
      if (addr.streetAddress) parts.push(addr.streetAddress)
      if (addr.addressLocality) parts.push(addr.addressLocality)
      if (addr.addressRegion) parts.push(addr.addressRegion)
      if (addr.postalCode) parts.push(addr.postalCode)
      if (addr.addressCountry) parts.push(addr.addressCountry)
      addressStr = parts.join(', ')
    }
    
    // Apply max length constraint
    if (addressStr.length > 0) {
      where.address = addressStr.length > 200 ? addressStr.substring(0, 200) : addressStr
    }
  }
  
  // Required: when (start and end in UTC)
  const startUTC = normalizeToUTC(event.startDate)
  const endUTC = normalizeToUTC(event.endDate || event.startDate)
  
  if (!startUTC || !endUTC) {
    return null // Cannot create discovery event without valid dates
  }
  
  const when = {
    start: startUTC,
    end: endUTC
  }
  
  // Required: url (nullable) - hand-off link
  // Look for url in various places in the event object
  let url = null
  if (event.url && typeof event.url === 'string') {
    url = event.url
  } else if (event.flypost?.url && typeof event.flypost.url === 'string') {
    url = event.flypost.url
  } else if (event.flypost?.sourceUrl && typeof event.flypost.sourceUrl === 'string') {
    url = event.flypost.sourceUrl
  }
  
  // Optional: source (when present, both kind and url are required per schema)
  let sourceKind = null
  let sourceUrl = null
  
  // Try to get source kind
  if (event.flypost?.sourceType || event.flypost?.source?.kind) {
    const sourceType = event.flypost.source?.kind || event.flypost.sourceType
    const validSourceTypes = ['mls', 'brokerage_roster', 'manual', 'third_party']
    
    if (validSourceTypes.includes(sourceType)) {
      sourceKind = sourceType
    }
  }
  
  // Try to get source URL
  if (event.flypost?.source?.url || event.flypost?.sourceUrl) {
    const url = event.flypost.source?.url || event.flypost.sourceUrl
    sourceUrl = (url && typeof url === 'string') ? url : null
  }
  
  // Build the discovery event (strict schema compliance)
  const discoveryEvent = {
    eventId,
    dataHash,
    what,
    where,
    when,
    url
  }
  
  // Add source only if we have both kind and url (schema requires both when source is present)
  if (sourceKind !== null && sourceUrl !== undefined) {
    discoveryEvent.source = {
      kind: sourceKind,
      url: sourceUrl
    }
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
  
  return events
    .map(event => toDiscoveryEventV1(event, options))
    .filter(event => event !== null)
}
