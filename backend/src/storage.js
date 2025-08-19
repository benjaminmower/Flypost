/*
 * Flypost v4 - In-Memory Event Storage
 * Simple in-memory storage for MVP, to be replaced with Firestore later
 */

// In-memory event store
let eventStore = new Map()

/**
 * Store an event in memory
 * @param {object} eventData - Validated event object
 * @returns {object} - Stored event with generated ID
 */
export function storeEvent(eventData) {
  const eventId = eventData.flypost.eventId
  const storedEvent = {
    ...eventData,
    id: eventId,
    storedAt: new Date().toISOString()
  }
  
  eventStore.set(eventId, storedEvent)
  
  console.log(`📦 Stored event: ${eventId} (${eventData.name})`)
  console.log(`📊 Total events in store: ${eventStore.size}`)
  
  return storedEvent
}

/**
 * Retrieve all events (naive implementation)
 * @param {object} filters - Optional filters (not implemented yet)
 * @returns {array} - Array of stored events
 */
export function getEvents(filters = {}) {
  const events = Array.from(eventStore.values())
  
  // Sort by submission timestamp, newest first
  events.sort((a, b) => new Date(b.flypost.submissionTimestamp) - new Date(a.flypost.submissionTimestamp))
  
  console.log(`📋 Retrieved ${events.length} events`)
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
 * Get events near a location (naive implementation)
 * In v4, this just returns all events - to be enhanced later
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude  
 * @param {number} radius - Search radius (not used yet)
 * @returns {array} - Array of events
 */
export function getEventsNear(latitude, longitude, radius = 10) {
  // For MVP, just return all events
  // TODO: Implement actual geospatial filtering
  const events = getEvents()
  
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