/**
 * Example demonstration of how the weekly digest function processes data
 * This demonstrates the aggregation logic without requiring a live Firestore connection
 * 
 * Run with: node example-digest.js
 */

// Sample feedback data (simulating what would come from Firestore)
const sampleFeedback = [
  {
    feedbackId: 'fbk_1',
    eventId: 'evt_123',
    attendanceId: 'att_a',
    createdAt: '2025-12-30T10:00:00.000Z',
    answers: {
      liked: 'Great location',
      disliked: null,
      wantsSimilar: true
    }
  },
  {
    feedbackId: 'fbk_2',
    eventId: 'evt_123',
    attendanceId: 'att_b',
    createdAt: '2025-12-30T11:30:00.000Z',
    answers: {
      liked: 'Nice house',
      disliked: 'Too small',
      wantsSimilar: false
    }
  },
  {
    feedbackId: 'fbk_3',
    eventId: 'evt_456',
    attendanceId: 'att_c',
    createdAt: '2026-01-02T15:00:00.000Z',
    answers: {
      liked: 'Beautiful view',
      disliked: null,
      wantsSimilar: true
    }
  },
  {
    feedbackId: 'fbk_4',
    eventId: 'evt_123',
    attendanceId: 'att_d',
    createdAt: '2026-01-03T14:00:00.000Z',
    answers: {
      liked: null,
      disliked: null,
      wantsSimilar: true
    }
  }
]

// Sample attendance data
const sampleAttendance = new Map([
  ['att_a', {
    attendanceId: 'att_a',
    eventId: 'evt_123',
    buyerToken: 'buyer_001',
    checkInTime: '2025-12-30T09:45:00.000Z',
    occurrenceId: 'occ_slot1'
  }],
  ['att_b', {
    attendanceId: 'att_b',
    eventId: 'evt_123',
    buyerToken: 'buyer_002',
    checkInTime: '2025-12-30T11:20:00.000Z',
    occurrenceId: 'occ_slot1'
  }],
  ['att_c', {
    attendanceId: 'att_c',
    eventId: 'evt_456',
    buyerToken: 'buyer_003',
    checkInTime: '2026-01-02T14:50:00.000Z',
    occurrenceId: null
  }],
  ['att_d', {
    attendanceId: 'att_d',
    eventId: 'evt_123',
    buyerToken: 'buyer_001', // Same buyer as att_a
    checkInTime: '2026-01-03T13:55:00.000Z',
    occurrenceId: 'occ_slot2'
  }]
])

// Sample event data
const sampleEvents = new Map([
  ['evt_123', {
    eventId: 'evt_123',
    name: 'Open House - 123 Main St',
    location: {
      address: {
        streetAddress: '123 Main St',
        city: 'Santa Monica',
        state: 'CA',
        postalCode: '90405'
      }
    },
    offers: {
      url: 'https://example.com/listing/123'
    }
  }],
  ['evt_456', {
    eventId: 'evt_456',
    name: 'Open House - 456 Oak Ave',
    location: {
      address: {
        streetAddress: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001'
      }
    },
    url: 'https://example.com/listing/456'
  }]
])

/**
 * Aggregate feedback by eventId (same logic as in index.js)
 */
function aggregateFeedback(feedbackDocs, attendanceMap, eventMap) {
  const eventStats = new Map()
  
  // Aggregate feedback by eventId
  for (const feedback of feedbackDocs) {
    const eventId = feedback.eventId
    
    if (!eventStats.has(eventId)) {
      eventStats.set(eventId, {
        eventId,
        feedbackCount: 0,
        buyerTokens: new Set(),
        occurrenceIds: new Set(),
        wantsSimilarCount: 0
      })
    }
    
    const stats = eventStats.get(eventId)
    stats.feedbackCount++
    
    // Track wantsSimilar
    if (feedback.answers?.wantsSimilar === true) {
      stats.wantsSimilarCount++
    }
    
    // Get attendance data for this feedback
    const attendance = attendanceMap.get(feedback.attendanceId)
    if (attendance) {
      // Track unique buyers (without logging PII)
      if (attendance.buyerToken) {
        stats.buyerTokens.add(attendance.buyerToken)
      }
      
      // Track occurrences
      if (attendance.occurrenceId) {
        stats.occurrenceIds.add(attendance.occurrenceId)
      }
    }
  }
  
  // Count total check-ins per event
  const eventCheckInCounts = new Map()
  for (const [attendanceId, attendance] of attendanceMap.entries()) {
    const eventId = attendance.eventId
    if (!eventCheckInCounts.has(eventId)) {
      eventCheckInCounts.set(eventId, 0)
    }
    eventCheckInCounts.set(eventId, eventCheckInCounts.get(eventId) + 1)
  }
  
  // Build final event digests
  const eventDigests = []
  for (const [eventId, stats] of eventStats.entries()) {
    const digest = {
      eventId,
      feedbackCount: stats.feedbackCount,
      uniqueBuyers: stats.buyerTokens.size,
      totalCheckIns: eventCheckInCounts.get(eventId) || 0,
      wantsSimilarCount: stats.wantsSimilarCount,
      occurrenceIds: Array.from(stats.occurrenceIds)
    }
    
    // Enrich with event data if available
    const eventData = eventMap.get(eventId)
    if (eventData) {
      // Extract address
      if (eventData.location?.address) {
        const addr = eventData.location.address
        const parts = [
          addr.streetAddress,
          addr.addressLocality || addr.city,
          addr.addressRegion || addr.state
        ].filter(Boolean)
        digest.eventAddress = parts.join(', ')
      }
      
      // Extract listing URL
      if (eventData.offers?.url) {
        digest.listingUrl = eventData.offers.url
      } else if (eventData.url) {
        digest.listingUrl = eventData.url
      }
    }
    
    eventDigests.push(digest)
  }
  
  // Sort by feedback count (descending)
  eventDigests.sort((a, b) => b.feedbackCount - a.feedbackCount)
  
  return eventDigests
}

// Run the aggregation
console.log('=== Weekly Feedback Digest Example ===\n')
console.log(`Sample Data:`)
console.log(`  - ${sampleFeedback.length} feedback submissions`)
console.log(`  - ${sampleAttendance.size} attendance records`)
console.log(`  - ${sampleEvents.size} event documents`)
console.log()

const eventDigests = aggregateFeedback(sampleFeedback, sampleAttendance, sampleEvents)

console.log('Generated Digest:\n')
console.log(JSON.stringify({
  windowStartIso: '2025-12-29T08:00:00.000Z',
  windowEndIso: '2026-01-05T08:00:00.000Z',
  generatedAtIso: new Date().toISOString(),
  eventDigests
}, null, 2))

console.log('\n=== Summary ===')
console.log(`Total events with feedback: ${eventDigests.length}`)
eventDigests.forEach((digest, i) => {
  console.log(`\nEvent ${i + 1}: ${digest.eventId}`)
  console.log(`  Address: ${digest.eventAddress || 'N/A'}`)
  console.log(`  Feedback Count: ${digest.feedbackCount}`)
  console.log(`  Unique Buyers: ${digest.uniqueBuyers}`)
  console.log(`  Total Check-ins: ${digest.totalCheckIns}`)
  console.log(`  Want Similar: ${digest.wantsSimilarCount}`)
  console.log(`  Occurrences: ${digest.occurrenceIds.length > 0 ? digest.occurrenceIds.join(', ') : 'N/A'}`)
  console.log(`  Listing URL: ${digest.listingUrl || 'N/A'}`)
})
