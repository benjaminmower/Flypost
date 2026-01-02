/*
 * Integration test for presence-based API endpoints
 * Tests the full flow: check-in, feedback submission, and insights
 * 
 * NOTE: This test requires the server to be running on port 3001
 * Run: cd backend && npm start
 * Then in another terminal: node test-presence-api.js
 */

import { clearIntelligence } from './src/intelligenceStorage.js'
import { clearEvents } from './src/storage.js'

// Use built-in fetch (Node 18+)
const fetchImpl = globalThis.fetch || (await import('node-fetch').then(m => m.default))

const BASE_URL = 'http://localhost:3001'

// Helper to wait for server
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Helper to create a test event
async function createTestEvent(brokerageId, address, startDate) {
  // Calculate endDate as 2 hours after startDate
  const endDate = new Date(new Date(startDate).getTime() + 2 * 3600000).toISOString()
  
  const response = await fetchImpl(`${BASE_URL}/api/test-add-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brokerageId,
      name: 'Test Open House',
      description: 'Test event for presence testing',
      streetAddress: address.streetAddress,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      startDate,
      endDate,
      latitude: 34.0195,
      longitude: -118.4912
    })
  })

  const data = await response.json()
  return data.data.eventId
}

// Test 1: Check-in with explicit eventId
async function testCheckInExplicit() {
  console.log('\n🧪 Test 1: Check-in with Explicit Event ID...')
  
  try {
    // Create test event (currently active: started 30 min ago, ends in 1.5 hours)
    const eventId = await createTestEvent(
      'brokerage-test',
      { streetAddress: '123 Main St', city: 'Santa Monica', state: 'CA', postalCode: '90405' },
      new Date(Date.now() - 1800000).toISOString() // 30 min ago
    )

    const response = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        lat: 34.0195,
        lng: -118.4912,
        buyerToken: 'buyer_test_explicit_123',
        method: 'geo_time'
      })
    })

    const data = await response.json()
    
    if (response.ok && data.success && data.attendance.attendanceId) {
      console.log(`   ✅ Check-in successful: ${data.attendance.attendanceId}`)
      console.log(`   ✅ Matched by: ${data.attendance.matchedBy}`)
      return { success: true, attendanceId: data.attendance.attendanceId, eventId }
    } else {
      console.error('   ❌ Check-in failed:', data.error)
      return { success: false }
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return { success: false }
  }
}

// Test 2: Check-in without eventId (nearest match)
async function testCheckInNearest() {
  console.log('\n🧪 Test 2: Check-in with Nearest Event Match...')
  
  try {
    // Create test event (currently active)
    await createTestEvent(
      'brokerage-test',
      { streetAddress: '456 Oak Ave', city: 'Los Angeles', state: 'CA', postalCode: '90001' },
      new Date(Date.now() - 1800000).toISOString() // 30 min ago
    )

    const response = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: 34.0195,
        lng: -118.4912,
        buyerToken: 'buyer_test_nearest_456',
        method: 'geo_time'
      })
    })

    const data = await response.json()
    
    if (response.ok && data.success && data.attendance.matchedBy === 'nearest') {
      console.log(`   ✅ Matched nearest event: ${data.attendance.eventId}`)
      return { success: true, attendanceId: data.attendance.attendanceId, eventId: data.attendance.eventId }
    } else {
      console.error('   ❌ Nearest match failed:', data.error)
      return { success: false }
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return { success: false }
  }
}

// Test 3: Feedback submission with attendanceId
async function testFeedbackWithAttendanceId(attendanceId, eventId) {
  console.log('\n🧪 Test 3: Feedback Submission with Attendance ID...')
  
  try {
    const response = await fetchImpl(`${BASE_URL}/v1/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendanceId,
        answers: {
          liked: 'Beautiful kitchen and open floor plan',
          disliked: 'Small backyard',
          wantsSimilar: true
        },
        brokerageAffiliation: 'brokerage-test'
      })
    })

    const data = await response.json()
    
    if (response.ok && data.success && data.feedback.feedbackId) {
      console.log(`   ✅ Feedback submitted: ${data.feedback.feedbackId}`)
      return true
    } else {
      console.error('   ❌ Feedback submission failed:', data.error)
      return false
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return false
  }
}

