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
export function getFirestoreClient() {
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
    
    // Prepare metadata: preserve existing createdAt if present, always update updatedAt
    const metadata = event._firestoreMetadata?.createdAt
      ? {
          createdAt: event._firestoreMetadata.createdAt, // Preserve existing
          updatedAt: Firestore.FieldValue.serverTimestamp()
        }
      : {
          createdAt: Firestore.FieldValue.serverTimestamp(), // New event
          updatedAt: Firestore.FieldValue.serverTimestamp()
        }
    
    const eventWithMetadata = {
      ...event,
      _firestoreMetadata: metadata
    }

    await docRef.set(eventWithMetadata)
    
    console.log(`🔥 Saved event to Firestore: ${eventId}`)
    
    // After saving event, persist occurrence documents
    await saveOccurrences(event)
    
    return event // Return original event without Firestore internal metadata
  } catch (error) {
    console.error('❌ Firestore save error:', error)
    throw new Error(`Failed to save event to Firestore: ${error.message}`)
  }
}

/**
 * Extract event address as a single human-readable string
 * @param {object} event - The event object
 * @returns {string|null} - Address string or null
 * @private
 */
function extractEventAddress(event) {
  if (!event.location?.address) {
    return null
  }
  
  const addr = event.location.address
  const parts = [
    addr.streetAddress,
    addr.addressLocality || addr.city,
    addr.addressRegion || addr.state
  ].filter(Boolean)
  
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Extract listing URL from event
 * @param {object} event - The event object
 * @returns {string|null} - Listing URL or null
 * @private
 */
function extractListingUrl(event) {
  return event.offers?.url || event.url || null
}

/**
 * Save occurrence documents for an event
 * Persists each occurrence as a subcollection document under events/{eventId}/occurrences/{occurrenceId}
 * Enforces lock semantics: locked occurrences cannot have identity fields updated
 * @param {object} event - The event object with occurrences array
 * @returns {Promise<void>}
 */
export async function saveOccurrences(event) {
  const eventId = event.flypost?.eventId
  if (!eventId) {
    return
  }

  // Get occurrences array - prefer event.occurrences, fallback to event.flypost.occurrences
  const occurrences = event.occurrences || event.flypost?.occurrences
  if (!occurrences || !Array.isArray(occurrences) || occurrences.length === 0) {
    return
  }

  const db = getFirestoreClient()
  const eventDocRef = db.collection('events').doc(eventId)
  const occurrencesCollection = eventDocRef.collection('occurrences')
  
  // Extract event-level fields once
  const eventAddress = extractEventAddress(event)
  const listingUrl = extractListingUrl(event)

  console.log(`🔥 Persisting ${occurrences.length} occurrence(s) for event ${eventId}`)

  for (const occ of occurrences) {
    if (!occ.occurrenceId) {
      console.warn(`⚠️  Skipping occurrence without occurrenceId`)
      continue
    }

    try {
      const occDocRef = occurrencesCollection.doc(occ.occurrenceId)
      
      // Use a transaction to atomically check lock and update
      await db.runTransaction(async (transaction) => {
        const existingDoc = await transaction.get(occDocRef)
        
        if (existingDoc.exists) {
          const existingData = existingDoc.data()
          
          // If locked, only update non-identity metadata
          if (existingData.lockedAt) {
            console.log(`🔒 Occurrence ${occ.occurrenceId} is locked - preserving identity fields`)
            
            // Only update updatedAt timestamp
            transaction.update(occDocRef, {
              '_firestoreMetadata.updatedAt': Firestore.FieldValue.serverTimestamp()
            })
            
            return
          }
        }
        
        // Not locked or doesn't exist - write/update full document
        const occurrenceDoc = {
          occurrenceId: occ.occurrenceId,
          eventId: eventId,
          startDate: occ.startDate,
          endDate: occ.endDate,
          eventAddress: eventAddress,
          listingUrl: listingUrl,
          lockedAt: existingDoc.exists ? existingData.lockedAt : null,
          _firestoreMetadata: {
            createdAt: existingDoc.exists && existingData._firestoreMetadata?.createdAt 
              ? existingData._firestoreMetadata.createdAt 
              : Firestore.FieldValue.serverTimestamp(),
            updatedAt: Firestore.FieldValue.serverTimestamp()
          }
        }
        
        transaction.set(occDocRef, occurrenceDoc)
      })
      
      console.log(`  ✅ Saved occurrence: ${occ.occurrenceId}`)
      
    } catch (error) {
      console.error(`❌ Failed to save occurrence ${occ.occurrenceId}:`, error.message)
      // Continue with other occurrences
    }
  }
}

/**
 * Lock an occurrence document when first attendance is recorded
 * Marks the occurrence as immutable for identity fields
 * Uses merge semantics to avoid overwriting existing locks
 * @param {string} eventId - The event ID
 * @param {string} occurrenceId - The occurrence ID
 * @returns {Promise<void>}
 */
export async function lockOccurrence(eventId, occurrenceId) {
  if (!eventId || !occurrenceId) {
    return
  }

  const db = getFirestoreClient()
  const occDocRef = db.collection('events')
    .doc(eventId)
    .collection('occurrences')
    .doc(occurrenceId)

  try {
    // Use set with merge:true to only set lockedAt if document exists
    // If lockedAt already exists, merge will preserve it
    // This is idempotent and safe for concurrent calls
    await occDocRef.set(
      {
        lockedAt: Firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    )
    
    console.log(`🔒 Locked occurrence: ${occurrenceId} for event ${eventId}`)
  } catch (error) {
    console.error(`⚠️  Failed to lock occurrence ${occurrenceId}:`, error.message)
    // Non-fatal - continue with attendance recording
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
 * Find a single event by its event identity (brokerage-agnostic).
 * Requires a Firestore index on 'flypost.eventIdentity'.
 * @param {string} eventIdentity 
 * @returns {Promise<object|null>}
 */
export async function findEventByIdentity(eventIdentity) {
  // Check if Firestore is enabled before attempting query
  if (!isFirestoreEnabled()) {
    return null
  }
  
  const eventsCollection = getEventsCollection()
  
  try {
    const snapshot = await eventsCollection
      .where('flypost.eventIdentity', '==', eventIdentity)
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return snapshot.docs[0].data()
  } catch (error) {
    console.error('❌ Firestore findEventByIdentity error:', error)
    throw new Error(`Failed to find event by identity: ${error.message}`)
  }
}

/**
 * LEGACY: Find a single event by its canonical key.
 * Requires a Firestore index on 'flypost.canonicalKey'.
 * @deprecated Use findEventByIdentity for brokerage-agnostic event identity
 * @param {string} canonicalKey 
 * @returns {Promise<object|null>}
 */
export async function findEventByCanonicalKey(canonicalKey) {
  // Check if Firestore is enabled before attempting query
  if (!isFirestoreEnabled()) {
    return null
  }
  
  const eventsCollection = getEventsCollection()
  
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
 * Get a single event by its document ID from Firestore
 * @param {string} eventId - The event ID (document ID in Firestore)
 * @returns {Promise<object|null>} - The event or null if not found
 */
export async function getEventByIdFromFirestore(eventId) {
  if (!isFirestoreEnabled()) {
    return null
  }
  
  const eventsCollection = getEventsCollection()
  
  try {
    const docRef = eventsCollection.doc(eventId)
    const docSnap = await docRef.get()
    
    if (!docSnap.exists) {
      return null
    }
    
    const data = docSnap.data()
    // Remove Firestore internal metadata from returned event
    const { _firestoreMetadata, ...eventData } = data || {}
    
    console.log(`🔥 Retrieved event by ID from Firestore: ${eventId}`)
    return eventData
  } catch (error) {
    console.error('❌ Firestore getEventById error:', error)
    throw new Error(`Failed to get event by ID from Firestore: ${error.message}`)
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

/**
 * Check if an event has any attendance records
 * This is used to prevent overwriting events that have real attendance data.
 * @param {string} eventId - The event ID to check
 * @returns {Promise<boolean>} - True if attendance exists for this event
 */
export async function eventHasAttendance(eventId) {
  // No-op if Firestore is not enabled
  if (!isFirestoreEnabled()) {
    return false
  }
  
  const db = getFirestoreClient()
  const attendanceCollection = db.collection('attendance')
  
  try {
    // Use limit(1) for efficiency - we only need to know if ANY attendance exists
    const snapshot = await attendanceCollection
      .where('eventId', '==', eventId)
      .limit(1)
      .get()
    
    const hasAttendance = !snapshot.empty
    console.log(`🔍 Attendance check for event ${eventId}: ${hasAttendance ? 'EXISTS' : 'NONE'}`)
    
    return hasAttendance
  } catch (error) {
    console.error(`⚠️ Error checking attendance for event ${eventId}:`, error.message)
    // On error, conservatively assume attendance exists to prevent accidental overwrites
    return true
  }
}
