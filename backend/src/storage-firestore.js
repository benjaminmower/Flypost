/*
 * Flypost v4 - Firestore Event Storage
 * Uses Application Default Credentials (Cloud Run service account) and GOOGLE_CLOUD_PROJECT
 */

import { Firestore } from '@google-cloud/firestore'

// Use env var so local dev can target a project explicitly if needed
const projectId = process.env.GOOGLE_CLOUD_PROJECT

if (!projectId) {
  console.warn('⚠️  GOOGLE_CLOUD_PROJECT is not set. Firestore storage will not be available.')
}

// Lazy init so the module can still be imported in environments without ADC
let firestore = null
let eventsCollection = null

function getEventsCollection() {
  if (!projectId) {
    throw new Error('Firestore not configured: GOOGLE_CLOUD_PROJECT is missing')
  }
  if (!firestore) {
    firestore = new Firestore({ projectId })
    eventsCollection = firestore.collection('events')
    console.log(`🔥 Firestore initialized for project ${projectId}, collection "events"`)
  }
  return eventsCollection
}

/**
 * Store an event in Firestore
 * @param {object} eventData - Validated event object
 * @returns {object} - Stored event with generated ID
 */
export async function storeEvent(eventData) {
  const eventId = eventData.flypost.eventId
  const storedEvent = {
    ...eventData,
    id: eventId,
    storedAt: new Date().toISOString()
  }

  const collection = getEventsCollection()
  await collection.doc(eventId).set(storedEvent, { merge: false })

  console.log(`🔥 Firestore write: events/${eventId} (${eventData.name})`)
  return storedEvent
}

/**
 * Retrieve all events
 * @returns {array} - Array of stored events
 */
export async function getEvents() {
  const collection = getEventsCollection()
  const snapshot = await collection.orderBy('flypost.submissionTimestamp', 'desc').get()

  const events = []
  snapshot.forEach(doc => events.push(doc.data()))

  console.log(`🔥 Firestore read: retrieved ${events.length} events`)
  return events
}

/**
 * Get events near a location
 * For now, naive: just returns all events.
 */
export async function getEventsNear(latitude, longitude, radius = 10) {
  // TODO: use hashes/index to filter; for now, reuse getEvents
  const events = await getEvents()
  console.log(`🔥 Firestore near-query (${latitude}, ${longitude}) returned ${events.length} events (naive)`)
  return events
}

/**
 * Clear all events (dev/test only)
 */
export async function clearEvents() {
  const collection = getEventsCollection()
  const snapshot = await collection.get()
  let count = 0

  const batch = firestore.batch()
  snapshot.forEach(doc => {
    batch.delete(doc.ref)
    count++
  })

  if (count > 0) {
    await batch.commit()
  }

  console.log(`🔥 Firestore cleared ${count} events`)
  return count
}

/**
 * Get storage statistics
 */
export async function getStorageStats() {
  const collection = getEventsCollection()
  const snapshot = await collection.limit(1).get()
  // NOTE: Firestore doesn’t have cheap COUNT(*) without aggregation; this is a stub.
  return {
    backend: 'firestore',
    // You could maintain a separate counter collection if you need exact counts cheaply
    approximateEvents: snapshot.empty ? 0 : undefined,
    projectId,
    uptime: process.uptime()
  }
}
