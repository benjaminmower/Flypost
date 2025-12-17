/*
 * Test script for /v1/events/upsert endpoint
 * Tests the canonical machine ingestion workflow
 */

import fetch from 'node-fetch'

const BASE_URL = 'http://localhost:3001'

// Helper: wait for server to be ready
async function waitForServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`)
      if (response.ok) {
        console.log('✅ Server is ready')
        return true
      }
    } catch (err) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Server did not become ready in time')
}

/**
 * Helper: create a minimal valid event for testing
 * @param {object} overrides - Optional properties to override in the event
 * @returns {object} A valid Schema.org Event object
 */
function createTestEvent(overrides = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    flypost: {
      category: 'open-houses',
      ...(overrides.flypost || {})
    },
    name: 'Test Open House',
    description: 'Beautiful 3BR/2BA home with modern updates',
    startDate: '2025-01-20T14:00:00.000Z',
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
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    organizer: {
      '@type': 'Person',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234'
    },
    ...overrides
  }
}

// Test 1: Insert path - verify new event creation
async function testInsertPath() {
  console.log('\n🧪 Test 1: Insert Path - New Event Creation')
  
  const event = createTestEvent()
  const source = {
    sourceType: 'mls',
    sourceId: 'MLS-12345'
  }
  
  const response = await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, source })
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    console.error('❌ Failed:', result)
    return false
  }
  
  // Verify response structure
  if (result.success !== true) {
    console.error('❌ Expected success=true, got:', result.success)
    return false
  }
  
  if (result.operation !== 'insert') {
    console.error('❌ Expected operation=insert, got:', result.operation)
    return false
  }
  
  if (!result.data.eventId) {
    console.error('❌ Missing eventId in response')
    return false
  }
  
  if (!result.data.eventIdentity) {
    console.error('❌ Missing eventIdentity in response')
    return false
  }
  
  if (result.data.updateCount !== 0) {
    console.error('❌ Expected updateCount=0 for insert, got:', result.data.updateCount)
    return false
  }
  
  // Verify source provenance
  if (!result.data.event.flypost.sources || result.data.event.flypost.sources.length === 0) {
    console.error('❌ Missing sources array in stored event')
    return false
  }
  
  const storedSource = result.data.event.flypost.sources[0]
  if (storedSource.sourceType !== 'mls' || storedSource.sourceId !== 'MLS-12345') {
    console.error('❌ Source not stored correctly:', storedSource)
    return false
  }
  
  console.log('✅ Insert path test passed')
  console.log(`   - eventId: ${result.data.eventId}`)
  console.log(`   - eventIdentity: ${result.data.eventIdentity}`)
  console.log(`   - updateCount: ${result.data.updateCount}`)
  console.log(`   - sources: ${JSON.stringify(result.data.event.flypost.sources)}`)
  
  return { success: true, eventId: result.data.eventId, eventIdentity: result.data.eventIdentity }
}

// Test 2: Update path - verify event update preserves eventId and increments updateCount
async function testUpdatePath() {
  console.log('\n🧪 Test 2: Update Path - Event Update')
  
  // First, create an event
  const event = createTestEvent({
    location: {
      '@type': 'Place',
      name: '456 Oak Avenue',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '456 Oak Avenue',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001',
        addressCountry: 'US'
      }
    }
  })
  
  const source1 = {
    sourceType: 'calendar',
    sourceId: 'CAL-789'
  }
  
  const response1 = await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, source: source1 })
  })
  
  const result1 = await response1.json()
  
  if (!response1.ok || result1.operation !== 'insert') {
    console.error('❌ Failed to create initial event:', result1)
    return false
  }
  
  const originalEventId = result1.data.eventId
  const originalEventIdentity = result1.data.eventIdentity
  
  console.log(`   ℹ️  Created event: ${originalEventId} with identity ${originalEventIdentity}`)
  
  // Now update the same event (same location/time = same identity)
  const updatedEvent = createTestEvent({
    name: 'Updated Open House',
    description: 'Now with updated description!',
    location: {
      '@type': 'Place',
      name: '456 Oak Avenue',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '456 Oak Avenue',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001',
        addressCountry: 'US'
      }
    }
  })
  
  const source2 = {
    sourceType: 'scraper',
    sourceId: 'SCRAPE-101'
  }
  
  const response2 = await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: updatedEvent, source: source2 })
  })
  
  const result2 = await response2.json()
  
  if (!response2.ok) {
    console.error('❌ Failed to update event:', result2)
    return false
  }
  
  // Verify it's an update operation
  if (result2.operation !== 'update') {
    console.error('❌ Expected operation=update, got:', result2.operation)
    return false
  }
  
  // Verify eventId is preserved
  if (result2.data.eventId !== originalEventId) {
    console.error(`❌ EventId changed: ${originalEventId} -> ${result2.data.eventId}`)
    return false
  }
  
  // Verify updateCount incremented
  if (result2.data.updateCount !== 1) {
    console.error('❌ Expected updateCount=1, got:', result2.data.updateCount)
    return false
  }
  
  // Verify sources are merged
  const sources = result2.data.event.flypost.sources
  if (!sources || sources.length !== 2) {
    console.error('❌ Expected 2 sources, got:', sources)
    return false
  }
  
  const sourceTypes = sources.map(s => s.sourceType).sort()
  if (sourceTypes[0] !== 'calendar' || sourceTypes[1] !== 'scraper') {
    console.error('❌ Sources not merged correctly:', sourceTypes)
    return false
  }
  
  console.log('✅ Update path test passed')
  console.log(`   - eventId preserved: ${result2.data.eventId}`)
  console.log(`   - updateCount: ${result2.data.updateCount}`)
  console.log(`   - sources count: ${sources.length}`)
  
  return true
}

// Test 3: North Star enforcement - verify forbidden fields are stripped
async function testNorthStarEnforcement() {
  console.log('\n🧪 Test 3: North Star Enforcement - Strip Forbidden Fields')
  
  const event = createTestEvent({
    // Add forbidden Layer 2 fields
    attendance: [{ buyerToken: 'token123' }],
    buyerToken: 'token456',
    presenceProof: { method: 'geo_time' },
    feedback: { liked: 'test' },
    sentiment: 'positive',
    insights: { score: 0.9 },
    brokerageAffiliation: 'broker123',
    intelligenceScore: 42
  })
  
  const response = await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event })
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    console.error('❌ Failed:', result)
    return false
  }
  
  // Verify forbidden fields are NOT in stored event
  const storedEvent = result.data.event
  const forbiddenFields = [
    'attendance',
    'buyerToken',
    'presenceProof',
    'feedback',
    'sentiment',
    'insights',
    'brokerageAffiliation',
    'intelligenceScore'
  ]
  
  for (const field of forbiddenFields) {
    if (storedEvent.hasOwnProperty(field)) {
      console.error(`❌ Forbidden field "${field}" was not stripped:`, storedEvent[field])
      return false
    }
  }
  
  console.log('✅ North Star enforcement test passed')
  console.log('   - All forbidden fields stripped')
  
  return true
}

// Test 4: Validation - verify AJV validation still works
async function testValidation() {
  console.log('\n🧪 Test 4: Validation - Invalid Event Rejected')
  
  const invalidEvent = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    // Missing required fields: flypost, name, description, startDate, location, organizer
  }
  
  const response = await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: invalidEvent })
  })
  
  const result = await response.json()
  
  if (response.ok) {
    console.error('❌ Expected validation failure, but request succeeded:', result)
    return false
  }
  
  if (!result.error || !result.error.includes('validation')) {
    console.error('❌ Expected validation error message, got:', result)
    return false
  }
  
  console.log('✅ Validation test passed')
  console.log('   - Invalid event rejected')
  
  return true
}

// Test 5: Source deduplication
async function testSourceDeduplication() {
  console.log('\n🧪 Test 5: Source Deduplication')
  
  const event = createTestEvent({
    location: {
      '@type': 'Place',
      name: '789 Pine Street',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '789 Pine Street',
        addressLocality: 'Beverly Hills',
        addressRegion: 'CA',
        postalCode: '90210',
        addressCountry: 'US'
      }
    }
  })
  
  const source = {
    sourceType: 'manual',
    sourceId: 'MANUAL-001'
  }
  
  // First upsert
  await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, source })
  })
  
  // Second upsert with same source
  const response2 = await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, source })
  })
  
  const result2 = await response2.json()
  
  if (!response2.ok) {
    console.error('❌ Failed:', result2)
    return false
  }
  
  // Verify only one source in array (deduped)
  const sources = result2.data.event.flypost.sources
  if (sources.length !== 1) {
    console.error('❌ Expected 1 deduplicated source, got:', sources.length)
    return false
  }
  
  if (sources[0].sourceType !== 'manual' || sources[0].sourceId !== 'MANUAL-001') {
    console.error('❌ Source not correct:', sources[0])
    return false
  }
  
  console.log('✅ Source deduplication test passed')
  console.log('   - Duplicate sources deduped correctly')
  
  return true
}

// Main test runner
async function runTests() {
  console.log('🧪 Starting upsert endpoint tests...\n')
  
  try {
    // Wait for server
    await waitForServer()
    
    // Run tests
    const results = {
      insertPath: await testInsertPath(),
      updatePath: await testUpdatePath(),
      northStar: await testNorthStarEnforcement(),
      validation: await testValidation(),
      sourceDedup: await testSourceDeduplication()
    }
    
    // Summary
    console.log('\n' + '='.repeat(50))
    console.log('📊 Test Results Summary:')
    console.log('='.repeat(50))
    
    const passed = Object.values(results).filter(r => r === true || r?.success === true).length
    const total = Object.keys(results).length
    
    for (const [test, result] of Object.entries(results)) {
      const status = result === true || result?.success === true ? '✅ PASS' : '❌ FAIL'
      console.log(`${status} - ${test}`)
    }
    
    console.log('='.repeat(50))
    console.log(`${passed}/${total} tests passed`)
    
    if (passed === total) {
      console.log('✅ All tests passed!')
      process.exit(0)
    } else {
      console.log('❌ Some tests failed')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test suite error:', error)
    process.exit(1)
  }
}

runTests()
