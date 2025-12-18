#!/usr/bin/env node
/**
 * Integration test for GET /v1/events/:event_id endpoint
 * Tests Firestore-backed get-by-id with memory fallback
 */

import { storeEvent, getEventByIdAny, clearEvents } from './src/storage.js'
import { isFirestoreEnabled } from './src/firestoreClient.js'
import { validateEventData } from './src/validation.js'
import { computeEventHash } from './src/hashUtils.js'

console.log('🧪 Testing GET /v1/events/:event_id Integration\n')
console.log('================================================\n')

const FIRESTORE_ENABLED = isFirestoreEnabled()
console.log(`Firestore: ${FIRESTORE_ENABLED ? '✅ Enabled' : '⚪ Disabled (memory-only mode)'}\n`)

/**
 * Test 1: Get event from memory
 */
async function testGetEventFromMemory() {
  console.log('Test 1: Get event by ID from memory')
  console.log('------------------------------------')
  
  // Clear events first
  clearEvents()
  
  // Create a test event
  const testEvent = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    flypost: {
      eventId: 'evt_test_memory_123',
      category: 'open-houses', // Will be normalized to 'open_house'
      realTimeData: true,
      crawlable: true,
      queryable: true,
      submissionTimestamp: new Date().toISOString()
    },
    name: 'Test Open House',
    description: 'A test event for memory retrieval',
    startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    location: {
      '@type': 'Place',
      name: '123 Main Street',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '123 Main Street',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90405',
        addressCountry: 'US'
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    organizer: {
      '@type': 'Person',
      name: 'Test Organizer',
      email: 'test@example.com'
    }
  }
  
  // Validate
  const validation = validateEventData(testEvent)
  if (!validation.success) {
    console.log('❌ Validation failed:', validation.errors)
    return false
  }
  
  const validatedEvent = validation.data
  const eventHash = computeEventHash(validatedEvent)
  
  const eventToStore = {
    ...validatedEvent,
    hash: eventHash
  }
  
  // Store event
  try {
    await storeEvent(eventToStore)
    console.log('✅ Event stored successfully')
  } catch (error) {
    console.log('❌ Failed to store event:', error.message)
    return false
  }
  
  // Retrieve from memory (useFirestore = false)
  try {
    const retrieved = await getEventByIdAny('evt_test_memory_123', false)
    if (retrieved && retrieved.flypost.eventId === 'evt_test_memory_123') {
      console.log('✅ Event retrieved from memory successfully')
      console.log(`   Event: ${retrieved.name}`)
      return true
    } else {
      console.log('❌ Event not found in memory')
      return false
    }
  } catch (error) {
    console.log('❌ Failed to retrieve event:', error.message)
    return false
  }
}

/**
 * Test 2: Get event with Firestore enabled (if available)
 */
async function testGetEventWithFirestore() {
  console.log('\nTest 2: Get event by ID with Firestore enabled')
  console.log('-----------------------------------------------')
  
  if (!FIRESTORE_ENABLED) {
    console.log('⚪ Skipped (Firestore not configured)')
    return true // Skip test if Firestore not available
  }
  
  // Create a test event
  const testEvent = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    flypost: {
      eventId: 'evt_test_firestore_456',
      category: 'garage-sales', // Will be normalized to 'garage_sale'
      realTimeData: true,
      crawlable: true,
      queryable: true,
      submissionTimestamp: new Date().toISOString()
    },
    name: 'Test Garage Sale',
    description: 'A test event for Firestore retrieval',
    startDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    location: {
      '@type': 'Place',
      name: '456 Oak Avenue',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '456 Oak Avenue',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001',
        addressCountry: 'US'
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0522,
        longitude: -118.2437
      }
    },
    organizer: {
      '@type': 'Person',
      name: 'Test Organizer 2',
      email: 'test2@example.com'
    }
  }
  
  // Validate
  const validation = validateEventData(testEvent)
  if (!validation.success) {
    console.log('❌ Validation failed:', validation.errors)
    return false
  }
  
  const validatedEvent = validation.data
  const eventHash = computeEventHash(validatedEvent)
  
  const eventToStore = {
    ...validatedEvent,
    hash: eventHash
  }
  
  // Store event (will write to both memory and Firestore)
  try {
    await storeEvent(eventToStore)
    console.log('✅ Event stored to both memory and Firestore')
  } catch (error) {
    console.log('❌ Failed to store event:', error.message)
    return false
  }
  
  // Clear memory to force Firestore retrieval
  clearEvents()
  console.log('🗑️  Memory cleared, forcing Firestore retrieval')
  
  // Retrieve with Firestore (useFirestore = true)
  try {
    const retrieved = await getEventByIdAny('evt_test_firestore_456', true)
    if (retrieved && retrieved.flypost.eventId === 'evt_test_firestore_456') {
      console.log('✅ Event retrieved from Firestore successfully')
      console.log(`   Event: ${retrieved.name}`)
      return true
    } else {
      console.log('❌ Event not found in Firestore')
      return false
    }
  } catch (error) {
    console.log('❌ Failed to retrieve event from Firestore:', error.message)
    return false
  }
}

/**
 * Test 3: Non-existent event returns null
 */
async function testNonExistentEvent() {
  console.log('\nTest 3: Non-existent event returns null')
  console.log('----------------------------------------')
  
  try {
    const retrieved = await getEventByIdAny('evt_nonexistent_999', FIRESTORE_ENABLED)
    if (retrieved === null) {
      console.log('✅ Non-existent event correctly returns null')
      return true
    } else {
      console.log('❌ Non-existent event should return null but returned:', retrieved)
      return false
    }
  } catch (error) {
    console.log('❌ Error retrieving non-existent event:', error.message)
    return false
  }
}

// Run all tests
async function runTests() {
  const results = []
  
  results.push(await testGetEventFromMemory())
  results.push(await testGetEventWithFirestore())
  results.push(await testNonExistentEvent())
  
  const passed = results.filter(r => r).length
  const failed = results.length - passed
  
  console.log('\n================================================')
  console.log(`Summary: ${passed} passed, ${failed} failed out of ${results.length} tests`)
  
  if (failed > 0) {
    process.exit(1)
  }
  
  console.log('\n✅ All get-by-id integration tests passed!')
}

runTests().catch(error => {
  console.error('❌ Test suite error:', error)
  process.exit(1)
})
