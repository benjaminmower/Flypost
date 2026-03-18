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
      different: 'Would need a larger kitchen',
      wouldBuy: 'maybe'
    }
  },
  {
    feedbackId: 'fbk_2',
    eventId: 'evt_123',
    attendanceId: 'att_b',
    createdAt: '2025-12-30T11:30:00.000Z',
    answers: {
      different: 'Price would need to drop 10%',
      wouldBuy: 'no'
    }
  },
  {
    feedbackId: 'fbk_3',
    eventId: 'evt_456',
    attendanceId: 'att_c',
    createdAt: '2026-01-02T15:00:00.000Z',
    answers: {
      different: null,
      wouldBuy: 'yes'
    }
  },
  {
    feedbackId: 'fbk_4',
    eventId: 'evt_123',
    attendanceId: 'att_d',
    createdAt: '2026-01-03T14:00:00.000Z',
    answers: {
      different: null,
      wouldBuy: 'yes'
    }
  }
]

// Sample attendance data from weekly window (as array, not map)
const sampleAttendance = [
  {
    attendanceId: 'att_a',
    eventId: 'evt_123',
    buyerToken: 'buyer_001',
    checkInTime: '2025-12-30T09:45:00.000Z',
    createdAt: '2025-12-30T09:45:00.000Z',
    occurrenceId: 'occ_slot1'
  },
  {
    attendanceId: 'att_b',
    eventId: 'evt_123',
    buyerToken: 'buyer_002',
    checkInTime: '2025-12-30T11:20:00.000Z',
    createdAt: '2025-12-30T11:20:00.000Z',
    occurrenceId: 'occ_slot1'
  },
  {
    attendanceId: 'att_c',
    eventId: 'evt_456',
    buyerToken: 'buyer_003',
    checkInTime: '2026-01-02T14:50:00.000Z',
    createdAt: '2026-01-02T14:50:00.000Z',
    occurrenceId: null
  },
  {
    attendanceId: 'att_d',
    eventId: 'evt_123',
    buyerToken: 'buyer_001', // Same buyer as att_a
    checkInTime: '2026-01-03T13:55:00.000Z',
    createdAt: '2026-01-03T13:55:00.000Z',
    occurrenceId: 'occ_slot2'
  },
  {
    attendanceId: 'att_e',
    eventId: 'evt_789', // Event with attendance but no feedback
    buyerToken: 'buyer_004',
    checkInTime: '2026-01-04T10:00:00.000Z',
    createdAt: '2026-01-04T10:00:00.000Z',
    occurrenceId: null
  },
  {
    attendanceId: 'att_f',
    eventId: 'evt_789', // Second check-in for same event
    buyerToken: 'buyer_005',
    checkInTime: '2026-01-04T11:00:00.000Z',
    createdAt: '2026-01-04T11:00:00.000Z',
    occurrenceId: null
  }
]

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
  }],
  ['evt_789', {
    eventId: 'evt_789',
    name: 'Open House - 789 Pine St',
    location: {
      address: {
        streetAddress: '789 Pine St',
        city: 'Venice',
        state: 'CA',
        postalCode: '90291'
      }
    },
    url: 'https://example.com/listing/789'
  }]
])

/**
 * Aggregate feedback and attendance by eventId (same logic as in index.js)
 */
