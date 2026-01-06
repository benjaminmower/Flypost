#!/usr/bin/env node
/**
 * Test script for Discovery V1 timezone and full address support
 * Tests that:
 * 1. Discovery V1 includes when.timezone field when event has timezone
 * 2. Discovery V1 includes full street address (no redaction) for all tiers
 */

import { toDiscoveryEventV1 } from './src/utils/discoveryMapper.js'

console.log('🧪 Testing Discovery V1 Timezone and Full Address Support\n')
console.log('==========================================================\n')

let passed = 0
let failed = 0

/**
 * Test 1: Timezone field included when event has timezone
 */
function testTimezoneInclusion() {
  console.log('Test 1: Timezone Field Inclusion')
  console.log('---------------------------------')
  
  const mockEvent = {
    id: 'evt_test_tz_123',
    flypost: {
      eventId: 'evt_test_tz_123',
      category: 'open_house',
      timezone: 'America/Los_Angeles' // Event has timezone
    },
    name: 'Test Open House with Timezone',
    url: 'https://example.com/listing/123',
    startDate: '2025-01-15T19:00:00Z', // 7pm UTC = 11am PT
    endDate: '2025-01-15T22:00:00Z',   // 10pm UTC = 2pm PT
    location: {
      address: {
        streetAddress: '810 Franklin St',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90401',
        addressCountry: 'US'
      },
      geo: {
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    hash: {
      value: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890'
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(mockEvent)
  
  if (!discoveryEvent) {
    console.log('   ❌ Mapper returned null')
    failed++
    return
  }
  
  // Check timezone is present
  if (discoveryEvent.when?.timezone === 'America/Los_Angeles') {
    console.log('   ✅ when.timezone field present with correct value')
    passed++
  } else {
    console.log(`   ❌ when.timezone missing or incorrect: ${discoveryEvent.when?.timezone}`)
    failed++
  }
  
  console.log('')
}

/**
 * Test 2: Event without timezone should not include timezone field
 */
function testTimezoneOmissionWhenMissing() {
  console.log('Test 2: Timezone Field Omission When Not Available')
  console.log('---------------------------------------------------')
  
  const mockEvent = {
    id: 'evt_test_no_tz_123',
    flypost: {
      eventId: 'evt_test_no_tz_123',
      category: 'open_house'
      // No timezone field
    },
    name: 'Test Open House without Timezone',
    url: 'https://example.com/listing/456',
    startDate: '2025-01-15T19:00:00Z',
    endDate: '2025-01-15T22:00:00Z',
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
      value: 'b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890ab'
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(mockEvent)
  
  if (!discoveryEvent) {
    console.log('   ❌ Mapper returned null')
    failed++
    return
  }
  
  // Check timezone is not present (or undefined)
  if (!discoveryEvent.when?.timezone) {
    console.log('   ✅ when.timezone correctly omitted when not available')
    passed++
  } else {
    console.log(`   ❌ when.timezone should not be present: ${discoveryEvent.when?.timezone}`)
    failed++
  }
  
  console.log('')
}

/**
 * Test 3: Full address included for brokerage tier (no change - already working)
 */
function testFullAddressBrokerageTier() {
  console.log('Test 3: Full Address for Brokerage Tier')
  console.log('----------------------------------------')
  
  const mockEvent = {
    id: 'evt_test_addr_brokerage',
    flypost: {
      eventId: 'evt_test_addr_brokerage',
      category: 'open_house'
    },
    name: 'Test Open House',
    url: 'https://example.com/listing/789',
    startDate: '2025-01-15T19:00:00Z',
    endDate: '2025-01-15T22:00:00Z',
    location: {
      address: {
        streetAddress: '810 Franklin St',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90401',
        addressCountry: 'US'
      },
      geo: {
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    hash: {
      value: 'c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcd'
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'brokerage' })
  
  if (!discoveryEvent) {
    console.log('   ❌ Mapper returned null')
    failed++
    return
  }
  
  const expectedAddress = '810 Franklin St, Santa Monica, CA, 90401, US'
  
  if (discoveryEvent.where?.address === expectedAddress) {
    console.log('   ✅ Full street address included for brokerage tier')
    passed++
  } else {
    console.log(`   ❌ Address incorrect: "${discoveryEvent.where?.address}"`)
    console.log(`      Expected: "${expectedAddress}"`)
    failed++
  }
  
  console.log('')
}

/**
 * Test 4: Full address included for public tier (NEW - no redaction)
 */
function testFullAddressPublicTier() {
  console.log('Test 4: Full Address for Public Tier (No Redaction)')
  console.log('----------------------------------------------------')
  
  const mockEvent = {
    id: 'evt_test_addr_public',
    flypost: {
      eventId: 'evt_test_addr_public',
      category: 'open_house'
    },
    name: 'Test Open House',
    url: 'https://example.com/listing/101',
    startDate: '2025-01-15T19:00:00Z',
    endDate: '2025-01-15T22:00:00Z',
    location: {
      address: {
        streetAddress: '810 Franklin St',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90401',
        addressCountry: 'US'
      },
      geo: {
        latitude: 34.02,  // Public tier precision (2 decimals)
        longitude: -118.49
      }
    },
    hash: {
      value: 'd4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'public' })
  
  if (!discoveryEvent) {
    console.log('   ❌ Mapper returned null')
    failed++
    return
  }
  
  const expectedAddress = '810 Franklin St, Santa Monica, CA, 90401, US'
  
  // Before fix, public tier would have been: "Santa Monica, CA, US" (no street address)
  // After fix, public tier should include full address
  if (discoveryEvent.where?.address === expectedAddress) {
    console.log('   ✅ Full street address included for public tier (no redaction)')
    passed++
  } else {
    console.log(`   ❌ Address incorrect: "${discoveryEvent.where?.address}"`)
    console.log(`      Expected: "${expectedAddress}"`)
    console.log('      Note: Old behavior would have been "Santa Monica, CA, US" (redacted)')
    failed++
  }
  
  console.log('')
}

/**
 * Test 5: Coordinates precision still differs by tier
 */
function testCoordinatePrecisionByTier() {
  console.log('Test 5: Coordinate Precision by Access Tier')
  console.log('--------------------------------------------')
  
  const mockEvent = {
    id: 'evt_test_coords',
    flypost: {
      eventId: 'evt_test_coords',
      category: 'open_house'
    },
    name: 'Test Open House',
    url: 'https://example.com/listing/202',
    startDate: '2025-01-15T19:00:00Z',
    endDate: '2025-01-15T22:00:00Z',
    location: {
      address: {
        streetAddress: '810 Franklin St',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90401'
      },
      geo: {
        latitude: 34.019456,  // Full precision
        longitude: -118.491234
      }
    },
    hash: {
      value: 'e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
    }
  }
  
  const publicEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'public' })
  const brokerageEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'brokerage' })
  
  if (!publicEvent || !brokerageEvent) {
    console.log('   ❌ Mapper returned null')
    failed++
    return
  }
  
  // Public tier should have 2 decimal places
  const publicLat = publicEvent.where?.latitude
  const publicLng = publicEvent.where?.longitude
  
  if (publicLat === 34.02 && publicLng === -118.49) {
    console.log('   ✅ Public tier coordinates rounded to 2 decimals')
    passed++
  } else {
    console.log(`   ❌ Public tier coordinates incorrect: ${publicLat}, ${publicLng}`)
    failed++
  }
  
  // Brokerage tier should have full precision
  const brokerageLat = brokerageEvent.where?.latitude
  const brokerageLng = brokerageEvent.where?.longitude
  
  if (brokerageLat === 34.019456 && brokerageLng === -118.491234) {
    console.log('   ✅ Brokerage tier coordinates at full precision')
    passed++
  } else {
    console.log(`   ❌ Brokerage tier coordinates incorrect: ${brokerageLat}, ${brokerageLng}`)
    failed++
  }
  
  console.log('')
}

// Run all tests
testTimezoneInclusion()
testTimezoneOmissionWhenMissing()
testFullAddressBrokerageTier()
testFullAddressPublicTier()
testCoordinatePrecisionByTier()

// Summary
console.log('==========================================================')
console.log(`\n📊 Test Summary: ${passed} passed, ${failed} failed\n`)

if (failed > 0) {
  console.log('❌ Some tests failed')
  process.exit(1)
} else {
  console.log('✅ All tests passed')
  process.exit(0)
}
