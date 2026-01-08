/**
 * Generates a deterministic event identity (brokerage-agnostic).
 * Format: <normalized-address>|<start-time-window>|<normalized-url> (URL optional)
 * 
 * This replaces the previous brokerage-scoped canonical key with a global identity.
 * Events are now uniquely identified by location + time window + listing URL (when available).
 * This enables cross-brokerage event recognition while preventing different properties
 * from overwriting each other when they share similar time windows or addresses.
 * 
 * @param {object} event - The Schema.org Event object
 * @returns {string|null} The event identity or null if address/startDate is missing
 */
export function computeEventIdentity(event) {
  // Guard against missing location data
  if (!event.location || !event.location.address) return null
  
  const addr = event.location.address
  
  // Extract parts safely
  const parts = [
    addr.streetAddress,
    addr.addressLocality, // City
    addr.addressRegion,   // State
    addr.postalCode       // Zip
  ]

  // Normalize: lowercase, remove special chars, trim
  // Example: "123 Main St, City" -> "123mainst-city"
  // Note: This intentionally removes ALL special characters (including spaces, dots, hyphens)
  // to create a consistent canonical key. Addresses like "St. Paul" and "St Paul" will
  // generate the same key, which is desired behavior for deduplication.
  const normalizedAddress = parts
    .map(p => (p || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean) // remove empty parts
    .join('-')

  if (!normalizedAddress) return null

  // Compute time window from startDate
  const timeWindow = computeStartTimeWindow(event.startDate)
  if (!timeWindow) return null

  // Extract and normalize listing URL if available
  const listingUrl = extractListingUrl(event)
  const normalizedUrl = listingUrl ? normalizeUrl(listingUrl) : null

  // Format: <normalized-address>|<start-time-window>|<normalized-url>
  // If no URL, preserve backward compatibility with two-part format
  if (normalizedUrl) {
    return `${normalizedAddress}|${timeWindow}|${normalizedUrl}`
  }
  
  return `${normalizedAddress}|${timeWindow}`
}

/**
 * Computes a deterministic time window bucket from an event's startDate.
 * Uses ISO hour bucket (YYYY-MM-DDTHH) for events with time information.
 * Falls back to date-only bucket (YYYY-MM-DD) if time is missing or invalid.
 * 
 * @param {string} startDate - ISO 8601 date-time string
 * @returns {string|null} Time window bucket (e.g., "2025-01-15T14" or "2025-01-15") or null if invalid
 */
export function computeStartTimeWindow(startDate) {
  if (!startDate || typeof startDate !== 'string') return null
  
  try {
    const date = new Date(startDate)
    if (isNaN(date.getTime())) return null
    
    // Check if we have time information (check for 'T' in the ISO string)
    if (startDate.includes('T')) {
      // Use hour bucket: YYYY-MM-DDTHH
      const isoString = date.toISOString()
      // Extract up to hour: "2025-01-15T14:30:00.000Z" -> "2025-01-15T14"
      return isoString.substring(0, 13)
    } else {
      // Date only: YYYY-MM-DD
      const isoString = date.toISOString()
      return isoString.substring(0, 10)
    }
  } catch (error) {
    console.error('Error computing time window:', error)
    return null
  }
}

/**
 * Extract listing URL from the event.
 * Checks multiple possible locations for the URL.
 * 
 * @param {object} event - The Schema.org Event object
 * @returns {string|null} The listing URL or null if not present
 */
export function extractListingUrl(event) {
  // Prefer event.url (Schema.org Event.url)
  if (event.url && typeof event.url === 'string') {
    return event.url
  }
  
  // Fallback to event.offers.url
  if (event.offers?.url && typeof event.offers.url === 'string') {
    return event.offers.url
  }
  
  // Fallback to first source URL in flypost.sources
  if (event.flypost?.sources && Array.isArray(event.flypost.sources)) {
    for (const source of event.flypost.sources) {
      if (source.sourceUrl && typeof source.sourceUrl === 'string') {
        return source.sourceUrl
      }
    }
  }
  
  return null
}

/**
 * Normalize a URL for canonical identity comparison.
 * - Lowercase the entire URL
 * - Strip protocol (http://, https://)
 * - Strip leading 'www.'
 * - Remove trailing slash
 * - Drop querystring and fragment
 * 
 * Example: "HTTPS://WWW.Zillow.com/homedetails/123-Main-St/?utm=1#photos"
 *       -> "zillow.com/homedetails/123-main-st"
 * 
 * @param {string} url - The URL to normalize
 * @returns {string} The normalized URL suitable for identity comparison
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return ''
  }
  
  let normalized = url.trim().toLowerCase()
  
  // Strip protocol
  normalized = normalized.replace(/^https?:\/\//, '')
  
  // Strip leading www.
  normalized = normalized.replace(/^www\./, '')
  
  // Remove querystring and fragment
  normalized = normalized.split('?')[0].split('#')[0]
  
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '')
  
  return normalized
}

/**
 * LEGACY: Generates the old brokerage-scoped canonical key.
 * Kept for backward compatibility during migration.
 * DO NOT USE for new code - use computeEventIdentity instead.
 * 
 * @deprecated Use computeEventIdentity for brokerage-agnostic event identity
 * @param {object} event - The Schema.org Event object
 * @param {string} brokerageId - The organization/brokerage identifier
 * @returns {string|null} The legacy canonical key or null if address is missing
 */
export function computeCanonicalKey(event, brokerageId) {
  if (!event.location || !event.location.address) return null
  
  const addr = event.location.address
  const parts = [
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode
  ]

  const normalizedAddress = parts
    .map(p => (p || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('-')

  if (!normalizedAddress) return null
  return `${normalizedAddress}|${encodeURIComponent(brokerageId)}`
}
