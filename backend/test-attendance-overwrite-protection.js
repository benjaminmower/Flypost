/*
 * Test: Attendance-Based Overwrite Protection
 * Validates that events with attendance are never overwritten when a matching identity is ingested
 */

import { storeEvent, clearEvents, findEventByIdentity, shouldMergeEvent } from './src/storage.js'
import { eventHasAttendance, isFirestoreEnabled } from './src/firestoreClient.js'

console.log('🧪 Testing Attendance-Based Overwrite Protection\n')

// Helper to create a test event
function createTestEvent(eventId, identity, options = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    flypost: {
      eventId: eventId,
      eventIdentity: identity,
      category: 'open-houses',
      realTimeData: true,
      crawlable: true,
      queryable: true,
      submissionTimestamp: new Date().toISOString(),
      ...options.flypost
    },
    name: options.name || 'Test Open House',
    description: 'Test event for overwrite protection',
    startDate: options.startDate || new Date(Date.now() + 86400000).toISOString(),
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
      }
    },
    organizer: {
      '@type': 'Person',
      name: 'Jane Smith',
      email: 'jane@example.com'
    }
  }
}

// Test setup
function setupTest() {
  clearEvents()
}

// Test 1: Pure function - shouldMergeEvent with no existing event
function testShouldMergeNoExisting() {
  console.log('Test 1: shouldMergeEvent returns false when no existing event')
  
  const result = shouldMergeEvent(null, false)
  
  if (result === false) {
    console.log('✅ Correctly returns false when no existing event\n')
    return true
  } else {
    console.error('❌ Should return false when no existing event\n')
    return false
  }
}

// Test 2: Pure function - shouldMergeEvent with attendance
function testShouldMergeWithAttendance() {
  console.log('Test 2: shouldMergeEvent returns false when attendance exists')
  
  const existingEvent = {
    flypost: { eventId: 'evt_test_001', eventIdentity: 'test-identity' }
  }
  
  const result = shouldMergeEvent(existingEvent, true)
  
  if (result === false) {
    console.log('✅ Correctly returns false when attendance exists (overwrite protection)\n')
    return true
  } else {
    console.error('❌ Should return false when attendance exists\n')
    return false
  }
}

// Test 3: Pure function - shouldMergeEvent without attendance
function testShouldMergeWithoutAttendance() {
  console.log('Test 3: shouldMergeEvent returns true when no attendance')
  
  const existingEvent = {
    flypost: { eventId: 'evt_test_002', eventIdentity: 'test-identity-2' }
  }
  
  const result = shouldMergeEvent(existingEvent, false)
  
  if (result === true) {
    console.log('✅ Correctly returns true when no attendance (safe to merge)\n')
    return true
  } else {
    console.error('❌ Should return true when no attendance\n')
    return false
  }
}

// Test 4: eventHasAttendance returns false when Firestore is disabled
async function testAttendanceCheckWhenFirestoreDisabled() {
  console.log('Test 4: eventHasAttendance returns false when Firestore is disabled')
  
  // Save original env vars
  const originalProject = process.env.GOOGLE_CLOUD_PROJECT
  const originalGCloud = process.env.GCLOUD_PROJECT
  const originalEmulator = process.env.FIRESTORE_EMULATOR_HOST
  
  try {
    // Disable Firestore
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GCLOUD_PROJECT
    delete process.env.FIRESTORE_EMULATOR_HOST
    
    const hasAttendance = await eventHasAttendance('test-event-id')
    
    if (hasAttendance === false) {
      console.log('✅ eventHasAttendance correctly returns false when Firestore disabled\n')
      return true
    } else {
      console.error('❌ eventHasAttendance should return false when Firestore disabled\n')
      return false
    }
  } finally {
    // Restore env vars
    if (originalProject) process.env.GOOGLE_CLOUD_PROJECT = originalProject
    if (originalGCloud) process.env.GCLOUD_PROJECT = originalGCloud
    if (originalEmulator) process.env.FIRESTORE_EMULATOR_HOST = originalEmulator
  }
}

// Test 5: Integration - storeEvent reuses eventId when no attendance exists (current behavior)
async function testMergeWhenNoAttendance() {
  console.log('Test 5: Integration - storeEvent reuses eventId when no attendance exists (Firestore disabled)')
  setupTest()
  
  const identity = 'test-identity-merge'
  const originalEventId = 'evt_original_001'
  
  // Create and store original event
  const originalEvent = createTestEvent(originalEventId, identity, {
    flypost: { listPrice: 1000000 }
  })
  
  const stored1 = await storeEvent(originalEvent)
  console.log(`   Stored original event: ${stored1.flypost.eventId}`)
  
  // Now ingest same identity again (simulating re-scrape)
  const newEventId = 'evt_new_002'
  const newEvent = createTestEvent(newEventId, identity, {
    name: 'Updated Open House Name'
  })
  
  const stored2 = await storeEvent(newEvent)
  console.log(`   Stored updated event: ${stored2.flypost.eventId}`)
  
  // When Firestore is disabled, eventHasAttendance returns false
  // So merge should happen
  if (stored2.flypost.eventId === originalEventId) {
    console.log('✅ Event ID correctly reused when Firestore disabled (no attendance = merge)')
    console.log(`   Original ID: ${originalEventId}`)
    console.log(`   Reused ID: ${stored2.flypost.eventId}`)
    console.log(`   Update count: ${stored2.flypost.updateCount}\n`)
    return true
  } else {
    console.error('❌ Event ID should be reused when no attendance exists')
    console.error(`   Expected: ${originalEventId}`)
    console.error(`   Got: ${stored2.flypost.eventId}\n`)
    return false
  }
}

// Test 6-8: Note about Firestore-enabled scenarios
// These tests would require Firestore emulator or proper mocking framework
// The pure shouldMergeEvent function tests above validate the core logic

// Run all tests
async function runTests() {
  const results = []
  
  console.log('📋 PART 1: Unit Tests (Pure Functions)\n')
  console.log('='.repeat(60))
  
  // Test pure decision function
  results.push(testShouldMergeNoExisting())
  results.push(testShouldMergeWithAttendance())
  results.push(testShouldMergeWithoutAttendance())
  
  console.log('📋 PART 2: Integration Tests (Firestore Disabled)\n')
  console.log('='.repeat(60))
  
  results.push(await testAttendanceCheckWhenFirestoreDisabled())
  results.push(await testMergeWhenNoAttendance())
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('TEST SUMMARY')
  console.log('='.repeat(60))
  
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log(`\nCore Logic Tests: ${passed}/${total} passed`)
  console.log('\n📝 Note: Full integration with Firestore requires emulator or production environment.')
  console.log('   The unit tests above validate the core decision logic is correct.')
  console.log('   When Firestore is enabled with attendance data, eventHasAttendance will return true')
  console.log('   and shouldMergeEvent will prevent the overwrite as designed.\n')
  
  if (passed === total) {
    console.log('✅ ALL TESTS PASSED')
    console.log('='.repeat(60))
    process.exit(0)
  } else {
    console.log('❌ SOME TESTS FAILED')
    console.log('='.repeat(60))
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('❌ Test execution failed:', err)
  process.exit(1)
})
