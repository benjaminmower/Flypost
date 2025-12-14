/*
 * Flypost v4 - Event Storage (In-Memory + Firestore) v3
 * Hybrid storage: maintains in-memory store for tests while also persisting to Firestore
 */

import { 
  saveEvent as saveToFirestore, 
  getAllEvents as getFirestoreEvents, 
  isFirestoreEnabled,
  findEventByCanonicalKey // <--- Import this new function
} from './firestoreClient.js'
import { hasValidListPrice } from './utils/priceExtractor.js'

// In-memory event store
let eventStore = new Map()

/**
 * Store an event in memory and optionally in Firestore
 * @param {object} eventData - Validated event object (should include hash)
 * @returns {Promise<object>} - Stored event with generated ID
 */
export async function storeEvent(eventData) {
  let finalEvent = { ...eventData }
  let isUpdate = false
  let updateCount = 0

  // 1. CHECK: Does this exist in Firestore?
  // Note: This performs a query on every event ingestion when Firestore is enabled.
  // For high-volume scenarios, consider implementing a cache layer or batch processing.
  if (isFirestoreEnabled() && finalEvent.flypost.canonicalKey) {
    try {
      const existing = await findEventByCanonicalKey(finalEvent.flypost.canonicalKey)
      
      if (existing) {
        console.log(`🔄 Found existing event ${existing.flypost.eventId} for key ${finalEvent.flypost.canonicalKey}`)
        isUpdate = true
        updateCount = (existing.flypost?.updateCount || 0) + 1
        
        // MERGE STRATEGY:
        // 1. Keep the stable identifiers
        finalEvent.flypost.eventId = existing.flypost.eventId
        finalEvent.flypost.updateCount = updateCount
        finalEvent.id = existing.flypost.eventId
        
        // 2. Preserve creation timestamps, update modification
        finalEvent._firestoreMetadata = {
          ...existing._firestoreMetadata,
          updatedAt: new Date()
        }
        
        // 3. Carry forward price if new event lacks it but existing has it
        const newHasPrice = hasValidListPrice(finalEvent)
        const existingHasPrice = hasValidListPrice(existing)
        
        if (!newHasPrice && existingHasPrice) {
          console.log(`💰 Carrying forward price from existing event: ${existing.flypost.listPriceDisplay || existing.flypost.listPrice}`)
          
          // Carry forward all price fields
          finalEvent.flypost.listPrice = existing.flypost.listPrice
          if (existing.flypost.listPriceDisplay) {
            finalEvent.flypost.listPriceDisplay = existing.flypost.listPriceDisplay
          }
          if (existing.flypost.listPriceCurrency) {
            finalEvent.flypost.listPriceCurrency = existing.flypost.listPriceCurrency
          }
          if (existing.flypost.priceType) {
            finalEvent.flypost.priceType = existing.flypost.priceType
          }
          
          // Carry forward offers object if present
          if (existing.offers) {
            finalEvent.offers = existing.offers
          }
        }
        
        // Note: Hash will be recomputed for the updated event data
        // The hash.canonicalVersion field is a constant (1) indicating the hash algorithm version,
        // not an incrementing counter
      }
    } catch (err) {
      console.error('⚠️ Error checking canonical key:', err)
      // Fallback: Proceed as new create if check fails
    }
  }

  // 2. Standard Storage Logic
  const eventId = finalEvent.flypost.eventId
  finalEvent.storedAt = new Date().toISOString()
  
  // Store in memory
  eventStore.set(eventId, finalEvent)
  
  console.log(`📦 ${isUpdate ? 'Updated' : 'Stored new'} event in memory: ${eventId} (update #${updateCount})`)
  
  // Save to Firestore
  if (isFirestoreEnabled()) {
    try {
      await saveToFirestore(finalEvent)
    } catch (error) {
      console.error('⚠️ Firestore save failed:', error.message)
    }
  }
  
  return finalEvent
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
      // Fallback to memory if Firestore returns 0 (e.g., writes failing or no geo on events)
      if (events.length > 0) {
        return events
      }
      console.log('📍 Firestore near query returned 0; falling back to memory store')
    } catch (error) {
      console.error('⚠️  Firestore near query failed, falling back to memory:', error.message)
      // Fall through to memory retrieval
    }
  }

  // Default: naive implementation - return all events from memory
  const events = await getEvents()
  
  console.log(`📍 Near query (${latitude}, ${longitude}) returned ${events.length} events (memory fallback)`)
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
