#!/usr/bin/env node
/**
 * Test script for Discovery V1 contract and runtime guardrails
 * Tests the Two-Layer North Star enforcement at runtime
 */

import { toDiscoveryEventV1, toDiscoveryEventsV1, computeEventIdentity, CONFIG } from './src/utils/discoveryMapper.js'
import { sanitizeDiscoveryResponse, _internal } from './src/utils/sanitizer.js'

console.log('🧪 Testing Discovery V1 Contract & Runtime Guardrails\n')
console.log('====================================================\n')

/**
 * Test 1: Discovery V1 mapping includes required fields
 */
function testDiscoveryV1Mapping() {
  console.log('Test 1: Discovery V1 Mapping - Required Fields')
  console.log('-----------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  const mockEvent = {
    id: 'evt_test_123',
    flypost: {
      eventId: 'evt_test_123',
      eventIdentity: 'test-identity-key',
      category: 'open_house',
      submissionTimestamp: '2025-01-01T00:00:00Z',
      updateCount: 0
    },
    name: 'Test Open House',
    description: 'A wonderful open house event', // Should be stripped
    url: 'https://www.zillow.com/homedetails/123-Main-St',
    startDate: '2025-01-15T10:00:00Z',
    endDate: '2025-01-15T14:00:00Z',
    location: {
      address: {
        streetAddress: '123 Main St',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001'
      },
      geo: {
        latitude: 34.0522,
        longitude: -118.2437
      }
    },
    hash: {
      algorithm: 'SHA-256',
      encoding: 'hex',
      value: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      canonicalVersion: 1
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(mockEvent)
  
  // Check required fields
  const checks = [
    { field: 'eventId', expected: 'evt_test_123', actual: discoveryEvent.eventId },
    { field: 'eventIdentity', expected: 'test-identity-key', actual: discoveryEvent.eventIdentity },
    { field: 'category', expected: 'open_house', actual: discoveryEvent.category },
    { field: 'startDate', expected: '2025-01-15T10:00:00Z', actual: discoveryEvent.startDate },
    { field: 'endDate', expected: '2025-01-15T14:00:00Z', actual: discoveryEvent.endDate },
    { field: 'name', expected: 'Test Open House', actual: discoveryEvent.name }
  ]
  
  for (const check of checks) {
    if (check.actual === check.expected) {
      console.log(`   ✅ ${check.field}: ${check.actual}`)
      passed++
    } else {
      console.log(`   ❌ ${check.field}: Expected ${check.expected}, got ${check.actual}`)
      failed++
    }
  }
  
  // Check NEW M2M fields
  
  // Check url field is present
  if (discoveryEvent.url === 'https://www.zillow.com/homedetails/123-Main-St') {
    console.log(`   ✅ url: ${discoveryEvent.url}`)
    passed++
  } else {
    console.log(`   ❌ url: Expected https://www.zillow.com/homedetails/123-Main-St, got ${discoveryEvent.url}`)
    failed++
  }
  
  // Check dataHash field is present
  if (discoveryEvent.dataHash === 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890') {
    console.log(`   ✅ dataHash: ${discoveryEvent.dataHash.substring(0, 16)}...`)
    passed++
  } else {
    console.log(`   ❌ dataHash: Missing or incorrect`)
    failed++
  }
  
  // Check description is ABSENT (hardened contract strips fluff)
  if (!('description' in discoveryEvent)) {
    console.log('   ✅ description: Correctly stripped (M2M hardening)')
    passed++
  } else {
    console.log(`   ❌ description: Should be stripped but found: ${discoveryEvent.description}`)
    failed++
  }
  
  // Check address structure
  if (discoveryEvent.address && discoveryEvent.address.streetAddress === '123 Main St') {
    console.log('   ✅ address.streetAddress: 123 Main St')
    passed++
  } else {
    console.log('   ❌ address.streetAddress missing or incorrect')
    failed++
  }
  
  // Check geo structure
  if (discoveryEvent.geo && discoveryEvent.geo.latitude === 34.0522) {
    console.log('   ✅ geo.latitude: 34.0522')
    passed++
  } else {
    console.log('   ❌ geo.latitude missing or incorrect')
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${checks.length + 5} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 2: URL and DataHash fields (M2M hardening)
 */
function testUrlAndDataHash() {
  console.log('Test 2: URL and DataHash Fields (M2M Contract)')
  console.log('------------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Test with url and hash
  const eventWithUrl = {
    flypost: {
      eventId: 'evt_test_456',
      category: 'open_house'
    },
    url: 'https://www.redfin.com/property/123',
    hash: {
      algorithm: 'SHA-256',
      encoding: 'hex',
      value: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      canonicalVersion: 1
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(eventWithUrl)
  
  // Check url is present
  if (discoveryEvent.url === 'https://www.redfin.com/property/123') {
    console.log('   ✅ URL field preserved correctly')
    passed++
  } else {
    console.log(`   ❌ URL field missing or incorrect: ${discoveryEvent.url}`)
    failed++
  }
  
  // Check dataHash is present
  if (discoveryEvent.dataHash === '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef') {
    console.log('   ✅ dataHash field mapped from hash.value')
    passed++
  } else {
    console.log(`   ❌ dataHash field missing or incorrect: ${discoveryEvent.dataHash}`)
    failed++
  }
  
  // Test without url (should not break)
  const eventWithoutUrl = {
    flypost: {
      eventId: 'evt_test_789',
      category: 'open_house'
    },
    description: 'This should be ignored'
  }
  
  const discoveryEventNoUrl = toDiscoveryEventV1(eventWithoutUrl)
  
  if (!('url' in discoveryEventNoUrl)) {
    console.log('   ✅ Missing URL handled gracefully (field absent)')
    passed++
  } else {
    console.log('   ❌ URL should not be present when not provided')
    failed++
  }
  
  // Test without hash (should not break)
  if (!('dataHash' in discoveryEventNoUrl)) {
    console.log('   ✅ Missing hash handled gracefully (field absent)')
    passed++
  } else {
    console.log('   ❌ dataHash should not be present when hash not provided')
    failed++
  }
  
  // Verify description is stripped even when present
  if (!('description' in discoveryEventNoUrl)) {
    console.log('   ✅ Description correctly stripped (M2M hardening)')
    passed++
  } else {
    console.log(`   ❌ Description should be stripped: ${discoveryEventNoUrl.description}`)
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of 5 checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 3: Forbidden keys detection
 */
function testForbiddenKeys() {
  console.log('Test 3: Forbidden Keys Detection')
  console.log('---------------------------------')
  
  let passed = 0
  let failed = 0
  
  const { isForbiddenKey } = _internal
  
  const forbiddenTests = [
    { key: 'attendance', shouldBeForbidden: true },
    { key: 'attendees', shouldBeForbidden: true },
    { key: 'buyerToken', shouldBeForbidden: true },
    { key: 'presenceProof', shouldBeForbidden: true },
    { key: 'feedback', shouldBeForbidden: true },
    { key: 'sentiment', shouldBeForbidden: true },
    { key: 'insights', shouldBeForbidden: true },
    { key: 'brokerageAffiliation', shouldBeForbidden: true },
    { key: 'intelligenceData', shouldBeForbidden: true },
    { key: 'intelligenceScore', shouldBeForbidden: true },
    { key: 'eventId', shouldBeForbidden: false },
    { key: 'name', shouldBeForbidden: false },
    { key: 'category', shouldBeForbidden: false }
  ]
  
  for (const test of forbiddenTests) {
    const result = isForbiddenKey(test.key)
    if (result === test.shouldBeForbidden) {
      console.log(`   ✅ ${test.key}: ${result ? 'Forbidden' : 'Allowed'} (as expected)`)
      passed++
    } else {
      console.log(`   ❌ ${test.key}: Expected ${test.shouldBeForbidden ? 'Forbidden' : 'Allowed'}, got ${result ? 'Forbidden' : 'Allowed'}`)
      failed++
    }
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${forbiddenTests.length} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 4: Sanitizer strips forbidden keys
 */
function testSanitizerStripping() {
  console.log('Test 4: Sanitizer Strips Forbidden Keys (Drift Protection)')
  console.log('-----------------------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Create a response with forbidden keys (simulating drift)
  const dirtyResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: [
      {
        eventId: 'evt_123',
        eventIdentity: 'key-123',
        name: 'Test Event',
        category: 'open_house',
        // Forbidden keys that should be stripped
        attendance: 50,
        feedback: 'Great event!',
        sentiment: 'positive',
        intelligenceScore: 0.95,
        // Nested forbidden keys
        details: {
          attendance: 30,
          buyerToken: 'secret-token'
        }
      }
    ]
  }
  
  const sanitized = sanitizeDiscoveryResponse(dirtyResponse)
  
  // Check that forbidden keys are removed
  const event = sanitized.events[0]
  
  const strippedChecks = [
    { key: 'attendance', present: 'attendance' in event },
    { key: 'feedback', present: 'feedback' in event },
    { key: 'sentiment', present: 'sentiment' in event },
    { key: 'intelligenceScore', present: 'intelligenceScore' in event }
  ]
  
  for (const check of strippedChecks) {
    if (!check.present) {
      console.log(`   ✅ ${check.key} stripped successfully`)
      passed++
    } else {
      console.log(`   ❌ ${check.key} still present in response`)
      failed++
    }
  }
  
  // Check nested keys stripped
  if (!('attendance' in event.details)) {
    console.log('   ✅ Nested attendance stripped')
    passed++
  } else {
    console.log('   ❌ Nested attendance still present')
    failed++
  }
  
  if (!('buyerToken' in event.details)) {
    console.log('   ✅ Nested buyerToken stripped')
    passed++
  } else {
    console.log('   ❌ Nested buyerToken still present')
    failed++
  }
  
  // Check that allowed keys remain
  const allowedChecks = [
    { key: 'eventId', present: 'eventId' in event, value: event.eventId },
    { key: 'name', present: 'name' in event, value: event.name },
    { key: 'category', present: 'category' in event, value: event.category }
  ]
  
  for (const check of allowedChecks) {
    if (check.present) {
      console.log(`   ✅ ${check.key} preserved: ${check.value}`)
      passed++
    } else {
      console.log(`   ❌ ${check.key} incorrectly removed`)
      failed++
    }
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of 9 checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 5: computeEventIdentity fallback logic
 */
function testEventIdentityComputation() {
  console.log('Test 5: Event Identity Computation (Fallback Logic)')
  console.log('----------------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Test 1: Prefer existing eventIdentity
  const event1 = {
    flypost: {
      eventIdentity: 'existing-identity',
      canonicalKey: 'canonical-key'
    }
  }
  
  const identity1 = computeEventIdentity(event1)
  if (identity1 === 'existing-identity') {
    console.log('   ✅ Prefers existing eventIdentity')
    passed++
  } else {
    console.log(`   ❌ Should prefer eventIdentity, got: ${identity1}`)
    failed++
  }
  
  // Test 2: Fallback to canonicalKey
  const event2 = {
    flypost: {
      canonicalKey: 'canonical-key-123'
    }
  }
  
  const identity2 = computeEventIdentity(event2)
  if (identity2 === 'canonical-key-123') {
    console.log('   ✅ Falls back to canonicalKey')
    passed++
  } else {
    console.log(`   ❌ Should fallback to canonicalKey, got: ${identity2}`)
    failed++
  }
  
  // Test 3: Compute from address when needed
  const event3 = {
    brokerageId: 'test-brokerage',
    location: {
      address: {
        streetAddress: '123 Main St',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001'
      }
    }
  }
  
  const identity3 = computeEventIdentity(event3)
  if (identity3 && identity3.includes('123mainst')) {
    console.log(`   ✅ Computes from address: ${identity3}`)
    passed++
  } else {
    console.log(`   ❌ Should compute from address, got: ${identity3}`)
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of 3 checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 6: Array mapping
 */
function testArrayMapping() {
  console.log('Test 6: Array Mapping to Discovery V1')
  console.log('--------------------------------------')
  
  let passed = 0
  let failed = 0
  
  const mockEvents = [
    {
      flypost: {
        eventId: 'evt_1',
        category: 'open_house'
      },
      name: 'Event 1'
    },
    {
      flypost: {
        eventId: 'evt_2',
        category: 'garage-sale'
      },
      name: 'Event 2'
    },
    {
      flypost: {
        eventId: 'evt_3',
        category: 'open_house'
      },
      name: 'Event 3'
    }
  ]
  
  const discoveryEvents = toDiscoveryEventsV1(mockEvents)
  
  if (discoveryEvents.length === 3) {
    console.log(`   ✅ Mapped ${discoveryEvents.length} events`)
    passed++
  } else {
    console.log(`   ❌ Expected 3 events, got ${discoveryEvents.length}`)
    failed++
  }
  
  if (discoveryEvents[0].eventId === 'evt_1') {
    console.log('   ✅ First event mapped correctly')
    passed++
  } else {
    console.log('   ❌ First event not mapped correctly')
    failed++
  }
  
  if (discoveryEvents[1].category === 'garage_sale') {
    console.log('   ✅ Second event category normalized (garage-sale → garage_sale)')
    passed++
  } else {
    console.log(`   ❌ Second event category not normalized correctly: ${discoveryEvents[1].category}`)
    failed++
  }
  
  // Test empty array
  const emptyResult = toDiscoveryEventsV1([])
  if (Array.isArray(emptyResult) && emptyResult.length === 0) {
    console.log('   ✅ Empty array handled correctly')
    passed++
  } else {
    console.log('   ❌ Empty array not handled correctly')
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of 4 checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Run all tests
 */
function runAllTests() {
  console.log('Starting Discovery V1 tests...\n')
  
  const results = []
  
  results.push(testDiscoveryV1Mapping())
  results.push(testUrlAndDataHash())
  results.push(testForbiddenKeys())
  results.push(testSanitizerStripping())
  results.push(testEventIdentityComputation())
  results.push(testArrayMapping())
  
  // Summary
  console.log('====================================================')
  console.log('Test Summary')
  console.log('====================================================')
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log(`\nPassed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('\n✅ All Discovery V1 tests passed!')
    console.log('Two-Layer North Star runtime guardrails are working correctly.')
    process.exit(0)
  } else {
    console.log(`\n❌ ${total - passed} test(s) failed`)
    process.exit(1)
  }
}

// Run tests
runAllTests()
