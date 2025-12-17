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
 * @returns {object} DiscoveryEventV1 object with only allowlisted fields
 */
export function toDiscoveryEventV1(event) {
  if (!event) return null
  
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
  
  // Description with truncation
  if (event.description) {
    discoveryEvent.description = truncateDescription(event.description)
  }
  
  // Address (structured)
  if (event.location?.address) {
    const addr = event.location.address
    discoveryEvent.address = {
      streetAddress: addr.streetAddress,
      addressLocality: addr.addressLocality,
      addressRegion: addr.addressRegion,
      postalCode: addr.postalCode,
      addressCountry: addr.addressCountry
    }
  }
  
  // Geo coordinates (when available)
  if (event.location?.geo) {
    const geo = event.location.geo
    if (geo.latitude !== undefined && geo.longitude !== undefined) {
      discoveryEvent.geo = {
        latitude: geo.latitude,
        longitude: geo.longitude
      }
    }
  }
  
  // Metadata (optional)
  if (event.flypost?.submissionTimestamp) {
    discoveryEvent.submissionTimestamp = event.flypost.submissionTimestamp
  }
  if (event.flypost?.updateCount !== undefined) {
    discoveryEvent.updateCount = event.flypost.updateCount
  }
  
  return discoveryEvent
}

/**
 * Maps an array of stored events to DiscoveryEventV1 format
 * @param {array} events - Array of stored event objects
 * @returns {array} Array of DiscoveryEventV1 objects
 */
export function toDiscoveryEventsV1(events) {
  if (!Array.isArray(events)) return []
  
  return events
    .map(event => toDiscoveryEventV1(event))
    .filter(event => event !== null)
}

/**
 * Export constants for testing and configuration
 */
export const CONFIG = {
  MAX_DESCRIPTION_LENGTH
}
