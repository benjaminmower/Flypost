/*
 * Test script for server authority over eventId
 * Verifies that client-supplied eventId is ignored on insert and preserved on update
 */

import { enrichEventMetadata, generateEventId } from './src/utils/eventEnrichment.js'
import { computeEventIdentity } from './src/utils/canonicalKey.js'

/**
 * Test 1: Client-supplied eventId is ignored on insert
 */
function testClientEventIdIgnoredOnInsert() {
  console.log('\n🧪 Test 1: Client-supplied eventId is ignored on insert')
  
  const clientSuppliedId = 'evt_clientsupplied_12345'
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Test Event',
    startDate: '2025-01-20T14:00:00.000Z',
    location: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '123 Main Street',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90405'
      }
    },
    flypost: {
      eventId: clientSuppliedId // Client trying to supply eventId
    }
  }
  
  // Simulate insert (isUpdate = false, no existingEventId)
  const enriched = enrichEventMetadata(event, {
    isUpdate: false,
    existingEventId: null
  })
  
  // Verify that the enriched event has a different eventId
  if (enriched.flypost.eventId !== clientSuppliedId) {
    console.log(`   ✅ Client-supplied eventId ignored: ${clientSuppliedId}`)
    console.log(`   ✅ Server generated eventId: ${enriched.flypost.eventId}`)
    return true
  } else {
    console.error(`   ❌ Client-supplied eventId was preserved: ${enriched.flypost.eventId}`)
    return false
  }
}

/**
 * Test 2: eventId is preserved on update
 */
function testEventIdPreservedOnUpdate() {
  console.log('\n🧪 Test 2: eventId is preserved on update')
  
  const existingId = 'evt_existing_67890'
  const clientSuppliedId = 'evt_clientsupplied_11111'
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Updated Event',
    startDate: '2025-01-20T14:00:00.000Z',
    location: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '123 Main Street',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90405'
      }
    },
    flypost: {
      eventId: clientSuppliedId // Client trying to change eventId
    }
  }
  
  // Simulate update (isUpdate = true, with existingEventId)
  const enriched = enrichEventMetadata(event, {
    isUpdate: true,
    existingEventId: existingId,
    updateCount: 1
  })
  
  // Verify that the enriched event preserves the existing eventId
  if (enriched.flypost.eventId === existingId) {
    console.log(`   ✅ Existing eventId preserved on update: ${existingId}`)
    console.log(`   ✅ Client-supplied eventId ignored: ${clientSuppliedId}`)
    return true
  } else {
    console.error(`   ❌ Existing eventId not preserved: ${enriched.flypost.eventId}`)
    return false
  }
}

/**
 * Test 3: generateEventId produces unique IDs
 */
function testGenerateEventIdUniqueness() {
  console.log('\n🧪 Test 3: generateEventId produces unique IDs')
  
  const ids = new Set()
  const iterations = 100
  
  for (let i = 0; i < iterations; i++) {
    const id = generateEventId()
    
    // Verify format: evt_<random>_<timestamp>
    if (!id.startsWith('evt_')) {
      console.error(`   ❌ Invalid ID format: ${id}`)
      return false
    }
    
    ids.add(id)
  }
  
  if (ids.size === iterations) {
    console.log(`   ✅ Generated ${iterations} unique eventIds`)
    return true
  } else {
    console.error(`   ❌ Only ${ids.size}/${iterations} unique IDs generated`)
    return false
  }
}

/**
 * Test 4: Multiple inserts with same identity get different eventIds
 */