function aggregateFeedbackAndAttendance(feedbackDocs, attendanceDocs, eventMap) {
  // Build attendance-based stats per eventId
  const attendanceStatsByEventId = new Map()
  
  for (const attendance of attendanceDocs) {
    const eventId = attendance.eventId
    
    if (!attendanceStatsByEventId.has(eventId)) {
      attendanceStatsByEventId.set(eventId, {
        totalCheckIns: 0,
        uniqueCheckInBuyers: new Set(),
        occurrenceIds: new Set()
      })
    }
    
    const stats = attendanceStatsByEventId.get(eventId)
    stats.totalCheckIns++
    
    // Track unique buyers (without logging PII)
    if (attendance.buyerToken) {
      stats.uniqueCheckInBuyers.add(attendance.buyerToken)
    }
    
    // Track occurrences (excluding null)
    if (attendance.occurrenceId) {
      stats.occurrenceIds.add(attendance.occurrenceId)
    }
  }
  
  // Build feedback-based stats per eventId
  const feedbackStatsByEventId = new Map()
  
  for (const feedback of feedbackDocs) {
    const eventId = feedback.eventId
    
    if (!feedbackStatsByEventId.has(eventId)) {
      feedbackStatsByEventId.set(eventId, {
        feedbackCount: 0,
        wouldBuyYesCount: 0,
        wouldBuyMaybeCount: 0,
        wouldBuyNoCount: 0,
        differentResponses: []
      })
    }

    const stats = feedbackStatsByEventId.get(eventId)
    stats.feedbackCount++

    const different = feedback.answers?.different?.trim()
    if (different) stats.differentResponses.push(different)

    if (feedback.answers?.wouldBuy === 'yes') stats.wouldBuyYesCount++
    else if (feedback.answers?.wouldBuy === 'maybe') stats.wouldBuyMaybeCount++
    else if (feedback.answers?.wouldBuy === 'no') stats.wouldBuyNoCount++
  }
  
  // Get UNION of all eventIds
  const allEventIds = new Set([
    ...attendanceStatsByEventId.keys(),
    ...feedbackStatsByEventId.keys()
  ])
  
  // Build final event digests
  const eventDigests = []
  for (const eventId of allEventIds) {
    const attendanceStats = attendanceStatsByEventId.get(eventId)
    const feedbackStats = feedbackStatsByEventId.get(eventId)
    
    const totalCheckIns = attendanceStats?.totalCheckIns || 0
    const feedbackCount = feedbackStats?.feedbackCount || 0
    
    const digest = {
      eventId,
      feedbackCount,
      totalCheckIns,
      uniqueCheckInBuyers: attendanceStats?.uniqueCheckInBuyers.size || 0,
      wouldBuyYesCount: feedbackStats?.wouldBuyYesCount || 0,
      wouldBuyMaybeCount: feedbackStats?.wouldBuyMaybeCount || 0,
      wouldBuyNoCount: feedbackStats?.wouldBuyNoCount || 0,
      differentResponses: feedbackStats?.differentResponses || [],
      occurrenceIds: attendanceStats ? Array.from(attendanceStats.occurrenceIds) : [],
      feedbackRate: totalCheckIns === 0 ? 0 : feedbackCount / totalCheckIns
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
  
  // Sort by totalCheckIns desc, then feedbackCount desc
  eventDigests.sort((a, b) => {
    if (b.totalCheckIns !== a.totalCheckIns) {
      return b.totalCheckIns - a.totalCheckIns
    }
    return b.feedbackCount - a.feedbackCount
  })
  
  return eventDigests
}

// Run the aggregation
console.log('=== Weekly Feedback Digest Example ===\n')
console.log(`Sample Data:`)
console.log(`  - ${sampleFeedback.length} feedback submissions`)
console.log(`  - ${sampleAttendance.length} attendance records`)
console.log(`  - ${sampleEvents.size} event documents`)
console.log()

const eventDigests = aggregateFeedbackAndAttendance(sampleFeedback, sampleAttendance, sampleEvents)

console.log('Generated Digest:\n')
console.log(JSON.stringify({
  windowStartIso: '2025-12-29T08:00:00.000Z',
  windowEndIso: '2026-01-05T08:00:00.000Z',
  generatedAtIso: new Date().toISOString(),
  eventDigests
}, null, 2))

console.log('\n=== Summary ===')
console.log(`Total events: ${eventDigests.length}`)
eventDigests.forEach((digest, i) => {
  console.log(`\nEvent ${i + 1}: ${digest.eventId}`)
  console.log(`  Address: ${digest.eventAddress || 'N/A'}`)
  console.log(`  Total Check-ins: ${digest.totalCheckIns}`)
  console.log(`  Feedback Count: ${digest.feedbackCount}`)
  console.log(`  Unique Check-in Buyers: ${digest.uniqueCheckInBuyers}`)
  console.log(`  Would Buy: ${digest.wouldBuyYesCount} yes / ${digest.wouldBuyMaybeCount} maybe / ${digest.wouldBuyNoCount} no`)
  console.log(`  Feedback Rate: ${(digest.feedbackRate * 100).toFixed(1)}%`)
  console.log(`  Occurrences: ${digest.occurrenceIds.length > 0 ? digest.occurrenceIds.join(', ') : 'N/A'}`)
  console.log(`  Listing URL: ${digest.listingUrl || 'N/A'}`)
})
