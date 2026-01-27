/**
 * Share URL Utilities for Flypost v4
 * Generates Zillow-style shareable event URLs with SEO-friendly slugs
 */

/**
 * Generate a share URL for an event (Zillow-style format)
 * Format: https://goflypost.com/e/{slug}/{eventId}_fpid
 * 
 * The slug is SEO-friendly (derived from name + address, limited to 100 chars)
 * The fpid (Flypost ID) is the actual machine ID used for lookup
 * 
 * Tolerant of both stored events and Discovery-mapped events
 * 
 * @param {object} event - Event object (stored or discovery format)
 * @returns {string|null} - Share URL or null if eventId is missing
 */
export function generateShareUrl(event) {
  if (!event) return null
  
  // Extract eventId from various possible locations
  // Handles both stored events (event.flypost.eventId) and discovery events (event.eventId)
  const eventId = event.flypost?.eventId || event.eventId || event.id
  
  if (!eventId) return null
  
  // Generate SEO-friendly slug from name + address
  const slug = generateSeoSlug(event)
  
  // Format: https://goflypost.com/e/{slug}/{eventId}_fpid
  return `https://goflypost.com/e/${slug}/${eventId}_fpid`
}

/**
 * Generate SEO-friendly slug from event name and address
 * Limited to 100 characters for URL friendliness
 * 
 * @param {object} event - Event object
 * @returns {string} - SEO slug (defaults to 'event' if no data)
 */
function generateSeoSlug(event) {
  const parts = []
  
  // Extract name (from various possible locations)
  const name = event.name || event.what?.label
  if (name) {
    parts.push(name)
  }
  
  // Extract address components
  // Handle both stored events (event.location.address) and discovery events (event.where.address)
  const address = event.location?.address || event.where?.address
  
  if (address) {
    // If address is a string (discovery format), use it directly
    if (typeof address === 'string') {
      // Extract street and city from formatted address
      const addressParts = address.split(',').slice(0, 2) // Take first 2 parts (street + city)
      parts.push(...addressParts)
    } else {
      // If address is an object (stored format), extract components
      if (address.streetAddress) parts.push(address.streetAddress)
      if (address.addressLocality) parts.push(address.addressLocality)
    }
  }
  
  // Join parts and slugify
  const combined = parts.join(' ')
  
  if (!combined) return 'event'
  
  // Slugify: lowercase, replace spaces/special chars with hyphens, remove consecutive hyphens
  let slug = combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
    .replace(/-+/g, '-')          // Collapse consecutive hyphens
  
  // Limit to 100 characters
  if (slug.length > 100) {
    slug = slug.substring(0, 100).replace(/-+$/, '') // Remove trailing hyphen if cut mid-word
  }
  
  return slug || 'event'
}

/**
 * Extract event ID from fpid parameter (strict validation)
 * Pattern: evt_{random}_{timestamp}_fpid
 * Example: evt_k7x9m2p4q_1641234567890_fpid
 * 
 * This MUST be validated before hitting storage (security + performance)
 * 
 * @param {string} fpid - The fpid parameter from URL
 * @returns {string|null} - Event ID or null if invalid format
 */
export function extractEventIdFromFpid(fpid) {
  if (!fpid || typeof fpid !== 'string') return null
  
  // Strict regex: evt_{random}_{timestamp}_fpid
  // random: lowercase alphanumeric
  // timestamp: exactly 13 digits
  const pattern = /^(evt_[a-z0-9]+_[0-9]{13})_fpid$/
  
  const match = fpid.match(pattern)
  
  if (!match) return null
  
  // Return the event ID (without _fpid suffix)
  return match[1]
}

/**
 * Validate external URL to prevent XSS attacks
 * Only allows http: and https: schemes
 * Blocks javascript:, data:, etc.
 * 
 * @param {string} url - URL to validate
 * @returns {string|null} - Safe URL or null if invalid/unsafe
 */
export function validateExternalUrl(url) {
  if (!url || typeof url !== 'string') return null
  
  const trimmed = url.trim()
  if (!trimmed) return null
  
  // Only allow http: and https: schemes
  // Use URL constructor for safe parsing
  try {
    const parsed = new URL(trimmed)
    
    // Only allow http and https protocols
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed
    }
    
    // Block all other protocols (javascript:, data:, file:, etc.)
    return null
  } catch {
    // Invalid URL format
    return null
  }
}
