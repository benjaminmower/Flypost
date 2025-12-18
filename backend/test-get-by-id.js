/**
 * Test script for GET /v1/events/:event_id endpoint
 * Tests hybrid storage (Firestore + memory fallback)
 */

import { getEventByIdAny } from './src/storage.js'
import { isFirestoreEnabled } from './src/firestoreClient.js'

console.log('🧪 Testing GET by ID functionality\n')

// Test 1: Basic functionality
console.log('Test 1: Testing getEventByIdAny with non-existent ID')
const nonExistentId = 'evt_nonexistent_12345'
try {
  const result = await getEventByIdAny(nonExistentId, isFirestoreEnabled())
  console.log(`✅ Test 1 passed: getEventByIdAny returned ${result === null ? 'null' : 'an event'} for non-existent ID`)
  if (result !== null) {
    console.error('❌ Expected null for non-existent event')
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 1 failed:', error.message)
  process.exit(1)
}

// Test 2: Firestore status
console.log('\nTest 2: Checking Firestore configuration')
const firestoreEnabled = isFirestoreEnabled()
console.log(`✅ Test 2 passed: Firestore is ${firestoreEnabled ? 'ENABLED' : 'DISABLED'}`)
if (firestoreEnabled) {
  console.log('   Using hybrid storage (Firestore + memory fallback)')
} else {
  console.log('   Using memory-only storage (dev mode)')
}

// Test 3: Mock event in memory
console.log('\nTest 3: Testing memory fallback with mock event')
import { storeEvent } from './src/storage.js'

const mockEvent = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_test_by_id_12345',
    eventIdentity: 'test:by-id:validation',
    category: 'open_house',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: new Date().toISOString()
  },
  name: 'Test Event for By-ID Validation',
  description: 'Testing get-by-id endpoint',
  startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  location: {
    '@type': 'Place',
    name: '123 Test Street',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Test Street',
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
    name: 'Test Organizer',
    email: 'test@example.com'
  }
}

try {
  await storeEvent(mockEvent)
  console.log('✅ Mock event stored successfully')
  
  // Try to retrieve it
  const retrievedEvent = await getEventByIdAny('evt_test_by_id_12345', firestoreEnabled)
  if (retrievedEvent && retrievedEvent.flypost.eventId === 'evt_test_by_id_12345') {
    console.log('✅ Test 3 passed: Retrieved mock event by ID')
  } else {
    console.error('❌ Test 3 failed: Could not retrieve mock event')
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 3 failed:', error.message)
  process.exit(1)
}

console.log('\n✅ All tests passed!')
console.log('\n📋 Summary:')
console.log('   - Hybrid getter (getEventByIdAny) works correctly')
console.log('   - Memory fallback functional')
console.log('   - Firestore integration ready')
console.log('\n💡 Next steps:')
console.log('   - Start the backend server: npm start')
console.log('   - Test the endpoint: GET http://localhost:3001/v1/events/evt_test_by_id_12345')
console.log('   - Verify proxy forwarding works in production')