function testMultipleInsertsDifferentEventIds() {
  console.log('\n🧪 Test 4: Multiple inserts with same identity get different eventIds')
  
  // Create two events with the same identity (same address + time window)
  const baseEvent = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Event 1',
    startDate: '2025-01-20T14:15:00.000Z', // Same hour window
    location: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '456 Oak Street',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001'
      }
    },
    flypost: {}
  }
  
  // Deep clone to avoid shared references
  const event1 = JSON.parse(JSON.stringify({ ...baseEvent, name: 'Event 1' }))
  const event2 = JSON.parse(JSON.stringify({ ...baseEvent, name: 'Event 2', startDate: '2025-01-20T14:30:00.000Z' })) // Same hour
  
  // Verify they have the same identity
  const identity1 = computeEventIdentity(event1)
  const identity2 = computeEventIdentity(event2)
  
  if (identity1 !== identity2) {
    console.error('   ❌ Test setup error: events should have same identity')
    console.error(`      Identity 1: ${identity1}`)
    console.error(`      Identity 2: ${identity2}`)
    return false
  }
  
  console.log(`   ℹ️  Both events have same identity: ${identity1}`)
  
  // Enrich both as new inserts (simulating what happens if someone submits same event twice)
  const enriched1 = enrichEventMetadata(event1, { isUpdate: false })
  const enriched2 = enrichEventMetadata(event2, { isUpdate: false })
  
  // Verify they got DIFFERENT eventIds
  if (enriched1.flypost.eventId !== enriched2.flypost.eventId) {
    console.log(`   ✅ Different eventIds generated:`)
    console.log(`      Event 1: ${enriched1.flypost.eventId}`)
    console.log(`      Event 2: ${enriched2.flypost.eventId}`)
    console.log('   ✅ Storage layer would upsert by identity, preserving first eventId')
    return true
  } else {
    console.error(`   ❌ Same eventId generated for both: ${enriched1.flypost.eventId}`)
    return false
  }
}

/**
 * Test 5: Update count increments correctly
 */
function testUpdateCountIncrement() {
  console.log('\n🧪 Test 5: Update count increments correctly')
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Test Event',
    startDate: '2025-01-20T14:00:00.000Z',
    location: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '789 Pine Avenue',
        addressLocality: 'Seattle',
        addressRegion: 'WA',
        postalCode: '98101'
      }
    },
    flypost: {}
  }
  
  // First insert
  const insert = enrichEventMetadata(event, {
    isUpdate: false,
    updateCount: 0
  })
  
  if (insert.flypost.updateCount !== 0) {
    console.error(`   ❌ Insert should have updateCount=0, got ${insert.flypost.updateCount}`)
    return false
  }
  
  console.log(`   ✅ Insert has updateCount=0`)
  
  // First update
  const update1 = enrichEventMetadata(event, {
    isUpdate: true,
    existingEventId: insert.flypost.eventId,
    updateCount: 1
  })
  
  if (update1.flypost.updateCount !== 1) {
    console.error(`   ❌ First update should have updateCount=1, got ${update1.flypost.updateCount}`)
    return false
  }
  
  console.log(`   ✅ First update has updateCount=1`)
  
  // Second update
  const update2 = enrichEventMetadata(event, {
    isUpdate: true,
    existingEventId: insert.flypost.eventId,
    updateCount: 2
  })
  
  if (update2.flypost.updateCount !== 2) {
    console.error(`   ❌ Second update should have updateCount=2, got ${update2.flypost.updateCount}`)
    return false
  }
  
  console.log(`   ✅ Second update has updateCount=2`)
  
  return true
}

/**
 * Test 6: eventIdentity is set correctly
 */
function testEventIdentitySet() {
  console.log('\n🧪 Test 6: eventIdentity is set correctly')
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Test Event',
    startDate: '2025-01-20T14:00:00.000Z',
    location: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '321 Elm Boulevard',
        addressLocality: 'Portland',
        addressRegion: 'OR',
        postalCode: '97201'
      }
    },
    flypost: {}
  }
  
  const enriched = enrichEventMetadata(event, { isUpdate: false })
  
  const expectedIdentity = computeEventIdentity(event)
  
  if (enriched.flypost.eventIdentity === expectedIdentity) {
    console.log(`   ✅ eventIdentity set correctly: ${enriched.flypost.eventIdentity}`)
    return true
  } else {
    console.error(`   ❌ eventIdentity mismatch`)
    console.error(`      Expected: ${expectedIdentity}`)
    console.error(`      Got: ${enriched.flypost.eventIdentity}`)
    return false
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Server Authority Over EventId Test Suite')
  console.log('=' .repeat(60))

  const results = [
    testClientEventIdIgnoredOnInsert(),
    testEventIdPreservedOnUpdate(),
    testGenerateEventIdUniqueness(),
    testMultipleInsertsDifferentEventIds(),
    testUpdateCountIncrement(),
    testEventIdentitySet()
  ]

  const passed = results.filter(Boolean).length
  const total = results.length

  console.log('\n' + '=' .repeat(60))
  console.log(`🎯 Final Results: ${passed}/${total} tests passed`)
  
  if (passed === total) {
    console.log('✅ All tests passed!')
    process.exit(0)
  } else {
    console.log(`❌ ${total - passed} test(s) failed`)
    process.exit(1)
  }
}

runAllTests()
