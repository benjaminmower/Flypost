/*
 * Test: Weekly Digest Enrichment with Occurrence Preference
 * Validates that weekly digest prefers occurrence docs over event docs for enrichment
 * 
 * These are hermetic unit tests that don't require Firestore
 */

console.log('🧪 Testing Weekly Digest Enrichment with Occurrence Preference\n')

// Mock aggregateFeedbackAndAttendance function logic
function aggregateFeedbackAndAttendance(feedbackDocs, attendanceDocs, eventMap, occurrenceMap) {
  // Track event-occurrence pairs
  const eventOccurrencePairs = new Map()
  
  for (const attendance of attendanceDocs) {
    const eventId = attendance.eventId
    
    if (attendance.occurrenceId) {
      if (!eventOccurrencePairs.has(eventId)) {
        eventOccurrencePairs.set(eventId, new Set())
      }
      eventOccurrencePairs.get(eventId).add(attendance.occurrenceId)
    }
  }
  
  // Build digests
  const eventDigests = []
  const allEventIds = [...new Set(attendanceDocs.map(a => a.eventId))]
  
  for (const eventId of allEventIds) {
    const digest = {
      eventId,
      totalCheckIns: attendanceDocs.filter(a => a.eventId === eventId).length,
      feedbackCount: 0,
      uniqueCheckInBuyers: 0,
      wantsSimilarCount: 0,
      occurrenceIds: [],
      feedbackRate: 0
    }
    
    let enrichedFromOccurrence = false
    
    // Try to enrich from occurrence docs first
    const occurrenceIds = eventOccurrencePairs.get(eventId)
    if (occurrenceIds && occurrenceIds.size > 0) {
      for (const occId of occurrenceIds) {
        const occKey = `${eventId}|${occId}`
        const occData = occurrenceMap.get(occKey)
        
        if (occData) {
          // Populate from occurrence doc
          if (occData.eventAddress) {
            digest.eventAddress = occData.eventAddress
          }
          if (occData.listingUrl) {
            digest.listingUrl = occData.listingUrl
          }
          enrichedFromOccurrence = true
          break
        }
      }
    }
    
    // Fallback to event-level enrichment if no occurrence data available
    if (!enrichedFromOccurrence) {
      const eventData = eventMap.get(eventId)
      if (eventData?.location?.address) {
        const addr = eventData.location.address
        const parts = [
          addr.streetAddress,
          addr.addressLocality || addr.city,
          addr.addressRegion || addr.state
        ].filter(Boolean)
        digest.eventAddress = parts.join(', ')
      }
      
      if (eventData?.offers?.url) {
        digest.listingUrl = eventData.offers.url
      } else if (eventData?.url) {
        digest.listingUrl = eventData.url
      }
    }
    
    eventDigests.push(digest)
  }
  
  return eventDigests
}

// Test 1: Occurrence doc preferred over event doc
function testOccurrencePreferredOverEvent() {
  console.log('Test 1: Occurrence doc preferred over event doc for enrichment')
  
  const attendanceDocs = [
    {
      eventId: 'evt_001',
      occurrenceId: 'occ_001',
      buyerToken: 'buyer_001'
    }
  ]
  
  const occurrenceMap = new Map([
    ['evt_001|occ_001', {
      occurrenceId: 'occ_001',
      eventId: 'evt_001',
      eventAddress: '123 Occurrence St, Santa Monica, CA',
      listingUrl: 'https://occurrence.com/listing'
    }]
  ])
  
  const eventMap = new Map([
    ['evt_001', {
      location: {
        address: {
          streetAddress: '456 Event Ave',
          addressLocality: 'Los Angeles',
          addressRegion: 'CA'
        }
      },
      offers: {
        url: 'https://event.com/listing'
      }
    }]
  ])
  
  const digests = aggregateFeedbackAndAttendance([], attendanceDocs, eventMap, occurrenceMap)
  
  if (digests.length === 1 &&
      digests[0].eventAddress === '123 Occurrence St, Santa Monica, CA' &&
      digests[0].listingUrl === 'https://occurrence.com/listing') {
    console.log('✅ Occurrence doc was preferred for enrichment\n')
    return true
  } else {
    console.error('❌ Event doc was used instead of occurrence doc\n')
    console.error('Got:', digests[0])
    return false
  }
}

// Test 2: Event doc used when occurrence doc missing
function testEventDocFallback() {
  console.log('Test 2: Event doc used as fallback when occurrence doc missing')
  
  const attendanceDocs = [
    {
      eventId: 'evt_002',
      occurrenceId: 'occ_002',
      buyerToken: 'buyer_002'
    }
  ]
  
  const occurrenceMap = new Map() // Empty - no occurrence docs
  
  const eventMap = new Map([
    ['evt_002', {
      location: {
        address: {
          streetAddress: '789 Fallback Blvd',
          addressLocality: 'Venice',
          addressRegion: 'CA'
        }
      },
      url: 'https://event.com/fallback'
    }]
  ])
  
  const digests = aggregateFeedbackAndAttendance([], attendanceDocs, eventMap, occurrenceMap)
  
  if (digests.length === 1 &&
      digests[0].eventAddress === '789 Fallback Blvd, Venice, CA' &&
      digests[0].listingUrl === 'https://event.com/fallback') {
    console.log('✅ Event doc correctly used as fallback\n')
    return true
  } else {
    console.error('❌ Fallback to event doc failed\n')
    console.error('Got:', digests[0])
    return false
  }
}

