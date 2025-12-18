/**
 * Discovery V1 Mapper - Allowlist mapper for registry-safe discovery responses
 * 
 * This module enforces the Flypost Two-Layer North Star by ensuring only 
 * Layer 1 (Registry) data appears in discovery API responses.
 * 
 * Layer 2 (Intelligence) data like attendance, feedback, sentiment is explicitly excluded.
 */

import { computeCanonicalKey } from './canonicalKey.js'

/**
 * Computes eventIdentity from event data
 * Uses canonicalKey if available, otherwise generates from address + brokerageId
 * 
 * @param {object} event - The full event object
 * @returns {string|null} The event identity or null if cannot be computed
 */
export function computeEventIdentity(event) {
  // Prefer existing eventIdentity
  if (event.flypost?.eventIdentity) {
    return event.flypost.eventIdentity
  }
  
  // Fallback to canonicalKey if available
  if (event.flypost?.canonicalKey) {
    return event.flypost.canonicalKey
  }
  
  // Try to compute from event data
  const brokerageId = event.brokerageId || event.flypost?.brokerageId || 'unknown'
  const identity = computeCanonicalKey(event, brokerageId)
  
  return identity
}

/**
 * Maximum length for event descriptions in discovery responses
 * Prevents abuse and ensures consistent response sizes
 */
const MAX_DESCRIPTION_LENGTH = 500

/**
 * Truncates description to safe length
 * @param {string} description - The description text
 * @param {number} maxLength - Maximum length (default: MAX_DESCRIPTION_LENGTH)
 * @returns {string} Truncated description
 */
function truncateDescription(description, maxLength = MAX_DESCRIPTION_LENGTH) {
  if (!description) return undefined
  if (typeof description !== 'string') return undefined
  
  const trimmed = description.trim()
  if (trimmed.length <= maxLength) return trimmed
  
  // Truncate and add ellipsis
  return trimmed.substring(0, maxLength) + '...'
}

/**
 * Maps a stored event object to DiscoveryEventV1 format
 * Only includes registry-safe fields (Layer 1 data)
 * 
 * @param {object} event - The full stored event object
 * @param {object} options - Mapping options
 * @param {string} options.accessTier - Access tier: 'public' or 'brokerage'
 * @returns {object} DiscoveryEventV1 object with only allowlisted fields
 */
export function toDiscoveryEventV1(event, options = {}) {
  if (!event) return null
  
  const { accessTier = 'brokerage' } = options
  const isPublicTier = accessTier === 'public'
  
  const discoveryEvent = {}
  
  // Required registry identifiers
  discoveryEvent.eventId = event.flypost?.eventId || event.id
  discoveryEvent.eventIdentity = computeEventIdentity(event)
  
  // Category
  discoveryEvent.category = event.flypost?.category || 'open_house'
  
  // Dates
  if (event.startDate) {
    discoveryEvent.startDate = event.startDate
  }
  if (event.endDate) {
    discoveryEvent.endDate = event.endDate
  }
  
  // Basic info (optional)
  if (event.name) {
    discoveryEvent.name = event.name
  }
  
  // Description with truncation (public tier gets shorter description)
  if (event.description) {
    const maxLength = isPublicTier ? 200 : MAX_DESCRIPTION_LENGTH
    discoveryEvent.description = truncateDescription(event.description, maxLength)
  }
  
  // Address (structured) - public tier gets less precise address
  if (event.location?.address) {
    const addr = event.location.address
    if (isPublicTier) {
      // Public tier: only city, region, country (no street address, no postal code)
      discoveryEvent.address = {
        addressLocality: addr.addressLocality,
        addressRegion: addr.addressRegion,
        addressCountry: addr.addressCountry
      }
    } else {
      // Brokerage tier: full address
      discoveryEvent.address = {
        streetAddress: addr.streetAddress,
        addressLocality: addr.addressLocality,
        addressRegion: addr.addressRegion,
        postalCode: addr.postalCode,
        addressCountry: addr.addressCountry
      }
    }
  }
  
  // Geo coordinates (when available) - public tier gets reduced precision
  if (event.location?.geo) {
    const geo = event.location.geo
    if (geo.latitude !== undefined && geo.longitude !== undefined) {
      if (isPublicTier) {
        // Public tier: reduce precision to ~1km accuracy (2 decimal places)
        discoveryEvent.geo = {
          latitude: parseFloat(geo.latitude.toFixed(2)),
          longitude: parseFloat(geo.longitude.toFixed(2))
        }
      } else {
        // Brokerage tier: full precision
        discoveryEvent.geo = {
          latitude: geo.latitude,
          longitude: geo.longitude
        }
      }
    }
  }
  
  // Metadata (optional) - public tier gets limited metadata
  if (!isPublicTier) {
    if (event.flypost?.submissionTimestamp) {
      discoveryEvent.submissionTimestamp = event.flypost.submissionTimestamp
    }
    if (event.flypost?.updateCount !== undefined) {
      discoveryEvent.updateCount = event.flypost.updateCount
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

/**
 * Export constants for testing and configuration
 */
export const CONFIG = {
  MAX_DESCRIPTION_LENGTH
}