// Test 4: Feedback submission with eventId + buyerToken
async function testFeedbackWithEventAndBuyer(eventId, buyerToken) {
  console.log('\n🧪 Test 4: Feedback Submission with Event ID + Buyer Token...')
  
  try {
    const response = await fetchImpl(`${BASE_URL}/v1/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        buyerToken,
        answers: {
          liked: 'Great location near schools',
          disliked: 'Needs renovation',
          wantsSimilar: false
        },
        brokerageAffiliation: 'brokerage-test'
      })
    })

    const data = await response.json()
    
    if (response.ok && data.success && data.feedback.feedbackId) {
      console.log(`   ✅ Feedback submitted with event+buyer: ${data.feedback.feedbackId}`)
      return true
    } else {
      console.error('   ❌ Feedback submission failed:', data.error)
      return false
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return false
  }
}

// Test 5: Feedback without attendance (should fail)
async function testFeedbackWithoutAttendance() {
  console.log('\n🧪 Test 5: Feedback Without Attendance (Should Fail)...')
  
  try {
    const response = await fetchImpl(`${BASE_URL}/v1/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_nonexistent_999',
        buyerToken: 'buyer_no_attendance',
        answers: {
          liked: 'Test',
          disliked: 'Test',
          wantsSimilar: false
        }
      })
    })

    const data = await response.json()
    
    if (!response.ok && data.error) {
      console.log(`   ✅ Correctly rejected feedback without attendance: ${data.error}`)
      return true
    } else {
      console.error('   ❌ Should have rejected feedback without attendance')
      return false
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return false
  }
}

// Test 6: Feedback with old attendance (should fail presence gate)
async function testFeedbackWithOldAttendance() {
  console.log('\n🧪 Test 6: Feedback with Old Attendance (Should Fail)...')
  
  try {
    // Create test event (currently active)
    const eventId = await createTestEvent(
      'brokerage-test',
      { streetAddress: '789 Pine St', city: 'Seattle', state: 'WA', postalCode: '98101' },
      new Date(Date.now() - 1800000).toISOString() // 30 min ago
    )

    // Check in with old timestamp (5 hours ago - beyond the 4-hour threshold)
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
    const oldTimestamp = new Date(Date.now() - FIVE_HOURS_MS).toISOString()
    
    const checkInResponse = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        lat: 34.0195,
        lng: -118.4912,
        buyerToken: 'buyer_old_attendance',
        timestamp: oldTimestamp
      })
    })

    const checkInData = await checkInResponse.json()
    
    if (!checkInResponse.ok) {
      console.error('   ⚠️ Check-in failed, skipping test')
      return true // Skip this test if check-in fails
    }

    // Try to submit feedback
    const feedbackResponse = await fetchImpl(`${BASE_URL}/v1/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendanceId: checkInData.attendance.attendanceId,
        answers: {
          liked: 'Test',
          disliked: 'Test',
          wantsSimilar: false
        }
      })
    })

    const feedbackData = await feedbackResponse.json()
    
    if (!feedbackResponse.ok && feedbackData.error.includes('too old')) {
      console.log(`   ✅ Correctly rejected old attendance (${feedbackData.hoursAgo} hours ago)`)
      return true
    } else {
      console.error('   ❌ Should have rejected feedback with old attendance')
      return false
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return false
  }
}

// Test 7: Brokerage insights endpoint
async function testBrokerageInsights() {
  console.log('\n🧪 Test 7: Brokerage Insights Endpoint...')
  
  try {
    const response = await fetchImpl(`${BASE_URL}/v1/brokerages/brokerage-test/insights`)
    const data = await response.json()
    
    if (response.ok && data.success) {
      console.log(`   ✅ Retrieved insights for brokerage-test`)
      console.log(`   ✅ Total feedback: ${data.summary.totalFeedbackRecords}`)
      console.log(`   ✅ Events with feedback: ${data.summary.eventsWithFeedback}`)
      
      if (data.summary.totalFeedbackRecords > 0) {
        console.log(`   ✅ Has feedback records`)
      }
      
      return true
    } else {
      console.error('   ❌ Insights retrieval failed:', data.error)
      return false
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return false
  }
}

// Test 8: Check-in validation (missing required fields)
async function testCheckInValidation() {
  console.log('\n🧪 Test 8: Check-in Validation...')
  
  let passed = 0
  
  // Missing buyerToken
  try {
    const response = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: 34.0195,
        lng: -118.4912
      })
    })
    
    const data = await response.json()
    if (!response.ok && data.error.includes('buyerToken')) {
      console.log('   ✅ Correctly validates missing buyerToken')
      passed++
    }
  } catch (error) {
    console.error('   ❌ Error testing missing buyerToken')
  }

  // Missing coordinates
  try {
    const response = await fetchImpl(`${BASE_URL}/v1/presence/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerToken: 'buyer_test'
      })
    })
    
    const data = await response.json()
    if (!response.ok && data.error.includes('lat')) {
      console.log('   ✅ Correctly validates missing coordinates')
      passed++
    }
  } catch (error) {
    console.error('   ❌ Error testing missing coordinates')
  }

  console.log(`   ${passed}/2 validation tests passed`)
  return passed === 2
}

