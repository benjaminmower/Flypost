/*
 * Test script for post-visit intelligence ledger (Attendance + Feedback)
 * Tests the new attendance tracking and feedback collection system
 */

import { 
  storeAttendance, 
  storeFeedback,
  findAttendanceById,
  findAttendanceByEventAndBuyer,
  getFeedbackByBrokerage,
  clearIntelligence,
  getIntelligenceStats
} from './src/intelligenceStorage.js'

// Test 1: Store and retrieve attendance
async function testStoreAttendance() {
  console.log('\n🧪 Test 1: Store and Retrieve Attendance...')
  
  clearIntelligence()
  
  const attendanceData = {
    eventId: 'evt_test_123',
    buyerToken: 'buyer_token_abc',
    checkInTime: '2025-01-15T14:30:00Z',
    dwellBand: '10-20m',
    presenceProof: {
      method: 'geo_time',
      lat: 34.0195,
      lng: -118.4912,
      matchedBy: 'explicit'
    }
  }

  const stored = await storeAttendance(attendanceData)
  
  if (!stored.attendanceId) {
    console.error('   ❌ No attendanceId generated')
    return false
  }

  console.log(`   ✅ Stored attendance: ${stored.attendanceId}`)
  
  // Retrieve it
  const retrieved = await findAttendanceById(stored.attendanceId)
  
  if (retrieved && retrieved.eventId === attendanceData.eventId) {
    console.log(`   ✅ Retrieved attendance by ID`)
    return true
  } else {
    console.error('   ❌ Failed to retrieve attendance')
    return false
  }
}

// Test 2: Find attendance by event and buyer
async function testFindAttendanceByEventAndBuyer() {
  console.log('\n🧪 Test 2: Find Attendance by Event and Buyer...')
  
  clearIntelligence()
  
  const eventId = 'evt_test_456'
  const buyerToken = 'buyer_token_xyz'
  
  // Store multiple attendance records
  await storeAttendance({
    eventId,
    buyerToken,
    checkInTime: '2025-01-15T14:00:00Z',
    presenceProof: { method: 'geo_time', lat: 34.0195, lng: -118.4912, matchedBy: 'explicit' }
  })
  
  await storeAttendance({
    eventId,
    buyerToken,
    checkInTime: '2025-01-15T14:30:00Z',
    presenceProof: { method: 'qr', matchedBy: 'explicit' }
  })
  
  // Store one for different buyer
  await storeAttendance({
    eventId,
    buyerToken: 'buyer_token_different',
    checkInTime: '2025-01-15T14:15:00Z',
    presenceProof: { method: 'geo_time', lat: 34.0195, lng: -118.4912, matchedBy: 'explicit' }
  })

  const records = await findAttendanceByEventAndBuyer(eventId, buyerToken)
  
  if (records.length === 2) {
    console.log(`   ✅ Found ${records.length} attendance records for buyer`)
    return true
  } else {
    console.error(`   ❌ Expected 2 records, found ${records.length}`)
    return false
  }
}

// Test 3: Store and retrieve feedback
async function testStoreFeedback() {
  console.log('\n🧪 Test 3: Store and Retrieve Feedback...')
  
  clearIntelligence()
  
  // First create attendance
  const attendance = await storeAttendance({
    eventId: 'evt_test_789',
    buyerToken: 'buyer_token_feedback',
    checkInTime: new Date().toISOString(),
    presenceProof: { method: 'geo_time', lat: 34.0195, lng: -118.4912, matchedBy: 'explicit' }
  })

  const feedbackData = {
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Beautiful kitchen and great location',
      disliked: 'Small backyard',
      wantsSimilar: true
    },
    brokerageAffiliation: 'brokerage-abc'
  }

  const stored = await storeFeedback(feedbackData)
  
  if (!stored.feedbackId) {
    console.error('   ❌ No feedbackId generated')
    return false
  }

  console.log(`   ✅ Stored feedback: ${stored.feedbackId}`)
  
  // Verify structure
  if (stored.answers.liked && stored.answers.wantsSimilar === true) {
    console.log(`   ✅ Feedback structure correct`)
    return true
  } else {
    console.error('   ❌ Feedback structure incorrect')
    return false
  }
}

