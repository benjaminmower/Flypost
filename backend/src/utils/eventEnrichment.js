/*
 * Flypost v4 - Event Enrichment Utilities
 * Shared logic for enriching events with server-side metadata
 */

import { computeEventIdentity } from './canonicalKey.js'

/**
 * Generate a unique event ID.
 * Format: evt_<random>_<timestamp>
 * 
 * @returns {string} - Generated event ID
 */
export function generateEventId() {
  return `evt_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`
}

/**
 * Enrich event with server-side identity and metadata.
 * Ensures eventIdentity, eventId, submissionTimestamp are set.
 * Sets defaults for realTimeData, crawlable, queryable if missing.
 * 
 * @param {object} event - Event object to enrich
 * @param {object} options - Options for enrichment
 * @param {string} options.brokerageId - Optional brokerage ID for backward compat
 * @param {boolean} options.isUpdate - Whether this is an update (preserves eventId)
 * @param {string} options.existingEventId - Existing event ID to preserve on update
 * @param {number} options.updateCount - Update count for this event
 * @returns {object} - Enriched event
 */
export function enrichEventMetadata(event, options = {}) {
  const {
    brokerageId = null,
    isUpdate = false,
    existingEventId = null,
    updateCount = 0
  } = options
  
  // Ensure flypost object exists
  event.flypost = event.flypost || {}
  
  // 1. Compute event identity (brokerage-agnostic)
  const eventIdentity = computeEventIdentity(event)
  if (eventIdentity) {
    event.flypost.eventIdentity = eventIdentity
    console.log(`🔑 Event Identity: ${eventIdentity}`)
  } else {
    console.warn('⚠️ Could not generate event identity (missing address or startDate?)')
  }
  
  // 2. Set or preserve eventId
  if (isUpdate && existingEventId) {
    event.flypost.eventId = existingEventId
    console.log(`🔄 Preserving existing eventId: ${existingEventId}`)
  } else if (!event.flypost.eventId) {
    event.flypost.eventId = generateEventId()
    console.log(`🆕 Generated new eventId: ${event.flypost.eventId}`)
  }
  
  // 3. Set submission timestamp (always overwrite on ingest)
  event.flypost.submissionTimestamp = new Date().toISOString()
  
  // 4. Set update count
  event.flypost.updateCount = updateCount
  
  // 5. Set defaults for required boolean flags if missing
  if (event.flypost.realTimeData === undefined) {
    event.flypost.realTimeData = true
  }
  if (event.flypost.crawlable === undefined) {
    event.flypost.crawlable = true
  }
  if (event.flypost.queryable === undefined) {
    event.flypost.queryable = true
  }
  
  // 6. Add brokerageId if provided (backward compatibility)
  if (brokerageId) {
    event.flypost.brokerageId = brokerageId
  }
  
  return event
}

/**
 * Normalize ISO date fields in an event.
 * @param {object} event - Event object
 */
export function normalizeEventDates(event) {
  function isIsoDateTime(str) {
    return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)
  }
  
  function toIsoIfParsable(value) {
    if (typeof value !== 'string') return value
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? value : d.toISOString()
  }
  
  if (event.startDate && !isIsoDateTime(event.startDate)) {
    const before = event.startDate
    event.startDate = toIsoIfParsable(event.startDate)
    if (event.startDate !== before) {
      console.log(`⏱️  Normalized startDate: ${before} -> ${event.startDate}`)
    }
  }
  
  if (event.endDate && !isIsoDateTime(event.endDate)) {
    const before = event.endDate
    event.endDate = toIsoIfParsable(event.endDate)
    if (event.endDate !== before) {
      console.log(`⏱️  Normalized endDate: ${before} -> ${event.endDate}`)
    }
  }
}