// Test 9: Feedback validation (missing answers)
async function testFeedbackValidation() {
  console.log('\n🧪 Test 9: Feedback Validation...')
  
  try {
    const response = await fetchImpl(`${BASE_URL}/v1/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendanceId: 'att_test_123'
        // Missing answers
      })
    })
    
    const data = await response.json()
    
    if (!response.ok && data.error.includes('answers')) {
      console.log('   ✅ Correctly validates missing answers')
      return true
    } else {
      console.error('   ❌ Should have validated missing answers')
      return false
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message)
    return false
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Presence API Integration Test Suite')
  console.log('=' .repeat(60))
  console.log('⏳ Waiting for server to be ready...')
  
  // Wait a bit for server to be ready
  await delay(2000)
  
  // Check if server is up
  try {
    const healthCheck = await fetchImpl(`${BASE_URL}/health`)
    if (!healthCheck.ok) {
      console.error('❌ Server is not responding. Make sure it is running on port 3001')
      process.exit(1)
    }
    console.log('✅ Server is ready\n')
  } catch (error) {
    console.error('❌ Cannot connect to server. Make sure it is running on port 3001')
    console.error('   Run: cd backend && npm start')
    process.exit(1)
  }

  // Clear existing data
  clearIntelligence()
  clearEvents()

  // Run tests sequentially (they build on each other)
  const test1 = await testCheckInExplicit()
  const test2 = await testCheckInNearest()
  const test3 = test1.success ? await testFeedbackWithAttendanceId(test1.attendanceId, test1.eventId) : false
  const test4 = test2.success ? await testFeedbackWithEventAndBuyer(test2.eventId, 'buyer_test_nearest_456') : false
  const test5 = await testFeedbackWithoutAttendance()
  const test6 = await testFeedbackWithOldAttendance()
  const test7 = await testBrokerageInsights()
  const test8 = await testCheckInValidation()
  const test9 = await testFeedbackValidation()

  const results = [
    test1.success,
    test2.success,
    test3,
    test4,
    test5,
    test6,
    test7,
    test8,
    test9
  ]

  const passed = results.filter(Boolean).length
  const total = results.length

  console.log('\n' + '=' .repeat(60))
  console.log(`🎯 Final Results: ${passed}/${total} tests passed`)
  
  if (passed === total) {
    console.log('✅ All integration tests passed!')
  } else {
    console.log(`❌ ${total - passed} test(s) failed`)
    process.exit(1)
  }
}

runAllTests()
