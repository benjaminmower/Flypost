/*
 * Test: Presence Check-in with Occurrences
 * 
 * Tests that presence check-in works with multi-slot events
 */

import { storeEvent, clearEvents } from './src/storage.js'

const fetchImpl = globalThis.fetch || (await import('node-fetch').then(m => m.default))
const BASE_URL = 'http://localhost:8080'

console.log('🧪 Testing Presence Check-in with Occurrences\n')

// Clear storage
await clearEvents()

// Create a test event with multiple occurrences
const now = new Date()
const future1Start = new Date(now.getTime() + 3600000) // 1 hour from now
const future1End = new Date(now.getTime() + 7200000)   // 2 hours from now
const future2Start = new Date(now.getTime() + 86400000) // 1 day from now
const future2End = new Date(now.getTime() + 90000000)   // 1 day + 1 hour from now

const testEvent = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_test_multislot',
    brokerageId: 'test-brokerage',
    category: 'open-houses',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: now.toISOString(),
    timezone: 'America/Los_Angeles',
    occurrences: [
      {
        occurrenceId: 'occ_test_1',
        startDate: future1Start.toISOString(),
        endDate: future1End.toISOString(),
        label: 'Saturday Morning'
      },
      {
        occurrenceId: 'occ_test_2',
        startDate: future2Start.toISOString(),
        endDate: future2End.toISOString(),
        label: 'Sunday Afternoon'
      }
    ]
  },
  name: 'Multi-Slot Open House Test',
  description: 'Test event for multi-slot presence check-in',
  startDate: future1Start.toISOString(),
  endDate: future1End.toISOString(),
  location: {
    '@type': 'Place',
    name: '123 Test St',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Test St',
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
    name: 'Test Agent'
  }
}

console.log('📝 Storing test event...')
await storeEvent(testEvent)
console.log('✅ Event stored\n')

// Test 1: Check-in before any occurrence starts (should fail)
console.log('Test 1: Check-in before event starts')
try {
  const response = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: 'evt_test_multislot',
      lat: 34.0522,
      lng: -118.2437,
      buyerToken: 'test_buyer_1'
    })
  })

  const data = await response.json()
  
  if (response.ok) {
    console.error('❌ Should have rejected check-in before event starts')
  } else {
    console.log(`✅ Correctly rejected: ${data.error}`)
    if (data.message) console.log(`   Message: ${data.message}`)
  }
} catch (error) {
  console.error(`❌ Error:`, error.message)
}

// Test 2: Simulate time during first occurrence
console.log('\nTest 2: Create event with active occurrence')

// Create an event where one occurrence is currently active
const activeStart = new Date(now.getTime() - 1800000) // 30 minutes ago
const activeEnd = new Date(now.getTime() + 1800000)   // 30 minutes from now

const activeEvent = {
  ...testEvent,
  flypost: {
    ...testEvent.flypost,
    eventId: 'evt_test_active',
    occurrences: [
      {
        occurrenceId: 'occ_active',
        startDate: activeStart.toISOString(),
        endDate: activeEnd.toISOString(),
        label: 'Currently Active'
      }
    ]
  },
  startDate: activeStart.toISOString(),
  endDate: activeEnd.toISOString()
}

await storeEvent(activeEvent)

// Test 2: Check-in without specifying eventId (use nearest matching during active occurrence)
console.log('\nTest 2: Check-in during active occurrence (nearest matching)')
try {
  const response = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Don't specify eventId - let it find nearest
      lat: 34.0522,
      lng: -118.2437,
      buyerToken: 'test_buyer_2'
    })
  })

  const data = await response.json()
  
  if (!response.ok) {
    console.error(`❌ Check-in should have succeeded`)
    console.error(`   Error: ${data.error}`)
    if (data.message) console.error(`   Message: ${data.message}`)
  } else {
    console.log(`✅ Check-in succeeded: ${data.attendance.attendanceId}`)
    console.log(`   Event ID: ${data.attendance.eventId}`)
    if (data.attendance.occurrenceId) {
      console.log(`   Occurrence ID: ${data.attendance.occurrenceId}`)
    }
    
    // Verify occurrenceId was captured
    if (!data.attendance.occurrenceId) {
      console.error(`❌ OccurrenceId was not captured in attendance`)
    } else {
      console.log(`✅ OccurrenceId correctly captured`)
    }
  }
} catch (error) {
  console.error(`❌ Error:`, error.message)
}

// Test 3: Event with no occurrences (fallback to top-level)
console.log('\nTest 3: Event without occurrences (fallback)')

const simpleEvent = {
  ...testEvent,
  flypost: {
    ...testEvent.flypost,
    eventId: 'evt_test_simple',
    occurrences: undefined
  },
  startDate: activeStart.toISOString(),
  endDate: activeEnd.toISOString()
}
delete simpleEvent.flypost.occurrences

await storeEvent(simpleEvent)

try {
  const response = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: 'evt_test_simple',
      lat: 34.0522,
      lng: -118.2437,
      buyerToken: 'test_buyer_3'
    })
  })

  const data = await response.json()
  
  if (!response.ok) {
    console.error(`❌ Check-in should have succeeded`)
    console.error(`   Error: ${data.error}`)
  } else {
    console.log(`✅ Check-in succeeded without occurrences`)
    console.log(`   Has occurrenceId: ${!!data.attendance.occurrenceId}`)
    
    // Verify no occurrenceId for simple event
    if (data.attendance.occurrenceId) {
      console.error(`❌ OccurrenceId should not be present for simple event`)
    } else {
      console.log(`✅ No occurrenceId for simple event (correct)`)
    }
  }
} catch (error) {
  console.error(`❌ Error:`, error.message)
}

console.log('\n✅ Presence check-in tests complete!')
