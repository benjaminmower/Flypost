#!/usr/bin/env node
/**
 * End-to-end test for Discovery API category normalization
 * Tests that categories are normalized to snake_case singular in responses
 */

import { toDiscoveryEventV1, toDiscoveryEventsV1 } from './src/utils/discoveryMapper.js'

console.log('🧪 Testing Discovery API Category Normalization\n')
console.log('================================================\n')

/**
 * Test 1: Single event with kebab-case plural category
 */
function testSingleEventNormalization() {
  console.log('Test 1: Single event category normalization')
  console.log('-------------------------------------------')
  
  const mockEvent = {
    flypost: {
      eventId: 'evt_test_123',
      eventIdentity: 'test-identity',
      category: 'open-houses', // kebab-case plural (what's coming from storage)
      submissionTimestamp: '2025-01-01T00:00:00Z'
    },
    name: 'Test Open House',
    description: 'Test description',
    startDate: '2025-01-15T10:00:00Z',
    location: {
      address: {
        streetAddress: '123 Main St',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001',
        addressCountry: 'US'
      }
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(mockEvent)
  
  if (discoveryEvent.category === 'open_house') {
    console.log('✅ Category normalized: "open-houses" → "open_house"')
    return true
  } else {
    console.log(`❌ Category not normalized: expected "open_house", got "${discoveryEvent.category}"`)
    return false
  }
}

/**
 * Test 2: Multiple events with different category formats
 */
function testMultipleEventsNormalization() {
  console.log('\nTest 2: Multiple events with various category formats')
  console.log('-----------------------------------------------------')
  
  const mockEvents = [
    {
      flypost: { eventId: 'evt_1', category: 'open-houses' },
      name: 'Event 1',
      startDate: '2025-01-15T10:00:00Z',
      location: { address: { addressLocality: 'LA' } }
    },
    {
      flypost: { eventId: 'evt_2', category: 'garage-sales' },
      name: 'Event 2',
      startDate: '2025-01-15T10:00:00Z',
      location: { address: { addressLocality: 'LA' } }
    },
    {
      flypost: { eventId: 'evt_3', category: 'estate sale' },
      name: 'Event 3',
      startDate: '2025-01-15T10:00:00Z',
      location: { address: { addressLocality: 'LA' } }
    },
    {
      flypost: { eventId: 'evt_4', category: 'moving-sales' },
      name: 'Event 4',
      startDate: '2025-01-15T10:00:00Z',
      location: { address: { addressLocality: 'LA' } }
    },
    {
      flypost: { eventId: 'evt_5', category: 'yard sale' },
      name: 'Event 5',
      startDate: '2025-01-15T10:00:00Z',
      location: { address: { addressLocality: 'LA' } }
    }
  ]
  
  const discoveryEvents = toDiscoveryEventsV1(mockEvents)
  
  const expectedCategories = {
    'evt_1': 'open_house',
    'evt_2': 'garage_sale',
    'evt_3': 'estate_sale',
    'evt_4': 'moving_sale',
    'evt_5': 'yard_sale'
  }
  
  let passed = 0
  let failed = 0
  
  for (const event of discoveryEvents) {
    const expected = expectedCategories[event.eventId]
    if (event.category === expected) {
      console.log(`✅ ${event.eventId}: "${event.category}" (correct)`)
      passed++
    } else {
      console.log(`❌ ${event.eventId}: expected "${expected}", got "${event.category}"`)
      failed++
    }
  }
  
  console.log(`\nSummary: ${passed} passed, ${failed} failed`)
  return failed === 0
}

/**
 * Test 3: Verify all valid enum values are preserved
 */
function testValidEnumValues() {
  console.log('\nTest 3: Valid enum values are preserved')
  console.log('----------------------------------------')
  
  const validCategories = [
    'open_house',
    'garage_sale',
    'estate_sale',
    'moving_sale',
    'yard_sale',
    'other'
  ]
  
  let passed = 0
  let failed = 0
  
  for (const category of validCategories) {
    const mockEvent = {
      flypost: {
        eventId: `evt_${category}`,
        category: category // Already in correct format
      },
      name: 'Test Event',
      startDate: '2025-01-15T10:00:00Z',
      location: { address: { addressLocality: 'LA' } }
    }
    
    const discoveryEvent = toDiscoveryEventV1(mockEvent)
    
    if (discoveryEvent.category === category) {
      console.log(`✅ "${category}" preserved correctly`)
      passed++
    } else {
      console.log(`❌ "${category}" changed to "${discoveryEvent.category}"`)
      failed++
    }
  }
  
  console.log(`\nSummary: ${passed} passed, ${failed} failed`)
  return failed === 0
}

/**
 * Test 4: Unknown categories default to 'other'
 */
function testUnknownCategoryDefaultsToOther() {
  console.log('\nTest 4: Unknown categories default to "other"')
  console.log('----------------------------------------------')
  
  const unknownCategories = [
    'unknown-category',
    'random-sale',
    'fake-event'
  ]
  
  let passed = 0
  let failed = 0
  
  for (const category of unknownCategories) {
    const mockEvent = {
      flypost: {
        eventId: `evt_${category}`,
        category: category
      },
      name: 'Test Event',
      startDate: '2025-01-15T10:00:00Z',
      location: { address: { addressLocality: 'LA' } }
    }
    
    const discoveryEvent = toDiscoveryEventV1(mockEvent)
    
    if (discoveryEvent.category === 'other') {
      console.log(`✅ "${category}" → "other" (correct fallback)`)
      passed++
    } else {
      console.log(`❌ "${category}" → "${discoveryEvent.category}" (should be "other")`)
      failed++
    }
  }
  
  console.log(`\nSummary: ${passed} passed, ${failed} failed`)
  return failed === 0
}

// Run all tests
const results = [
  testSingleEventNormalization(),
  testMultipleEventsNormalization(),
  testValidEnumValues(),
  testUnknownCategoryDefaultsToOther()
]

const passed = results.filter(r => r).length
const failed = results.length - passed

console.log('\n================================================')
console.log(`Overall: ${passed} passed, ${failed} failed out of ${results.length} test suites`)

if (failed > 0) {
  process.exit(1)
}

console.log('\n✅ All Discovery API category normalization tests passed!')
