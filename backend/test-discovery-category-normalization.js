#!/usr/bin/env node
/**
 * End-to-end test for Discovery API category normalization.
 * Tests that stored category values are normalized to public Discovery V1 what.type values.
 */

import { toDiscoveryEventV1, toDiscoveryEventsV1 } from './src/utils/discoveryMapper.js'

console.log('🧪 Testing Discovery API Category Normalization\n')
console.log('================================================\n')

const HASH = 'a'.repeat(64)

function mockEvent(eventId, category) {
  return {
    flypost: {
      eventId,
      category,
      timezone: 'America/Los_Angeles'
    },
    hash: {
      value: HASH
    },
    name: `Test ${eventId}`,
    startDate: '2027-01-15T10:00:00Z',
    endDate: '2027-01-15T12:00:00Z',
    location: {
      geo: {
        latitude: 34.0522,
        longitude: -118.2437
      },
      address: {
        streetAddress: '123 Main St',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001',
        addressCountry: 'US'
      }
    }
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`✅ ${label}: "${actual}"`)
    return true
  }

  console.log(`❌ ${label}: expected "${expected}", got "${actual}"`)
  return false
}

function testSingleEventNormalization() {
  console.log('Test 1: Single event category normalization')
  console.log('-------------------------------------------')

  const discoveryEvent = toDiscoveryEventV1(mockEvent('evt_test_123', 'open-houses'))
  return assertEqual(discoveryEvent?.what?.type, 'open_house', 'open-houses')
}

function testMultipleEventsNormalization() {
  console.log('\nTest 2: Multiple storage categories normalize to public categories')
  console.log('---------------------------------------------------------------')

  const expectedCategories = {
    evt_open_house: 'open_house',
    evt_garage_sale: 'garage_sale',
    evt_estate_sale: 'estate_sale',
    evt_moving_sale: 'moving_sale',
    evt_yard_sale: 'yard_sale',
    evt_apartment: 'apartment',
    evt_job_posting: 'job_posting',
    evt_live_event: 'live_event',
    evt_community_alert: 'community_alert',
    evt_happy_hour: 'happy_hour',
    evt_missing_pet: 'missing_pet'
  }

  const mockEvents = [
    mockEvent('evt_open_house', 'open-houses'),
    mockEvent('evt_garage_sale', 'garage-sales'),
    mockEvent('evt_estate_sale', 'estate sale'),
    mockEvent('evt_moving_sale', 'moving-sales'),
    mockEvent('evt_yard_sale', 'yard sale'),
    mockEvent('evt_apartment', 'apartments'),
    mockEvent('evt_job_posting', 'job-postings'),
    mockEvent('evt_live_event', 'live-events'),
    mockEvent('evt_community_alert', 'community-alerts'),
    mockEvent('evt_happy_hour', 'happy-hours'),
    mockEvent('evt_missing_pet', 'missing-pets')
  ]

  const discoveryEvents = toDiscoveryEventsV1(mockEvents)
  let passed = 0
  let failed = 0

  for (const event of discoveryEvents) {
    const expected = expectedCategories[event.eventId]
    if (assertEqual(event.what.type, expected, event.eventId)) {
      passed++
    } else {
      failed++
    }
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`)
  return failed === 0
}

function testPublicEnumValuesArePreserved() {
  console.log('\nTest 3: Public enum values are preserved')
  console.log('----------------------------------------')

  const publicCategories = [
    'open_house',
    'garage_sale',
    'estate_sale',
    'moving_sale',
    'yard_sale',
    'apartment',
    'job_posting',
    'live_event',
    'community_alert',
    'happy_hour',
    'missing_pet',
    'other'
  ]

  let failed = 0

  for (const category of publicCategories) {
    const discoveryEvent = toDiscoveryEventV1(mockEvent(`evt_${category}`, category))
    if (!assertEqual(discoveryEvent?.what?.type, category, category)) {
      failed++
    }
  }

  return failed === 0
}

function testUnknownCategoryDefaultsToOther() {
  console.log('\nTest 4: Unknown stored categories default to "other"')
  console.log('---------------------------------------------------')

  const discoveryEvent = toDiscoveryEventV1(mockEvent('evt_unknown', 'not-a-real-category'))
  return assertEqual(discoveryEvent?.what?.type, 'other', 'not-a-real-category')
}

const results = [
  testSingleEventNormalization(),
  testMultipleEventsNormalization(),
  testPublicEnumValuesArePreserved(),
  testUnknownCategoryDefaultsToOther()
]

const passed = results.filter(Boolean).length
const failed = results.length - passed

console.log('\n================================================')
console.log(`Overall: ${passed} passed, ${failed} failed out of ${results.length} test suites`)

if (failed > 0) {
  process.exit(1)
}

console.log('\n✅ All Discovery API category normalization tests passed!')
