/*
 * Test script to validate the v4 backend without OpenAI dependency
 * Tests the parse → publish → query loop with mock data
 */

import { validateEventData } from './src/validation.js'
import { storeEvent, getEvents, getEventsNear, clearEvents } from './src/storage.js'
import { computeEventHash, verifyEventHash } from './src/hashUtils.js'

// Mock event data that matches the v4 schema
const mockEvent = {
  "@context": "https://schema.org",
  "@type": "Event",
  "flypost": {
    "eventId": "evt_test_123456789",
    "category": "garage-sales",
    "realTimeData": true,
    "crawlable": true,
    "queryable": true,
    "submissionTimestamp": new Date().toISOString()
  },
  "name": "Saturday Garage Sale",
  "description": "Multi-family garage sale with furniture, electronics, and household items",
  "startDate": "2025-01-04T08:00:00.000Z",
  "endDate": "2025-01-04T14:00:00.000Z",
  "location": {
    "@type": "Place",
    "name": "123 Main Street",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Main Street",
      "addressLocality": "Springfield",
      "addressRegion": "IL",
      "postalCode": "62701",
      "addressCountry": "US"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 39.7817,
      "longitude": -89.6501
    }
  },
  "organizer": {
    "@type": "Person",
    "name": "John Smith",
    "email": "john@example.com",
    "telephone": "+1-555-0123"
  },
  "keywords": ["furniture", "electronics", "household"]
}

// Test functions
function testValidation() {
  console.log('\n🧪 Testing Event Validation...')
  
  const result = validateEventData(mockEvent)
  
  if (result.success) {
    console.log('✅ Validation passed')
    return true
  } else {
    console.error('❌ Validation failed:', result.errors)
    return false
  }
}

function testStorage() {
  console.log('\n🧪 Testing Event Storage...')
  
  // Clear existing events
  clearEvents()
  
  // Store event - now needs to be async
  return storeEvent(mockEvent).then(stored => {
    console.log('✅ Event stored:', stored.flypost.eventId)
    
    // Retrieve events
    return getEvents().then(events => {
      if (events.length === 1 && events[0].flypost.eventId === mockEvent.flypost.eventId) {
        console.log('✅ Event retrieval works')
        return true
      } else {
        console.error('❌ Event retrieval failed')
        return false
      }
    })
  })
}

function testNearQuery() {
  console.log('\n🧪 Testing Near Query...')
  
  return getEventsNear(39.7817, -89.6501, 10).then(nearEvents => {
    if (nearEvents.length > 0) {
      console.log('✅ Near query works (naive implementation)')
      return true
    } else {
      console.error('❌ Near query failed')
      return false
    }
  })
}

function testMultipleEvents() {
  console.log('\n🧪 Testing Multiple Events...')
  
  clearEvents()
  
  // Create several test events
  const events = [
    { ...mockEvent, flypost: { ...mockEvent.flypost, eventId: 'evt_test_1' }, name: 'Event 1' },
    { ...mockEvent, flypost: { ...mockEvent.flypost, eventId: 'evt_test_2' }, name: 'Event 2' },
    { ...mockEvent, flypost: { ...mockEvent.flypost, eventId: 'evt_test_3' }, name: 'Event 3' },
    { ...mockEvent, flypost: { ...mockEvent.flypost, eventId: 'evt_test_4' }, name: 'Event 4' },
    { ...mockEvent, flypost: { ...mockEvent.flypost, eventId: 'evt_test_5' }, name: 'Event 5' }
  ]
  
  // Store all events (async)
  return Promise.all(events.map(e => storeEvent(e))).then(() => {
    // Check retrieval
    return getEvents().then(stored => {
      if (stored.length === 5) {
        console.log('✅ Multiple events storage works')
        return true
      } else {
        console.error('❌ Multiple events failed:', stored.length)
        return false
      }
    })
  })
}

function testHashComputation() {
  console.log('\n🧪 Testing Hash Computation...')
  
  // Compute hash for mock event
  const hash = computeEventHash(mockEvent)
  
  // Verify hash structure
  if (hash.algorithm === 'SHA-256' && 
      hash.encoding === 'hex' && 
      hash.value && 
      hash.value.length === 64 &&
      /^[0-9a-fA-F]{64}$/.test(hash.value) &&
      hash.canonicalVersion === 1) {
    console.log('✅ Hash computation works:', hash.value.substring(0, 16) + '...')
    
    // Test hash verification
    const eventWithHash = { ...mockEvent, hash }
    if (verifyEventHash(eventWithHash, hash)) {
      console.log('✅ Hash verification works')
      return true
    } else {
      console.error('❌ Hash verification failed')
      return false
    }
  } else {
    console.error('❌ Hash computation failed:', hash)
    return false
  }
}

function testEventWithHash() {
  console.log('\n🧪 Testing Event Validation with Hash...')
  
  // Create event with hash
  const hash = computeEventHash(mockEvent)
  const eventWithHash = { ...mockEvent, hash }
  
  // Validate event with hash
  const result = validateEventData(eventWithHash)
  
  if (result.success && result.data.hash) {
    console.log('✅ Event with hash validates correctly')
    return true
  } else {
    console.error('❌ Event with hash validation failed:', result.errors)
    return false
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Flypost v4 Backend Tests\n')
  
  try {
    const results = [
      testValidation(),
      testHashComputation(),
      testEventWithHash(),
      await testStorage(), 
      await testNearQuery(),
      await testMultipleEvents()
    ]
    
    const passed = results.filter(r => r).length
    const total = results.length
    
    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`)
    
    if (passed === total) {
      console.log('🎉 All tests passed! v4 backend core functionality works.')
    } else {
      console.log('❌ Some tests failed. Check implementation.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test error:', error)
    process.exit(1)
  }
}

// Run the tests
runTests()