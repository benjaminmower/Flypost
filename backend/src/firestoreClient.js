/*
 * Flypost v4 - Firestore Client
 * Manages event persistence to Google Cloud Firestore
 */

import { Firestore } from '@google-cloud/firestore'

let firestoreInstance = null

/**
 * Initialize Firestore client
 * Uses Application Default Credentials (ADC) or FIRESTORE_EMULATOR_HOST for local development
 * @returns {Firestore} - Firestore instance
 */
function getFirestoreClient() {
  if (firestoreInstance) {
    return firestoreInstance
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  
  // Initialize Firestore with project ID if available
  // In production, ADC will automatically pick up credentials
  // In development, FIRESTORE_EMULATOR_HOST can be set for local emulator
  const config = {}
  if (projectId) {
    config.projectId = projectId
  }

  firestoreInstance = new Firestore(config)
  
  console.log(`🔥 Firestore initialized${projectId ? ` for project: ${projectId}` : ''}`)
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`🧪 Using Firestore emulator at: ${process.env.FIRESTORE_EMULATOR_HOST}`)
  }

  return firestoreInstance
}

/**
 * Save an event to Firestore
 * @param {object} event - The event object to save
 * @returns {Promise<object>} - The saved event with Firestore metadata
 */
export async function saveEvent(event) {
  const db = getFirestoreClient()
  const eventsCollection = db.collection('events')
  
  const eventId = event.flypost.eventId
  if (!eventId) {
    throw new Error('Event must have a flypost.eventId to save to Firestore')
  }

  try {
    // Save the event using eventId as document ID for idempotency
    const docRef = eventsCollection.doc(eventId)
    
    // Add server timestamp for tracking
    const eventWithMetadata = {
      ...event,
      _firestoreMetadata: {
        createdAt: Firestore.FieldValue.serverTimestamp(),
        updatedAt: Firestore.FieldValue.serverTimestamp()
      }
    }

    await docRef.set(eventWithMetadata)
    
    console.log(`🔥 Saved event to Firestore: ${eventId}`)
    
    return event // Return original event without Firestore internal metadata
  } catch (error) {
    console.error('❌ Firestore save error:', error)
    throw new Error(`Failed to save event to Firestore: ${error.message}`)
  }
}

/**
 * Query events by location and time filters
 * @param {object} filters - Query filters
 * @param {number} filters.latitude - Center latitude
 * @param {number} filters.longitude - Center longitude
 * @param {number} filters.radiusKm - Search radius in kilometers
 * @param {string} filters.startDate - Minimum event start date (ISO 8601)
 * @param {string} filters.endDate - Maximum event start date (ISO 8601)
 * @param {number} filters.limit - Maximum number of results (default 100)
 * @returns {Promise<Array>} - Array of matching events
 */
export async function queryEventsByLocationAndTime(filters = {}) {
  const db = getFirestoreClient()
  const eventsCollection = db.collection('events')
  
  let query = eventsCollection

  // Apply time filters if provided
  if (filters.startDate) {
    query = query.where('startDate', '>=', filters.startDate)
  }
  if (filters.endDate) {
    query = query.where('startDate', '<=', filters.endDate)
  }

  // Apply limit
  const limit = filters.limit || 100
  query = query.limit(limit)

  try {
    const snapshot = await query.get()
    
    let events = []
    snapshot.forEach(doc => {
      const data = doc.data()
      // Remove Firestore internal metadata from returned events
      const { _firestoreMetadata, ...eventData } = data
      events.push(eventData)
    })

    // If location filters are provided, apply in-memory geospatial filtering.
    // Only filter if at least one event has coordinates; otherwise return all events.
    const hasGeoFilters = (
      filters.latitude !== undefined &&
      filters.longitude !== undefined &&
      !!filters.radiusKm
    )

    if (hasGeoFilters) {
      const withGeo = events.filter(e => e?.location?.geo?.latitude && e?.location?.geo?.longitude)
      if (withGeo.length > 0) {
        const filtered = withGeo.filter(event => {
          const distance = calculateDistance(
            filters.latitude,
            filters.longitude,
            event.location.geo.latitude,
            event.location.geo.longitude
          )
          return distance <= filters.radiusKm
        })
        console.log(`🔥 Firestore query (geo-filtered) returned ${filtered.length} of ${withGeo.length} geo-tagged events (from ${events.length} total)`)
        return filtered
      } else {
        console.log('🔥 Firestore query: 0 events have geo; skipping distance filter and returning all events')
        return events
      }
    } else {
      console.log(`🔥 Firestore query (no geo filter) returned ${events.length} events`)
      return events
    }
  } catch (error) {
    console.error('❌ Firestore query error:', error)
    throw new Error(`Failed to query events from Firestore: ${error.message}`)
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lon1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lon2 - Second longitude
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} - Angle in radians
 */
function toRadians(degrees) {
  return degrees * Math.PI / 180
}

/**
 * Get all events (for testing and simple queries)
 * @param {number} limit - Maximum number of events to return
 * @returns {Promise<Array>} - Array of events
 */
export async function getAllEvents(limit = 100) {
  const db = getFirestoreClient()
  const eventsCollection = db.collection('events')
  
  try {
    const snapshot = await eventsCollection
      .orderBy('flypost.submissionTimestamp', 'desc')
      .limit(limit)
      .get()
    
    const events = []
    snapshot.forEach(doc => {
      const data = doc.data()
      const { _firestoreMetadata, ...eventData } = data
      events.push(eventData)
    })
    
    console.log(`🔥 Retrieved ${events.length} events from Firestore`)
    return events
  } catch (error) {
    console.error('❌ Firestore get all events error:', error)
    throw new Error(`Failed to retrieve events from Firestore: ${error.message}`)
  }
}

/**
 * Find a single event by its canonical key.
 * Requires a Firestore index on 'flypost.canonicalKey'.
 * @param {string} canonicalKey 
 * @returns {Promise<object|null>}
 */
export async function findEventByCanonicalKey(canonicalKey) {
  const db = getFirestoreClient()
  const eventsCollection = db.collection('events')
  
  try {
    const snapshot = await eventsCollection
      .where('flypost.canonicalKey', '==', canonicalKey)
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return snapshot.docs[0].data()
  } catch (error) {
    console.error('❌ Firestore findEventByCanonicalKey error:', error)
    throw new Error(`Failed to find event by canonical key: ${error.message}`)
  }
}

/**
 * Get events collection reference
 * @returns {FirebaseFirestore.CollectionReference} - Events collection reference
 */
function getEventsCollection() {
  const db = getFirestoreClient()
  return db.collection('events')
}

/**
 * Check if Firestore is enabled
 * @returns {boolean} - True if Firestore is configured
 */
export function isFirestoreEnabled() {
  return !!(process.env.GOOGLE_CLOUD_PROJECT || 
            process.env.GCLOUD_PROJECT || 
            process.env.FIRESTORE_EMULATOR_HOST)
}