// Test 4: Get feedback by brokerage
async function testGetFeedbackByBrokerage() {
  console.log('\n🧪 Test 4: Get Feedback by Brokerage...')
  
  clearIntelligence()
  
  // Create attendance records
  const att1 = await storeAttendance({
    eventId: 'evt_test_111',
    buyerToken: 'buyer_1',
    checkInTime: new Date().toISOString(),
    presenceProof: { method: 'geo_time', lat: 34.0195, lng: -118.4912, matchedBy: 'explicit' }
  })
  
  const att2 = await storeAttendance({
    eventId: 'evt_test_222',
    buyerToken: 'buyer_2',
    checkInTime: new Date().toISOString(),
    presenceProof: { method: 'geo_time', lat: 34.0195, lng: -118.4912, matchedBy: 'explicit' }
  })

  // Store feedback with different brokerage affiliations
  await storeFeedback({
    attendanceId: att1.attendanceId,
    eventId: att1.eventId,
    answers: { liked: 'Great', disliked: 'Nothing', wantsSimilar: true },
    brokerageAffiliation: 'brokerage-abc'
  })
  
  await storeFeedback({
    attendanceId: att2.attendanceId,
    eventId: att2.eventId,
    answers: { liked: 'Nice', disliked: 'Too far', wantsSimilar: false },
    brokerageAffiliation: 'brokerage-abc'
  })
  
  await storeFeedback({
    attendanceId: att2.attendanceId,
    eventId: att2.eventId,
    answers: { liked: 'OK', disliked: 'Expensive', wantsSimilar: false },
    brokerageAffiliation: 'brokerage-xyz'
  })

  const abcFeedback = await getFeedbackByBrokerage('brokerage-abc')
  const xyzFeedback = await getFeedbackByBrokerage('brokerage-xyz')
  
  if (abcFeedback.length === 2 && xyzFeedback.length === 1) {
    console.log(`   ✅ Correctly filtered feedback by brokerage (abc: ${abcFeedback.length}, xyz: ${xyzFeedback.length})`)
    return true
  } else {
    console.error(`   ❌ Incorrect filtering (abc: ${abcFeedback.length}, xyz: ${xyzFeedback.length})`)
    return false
  }
}

// Test 5: Feedback requires attendance
async function testFeedbackRequiresAttendance() {
  console.log('\n🧪 Test 5: Feedback Requires Attendance (Conceptual)...')
  
  // This test verifies the data structure, not business logic
  // Business logic (presence gate) is tested in integration tests
  
  clearIntelligence()
  
  try {
    // Create feedback without attendance reference
    const feedback = await storeFeedback({
      attendanceId: 'att_nonexistent_123',
      eventId: 'evt_test_999',
      answers: { liked: 'Test', disliked: 'Test', wantsSimilar: false }
    })
    
    // Storage layer allows this (business logic enforcement is in API layer)
    if (feedback.feedbackId) {
      console.log(`   ✅ Storage layer accepts feedback (business logic enforced in API)`)
      return true
    }
  } catch (error) {
    console.error('   ❌ Unexpected error:', error.message)
    return false
  }
}

// Test 6: Presence proof structure
async function testPresenceProofStructure() {
  console.log('\n🧪 Test 6: Presence Proof Structure...')
  
  clearIntelligence()
  
  const testCases = [
    {
      method: 'geo_time',
      lat: 34.0195,
      lng: -118.4912,
      matchedBy: 'nearest'
    },
    {
      method: 'qr',
      matchedBy: 'explicit'
    },
    {
      method: 'geo_time_qr',
      lat: 34.0195,
      lng: -118.4912,
      matchedBy: 'explicit'
    }
  ]

  let passed = 0
  for (const proof of testCases) {
    const attendance = await storeAttendance({
      eventId: 'evt_test_proof',
      buyerToken: 'buyer_proof',
      checkInTime: new Date().toISOString(),
      presenceProof: proof
    })

    if (attendance.presenceProof.method === proof.method) {
      console.log(`   ✅ Stored presence proof with method: ${proof.method}`)
      passed++
    } else {
      console.error(`   ❌ Presence proof method mismatch`)
    }
  }

  console.log(`   ${passed}/${testCases.length} presence proofs stored correctly`)
  return passed === testCases.length
}

// Test 7: Dwell band tracking
async function testDwellBandTracking() {
  console.log('\n🧪 Test 7: Dwell Band Tracking...')
  
  clearIntelligence()
  
  const dwellBands = ['<10m', '10-20m', '20-40m', '40m+']
  
  let passed = 0
  for (const band of dwellBands) {
    const attendance = await storeAttendance({
      eventId: 'evt_test_dwell',
      buyerToken: `buyer_${band}`,
      checkInTime: new Date().toISOString(),
      dwellBand: band,
      presenceProof: { method: 'geo_time', lat: 34.0, lng: -118.5, matchedBy: 'explicit' }
    })

    if (attendance.dwellBand === band) {
      console.log(`   ✅ Stored dwell band: ${band}`)
      passed++
    } else {
      console.error(`   ❌ Dwell band mismatch: expected ${band}, got ${attendance.dwellBand}`)
    }
  }

  console.log(`   ${passed}/${dwellBands.length} dwell bands stored correctly`)
  return passed === dwellBands.length
}

