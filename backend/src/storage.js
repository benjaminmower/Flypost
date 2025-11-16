/*
 * Flypost v4 - Event Storage (In-Memory + Firestore)
 * Hybrid storage: maintains in-memory store for tests while also persisting to Firestore
 */

import { saveEvent as saveToFirestore, getAllEvents as getFirestoreEvents, isFirestoreEnabled } from './firestoreClient.js'

// In-memory event store
let eventStore = new Map()

/**
 * Store an event in memory and optionally in Firestore
 * @param {object} eventData - Validated event object (should include hash)
 * @returns {Promise<object>} - Stored event with generated ID
 */
export async function storeEvent(eventData) {
  const eventId = eventData.flypost.eventId
  const storedEvent = {
    ...eventData,
    id: eventId,
    storedAt: new Date().toISOString()
  }
  
  // Store in memory
  eventStore.set(eventId, storedEvent)
  
  console.log(`📦 Stored event in memory: ${eventId} (${eventData.name})`)
  console.log(`📊 Total events in store: ${eventStore.size}`)
  
  // Also save to Firestore if enabled
  if (isFirestoreEnabled()) {
    try {
      await saveToFirestore(storedEvent)
    } catch (error) {
      console.error('⚠️  Firestore save failed, event is in memory only:', error.message)
      // Don't throw - event is still in memory
    }
  }
  
  return storedEvent
}

/**
 * Retrieve all events from memory or Firestore
 * @param {object} filters - Optional filters (not implemented yet)
 * @param {boolean} useFirestore - Whether to query Firestore instead of memory
 * @returns {Promise<array>} - Array of stored events
 */
export async function getEvents(filters = {}, useFirestore = false) {
  // If Firestore is enabled and requested, query from Firestore
  if (useFirestore && isFirestoreEnabled()) {
    try {
      const events = await getFirestoreEvents(filters.limit || 100)
      console.log(`📋 Retrieved ${events.length} events from Firestore`)
      return events
    } catch (error) {
      console.error('⚠️  Firestore query failed, falling back to memory:', error.message)
      // Fall through to memory retrieval
    }
  }

  // Default: retrieve from memory
  const events = Array.from(eventStore.values())
  
  // Sort by submission timestamp, newest first
  events.sort((a, b) => new Date(b.flypost.submissionTimestamp) - new Date(a.flypost.submissionTimestamp))
  
  console.log(`📋 Retrieved ${events.length} events from memory`)
  return events
}

/**
 * Get a single event by ID
 * @param {string} eventId - The event ID
 * @returns {object|null} - The event or null if not found
 */
export function getEventById(eventId) {
  const event = eventStore.get(eventId)
  return event || null
}

/**
 * Get events near a location
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude  
 * @param {number} radius - Search radius in kilometers
 * @param {boolean} useFirestore - Whether to query Firestore
 * @returns {Promise<array>} - Array of events
 */
export async function getEventsNear(latitude, longitude, radius = 10, useFirestore = false) {
  // If Firestore is enabled and requested, use Firestore geospatial query
  if (useFirestore && isFirestoreEnabled()) {
    try {
      const { queryEventsByLocationAndTime } = await import('./firestoreClient.js')
      const events = await queryEventsByLocationAndTime({
        latitude,
        longitude,
        radiusKm: radius
      })
      console.log(`📍 Firestore near query (${latitude}, ${longitude}) returned ${events.length} events`)
      return events
    } catch (error) {
      console.error('⚠️  Firestore near query failed, falling back to memory:', error.message)
      // Fall through to memory retrieval
    }
  }

  // Default: naive implementation - return all events from memory
  const events = await getEvents()
  
  console.log(`📍 Near query (${latitude}, ${longitude}) returned ${events.length} events (naive implementation)`)
  return events
}

/**
 * Clear all events (useful for testing)
 * @returns {number} - Number of events cleared
 */
export function clearEvents() {
  const count = eventStore.size
  eventStore.clear()
  console.log(`🗑️  Cleared ${count} events from store`)
  return count
}

/**
 * Get storage statistics
 * @returns {object} - Storage stats
 */
export function getStorageStats() {
  return {
    totalEvents: eventStore.size,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  }
}