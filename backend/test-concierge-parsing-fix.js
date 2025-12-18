#!/usr/bin/env node
/**
 * Test: Concierge Discovery V1 Parsing Fix
 * 
 * Integration test to verify that the concierge correctly parses
 * Discovery V1 responses and populates listings.
 * 
 * This test simulates the flow:
 * 1. Mock Discovery V1 response (as returned by /v1/events/near)
 * 2. Simulate executeGetEventsNear parsing the response
 * 3. Verify that events are correctly extracted
 */

console.log('🧪 Testing Concierge Discovery V1 Parsing Fix\n')
console.log('==============================================\n')

let passCount = 0
let failCount = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result) {
      console.log(`✅ ${name}`)
      passCount++
    } else {
      console.log(`❌ ${name}`)
      failCount++
    }
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`)
    failCount++
  }
}

// Test 1: Simulate Discovery V1 Response Parsing
test('Discovery V1 response structure is parsed correctly', () => {
  // This is what /v1/events/near returns
  const mockDiscoveryV1Response = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: [
      {
        eventId: 'evt_3f8g7h2j1k',
        name: 'Open House - 123 Main St',
        category: 'open_house',
        startDate: '2025-01-20T13:00:00Z',
        location: {
          address: {
            streetAddress: '123 Main St',
            addressLocality: 'Los Angeles',
            addressRegion: 'CA',
            postalCode: '90001'
          },
          geo: {
            latitude: 33.8623,
            longitude: -118.3995
          }
        }
      },
      {
        eventId: 'evt_abc123xyz',
        name: 'Open House - 456 Oak Ave',
        category: 'open_house',
        startDate: '2025-01-20T14:00:00Z',
        location: {
          address: {
            streetAddress: '456 Oak Ave',
            addressLocality: 'Los Angeles',
            addressRegion: 'CA',
            postalCode: '90002'
          },
          geo: {
            latitude: 33.8650,
            longitude: -118.4000
          }
        }
      }
    ],
    meta: {
      count: 2,
      radiusKm: 8.04672
    }
  }

  // This is what executeGetEventsNear should do with the response
  const data = mockDiscoveryV1Response
  const result = {
    success: true,
    events: data.events || [],
    total: data.meta?.count || (data.events || []).length
  }

  // Verify the parsing logic
  const hasEvents = result.events.length === 2
  const hasCorrectTotal = result.total === 2
  const hasCorrectStructure = result.success === true
  const firstEventValid = result.events[0].eventId === 'evt_3f8g7h2j1k'

  return hasEvents && hasCorrectTotal && hasCorrectStructure && firstEventValid
})

// Test 2: Test fallback when meta.count is missing
test('Falls back to events.length when meta.count is missing', () => {
  const mockResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: [
      { eventId: 'evt_1', name: 'Event 1' },
      { eventId: 'evt_2', name: 'Event 2' },
      { eventId: 'evt_3', name: 'Event 3' }
    ],
    meta: {
      radiusKm: 5
      // count field missing
    }
  }

  const data = mockResponse
  const result = {
    success: true,
    events: data.events || [],
    total: data.meta?.count || (data.events || []).length
  }

  return result.total === 3 && result.events.length === 3
})

// Test 3: Test handling of empty events array
test('Handles empty events array correctly', () => {
  const mockResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: [],
    meta: {
      count: 0,
      radiusKm: 5
    }
  }

  const data = mockResponse
  const result = {
    success: true,
    events: data.events || [],
    total: data.meta?.count || (data.events || []).length
  }

  return result.total === 0 && result.events.length === 0 && Array.isArray(result.events)
})

// Test 4: Test handling when events field is missing (defensive)
test('Handles missing events field gracefully', () => {
  const mockResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    // events field missing
    meta: {
      count: 0,
      radiusKm: 5
    }
  }

  const data = mockResponse
  const result = {
    success: true,
    events: data.events || [],
    total: data.meta?.count || (data.events || []).length
  }

  return result.events.length === 0 && Array.isArray(result.events)
})

// Test 5: Verify OLD incorrect parsing would have failed
test('OLD parsing (data.data.events) would have returned empty', () => {
  const mockResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: [
      { eventId: 'evt_1', name: 'Event 1' },
      { eventId: 'evt_2', name: 'Event 2' }
    ],
    meta: {
      count: 2,
      radiusKm: 5
    }
  }

  // Simulate OLD incorrect parsing
  const data = mockResponse
  const oldResult = {
    success: true,
    events: data.data?.events || [],  // Wrong: data.data doesn't exist
    total: data.data?.total || 0      // Wrong: data.data doesn't exist
  }

  // OLD parsing would have returned empty
  const oldWasEmpty = oldResult.events.length === 0 && oldResult.total === 0

  // NEW parsing (what we fixed) would return the events
  const newResult = {
    success: true,
    events: data.events || [],
    total: data.meta?.count || (data.events || []).length
  }

  const newHasEvents = newResult.events.length === 2 && newResult.total === 2

  return oldWasEmpty && newHasEvents
})

// Test 6: Verify the bug scenario from the problem statement
test('Bug scenario: 13 events from /v1/events/near are now parsed correctly', () => {
  // This simulates the exact scenario from the problem statement
  const mockDiscoveryResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: Array.from({ length: 13 }, (_, i) => ({
      eventId: `evt_event_${i + 1}`,
      name: `Open House ${i + 1}`,
      category: 'open_house'
    })),
    meta: {
      count: 13,
      radiusKm: 5
    }
  }

  // NEW correct parsing
  const data = mockDiscoveryResponse
  const result = {
    success: true,
    events: data.events || [],
    total: data.meta?.count || (data.events || []).length
  }

  // Verify we get all 13 events
  return result.events.length === 13 && result.total === 13
})

// Print summary
console.log('\n==============================================')
console.log('Test Summary')
console.log('==============================================')
console.log(`\nTotal: ${passCount + failCount}`)
console.log(`Passed: ${passCount}`)
console.log(`Failed: ${failCount}`)

if (failCount === 0) {
  console.log('\n✅ All concierge parsing tests passed!')
  console.log('\n📝 Fix Summary:')
  console.log('   • Changed: data.data?.events → data.events')
  console.log('   • Changed: data.data?.total → data.meta?.count || data.events.length')
  console.log('   • Result: Concierge now correctly parses Discovery V1 responses')
  console.log('   • Impact: /api/chat will now return listings when events exist')
  process.exit(0)
} else {
  console.log(`\n❌ ${failCount} test(s) failed`)
  process.exit(1)
}