// Test 8: Storage statistics
async function testStorageStatistics() {
  console.log('\n🧪 Test 8: Storage Statistics...')
  
  clearIntelligence()
  
  // Add some records
  await storeAttendance({
    eventId: 'evt_stats',
    buyerToken: 'buyer_stats_1',
    checkInTime: new Date().toISOString(),
    presenceProof: { method: 'geo_time', lat: 34.0, lng: -118.5, matchedBy: 'explicit' }
  })
  
  const att = await storeAttendance({
    eventId: 'evt_stats',
    buyerToken: 'buyer_stats_2',
    checkInTime: new Date().toISOString(),
    presenceProof: { method: 'geo_time', lat: 34.0, lng: -118.5, matchedBy: 'explicit' }
  })
  
  await storeFeedback({
    attendanceId: att.attendanceId,
    eventId: att.eventId,
    answers: { liked: 'Test', disliked: 'Test', wantsSimilar: false }
  })

  const stats = getIntelligenceStats()
  
  if (stats.attendanceRecords === 2 && stats.feedbackRecords === 1) {
    console.log(`   ✅ Statistics correct: ${stats.attendanceRecords} attendance, ${stats.feedbackRecords} feedback`)
    return true
  } else {
    console.error(`   ❌ Statistics incorrect: ${JSON.stringify(stats)}`)
    return false
  }
}

// Test 9: Buyer token pseudonymity
async function testBuyerTokenPseudonymity() {
  console.log('\n🧪 Test 9: Buyer Token Pseudonymity...')
  
  clearIntelligence()
  
  // Store attendance with opaque token
  const attendance = await storeAttendance({
    eventId: 'evt_privacy',
    buyerToken: 'opaque_token_no_pii_xyz789',
    checkInTime: new Date().toISOString(),
    presenceProof: { method: 'geo_time', lat: 34.0, lng: -118.5, matchedBy: 'explicit' }
  })

  // Verify no PII fields exist
  const hasPII = attendance.hasOwnProperty('email') || 
                 attendance.hasOwnProperty('name') || 
                 attendance.hasOwnProperty('phone')

  if (!hasPII && attendance.buyerToken.startsWith('opaque_token')) {
    console.log(`   ✅ Buyer token is opaque/pseudonymous`)
    return true
  } else {
    console.error('   ❌ Attendance record may contain PII')
    return false
  }
}

// Test 10: Clear intelligence functionality
async function testClearIntelligence() {
  console.log('\n🧪 Test 10: Clear Intelligence...')
  
  // Add some records
  const att = await storeAttendance({
    eventId: 'evt_clear',
    buyerToken: 'buyer_clear',
    checkInTime: new Date().toISOString(),
    presenceProof: { method: 'geo_time', lat: 34.0, lng: -118.5, matchedBy: 'explicit' }
  })
  
  await storeFeedback({
    attendanceId: att.attendanceId,
    eventId: att.eventId,
    answers: { liked: 'Test', disliked: 'Test', wantsSimilar: false }
  })

  const beforeStats = getIntelligenceStats()
  const cleared = clearIntelligence()
  const afterStats = getIntelligenceStats()

  if (beforeStats.attendanceRecords > 0 && 
      afterStats.attendanceRecords === 0 && 
      afterStats.feedbackRecords === 0) {
    console.log(`   ✅ Cleared ${cleared.attendanceCleared} attendance and ${cleared.feedbackCleared} feedback`)
    return true
  } else {
    console.error('   ❌ Clear operation failed')
    return false
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Intelligence Ledger Test Suite')
  console.log('=' .repeat(60))

  // Run tests sequentially to avoid race conditions
  const results = []
  results.push(await testStoreAttendance())
  results.push(await testFindAttendanceByEventAndBuyer())
  results.push(await testStoreFeedback())
  results.push(await testGetFeedbackByBrokerage())
  results.push(await testFeedbackRequiresAttendance())
  results.push(await testPresenceProofStructure())
  results.push(await testDwellBandTracking())
  results.push(await testStorageStatistics())
  results.push(await testBuyerTokenPseudonymity())
  results.push(await testClearIntelligence())

  const passed = results.filter(Boolean).length
  const total = results.length

  console.log('\n' + '=' .repeat(60))
  console.log(`🎯 Final Results: ${passed}/${total} tests passed`)
  
  if (passed === total) {
    console.log('✅ All tests passed!')
  } else {
    console.log(`❌ ${total - passed} test(s) failed`)
    process.exit(1)
  }
}

runAllTests()