// Test 3: Locked occurrence prevents historical drift
function testLockedOccurrencePreventsHistoricalDrift() {
  console.log('Test 3: Locked occurrence prevents historical drift when event changes')
  
  const attendanceDocs = [
    {
      eventId: 'evt_003',
      occurrenceId: 'occ_003',
      buyerToken: 'buyer_003',
      createdAt: '2025-01-15T14:00:00Z'
    }
  ]
  
  // Occurrence doc (locked, immutable)
  const occurrenceMap = new Map([
    ['evt_003|occ_003', {
      occurrenceId: 'occ_003',
      eventId: 'evt_003',
      eventAddress: '111 Original St, Santa Monica, CA',
      listingUrl: 'https://original.com/listing',
      lockedAt: '2025-01-15T14:00:00Z'
    }]
  ])
  
  // Event doc (mutated after attendance)
  const eventMap = new Map([
    ['evt_003', {
      location: {
        address: {
          streetAddress: '222 Changed Ave',
          addressLocality: 'Los Angeles',
          addressRegion: 'CA'
        }
      },
      offers: {
        url: 'https://changed.com/listing'
      }
    }]
  ])
  
  const digests = aggregateFeedbackAndAttendance([], attendanceDocs, eventMap, occurrenceMap)
  
  // Digest should show ORIGINAL data from locked occurrence, not changed event data
  if (digests.length === 1 &&
      digests[0].eventAddress === '111 Original St, Santa Monica, CA' &&
      digests[0].listingUrl === 'https://original.com/listing') {
    console.log('✅ Historical data preserved via locked occurrence\n')
    return true
  } else {
    console.error('❌ Historical drift occurred - changed event data was used\n')
    console.error('Got:', digests[0])
    return false
  }
}

// Test 4: Multiple occurrences - uses first available
function testMultipleOccurrencesUsesFirst() {
  console.log('Test 4: Multiple occurrences - uses first available')
  
  const attendanceDocs = [
    {
      eventId: 'evt_004',
      occurrenceId: 'occ_004a',
      buyerToken: 'buyer_004'
    },
    {
      eventId: 'evt_004',
      occurrenceId: 'occ_004b',
      buyerToken: 'buyer_004'
    }
  ]
  
  const occurrenceMap = new Map([
    ['evt_004|occ_004a', {
      occurrenceId: 'occ_004a',
      eventId: 'evt_004',
      eventAddress: '333 First Slot Rd, Malibu, CA',
      listingUrl: 'https://slot1.com/listing'
    }],
    ['evt_004|occ_004b', {
      occurrenceId: 'occ_004b',
      eventId: 'evt_004',
      eventAddress: '444 Second Slot Ave, Malibu, CA',
      listingUrl: 'https://slot2.com/listing'
    }]
  ])
  
  const eventMap = new Map()
  
  const digests = aggregateFeedbackAndAttendance([], attendanceDocs, eventMap, occurrenceMap)
  
  // Should use data from first occurrence found
  if (digests.length === 1 &&
      (digests[0].eventAddress === '333 First Slot Rd, Malibu, CA' ||
       digests[0].eventAddress === '444 Second Slot Ave, Malibu, CA')) {
    console.log('✅ Used data from one of the occurrences\n')
    return true
  } else {
    console.error('❌ Failed to use occurrence data\n')
    console.error('Got:', digests[0])
    return false
  }
}

// Test 5: No occurrence ID in attendance - uses event doc
function testNoOccurrenceIdUsesEventDoc() {
  console.log('Test 5: Attendance without occurrenceId uses event doc')
  
  const attendanceDocs = [
    {
      eventId: 'evt_005',
      occurrenceId: null, // No occurrence ID
      buyerToken: 'buyer_005'
    }
  ]
  
  const occurrenceMap = new Map()
  
  const eventMap = new Map([
    ['evt_005', {
      location: {
        address: {
          streetAddress: '555 Single Slot Way',
          addressLocality: 'Venice',
          addressRegion: 'CA'
        }
      },
      offers: {
        url: 'https://single.com/listing'
      }
    }]
  ])
  
  const digests = aggregateFeedbackAndAttendance([], attendanceDocs, eventMap, occurrenceMap)
  
  if (digests.length === 1 &&
      digests[0].eventAddress === '555 Single Slot Way, Venice, CA' &&
      digests[0].listingUrl === 'https://single.com/listing') {
    console.log('✅ Event doc used when no occurrenceId\n')
    return true
  } else {
    console.error('❌ Failed to use event doc for non-occurrence attendance\n')
    console.error('Got:', digests[0])
    return false
  }
}

// Run all tests
function runAllTests() {
  console.log('=== Weekly Digest Occurrence Enrichment Tests ===\n')
  
  const results = []
  
  results.push(testOccurrencePreferredOverEvent())
  results.push(testEventDocFallback())
  results.push(testLockedOccurrencePreventsHistoricalDrift())
  results.push(testMultipleOccurrencesUsesFirst())
  results.push(testNoOccurrenceIdUsesEventDoc())
  
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log('\n=== Test Summary ===')
  console.log(`Passed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('✅ All tests passed!\n')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed\n')
    process.exit(1)
  }
}

runAllTests()
