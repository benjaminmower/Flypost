/*
 * Test script for canonical key functionality
 * Tests the "Edit instead of Create" behavior
 */

import { computeCanonicalKey } from './src/utils/canonicalKey.js'
import { storeEvent, clearEvents } from './src/storage.js'
import { computeEventHash } from './src/hashUtils.js'

// Mock event data with complete address
const mockEventWithAddress = {
  "@context": "https://schema.org",
  "@type": "Event",
  "flypost": {
    "eventId": "evt_test_canonical_1",
    "category": "garage-sales",
    "realTimeData": true,
    "crawlable": true,
    "queryable": true,
    "submissionTimestamp": new Date().toISOString()
  },
  "name": "Saturday Garage Sale",
  "description": "Multi-family garage sale",
  "startDate": "2025-01-04T08:00:00.000Z",
  "location": {
    "@type": "Place",
    "name": "123 Main Street",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Main Street",
      "addressLocality": "Santa Monica",
      "addressRegion": "CA",
      "postalCode": "90405",
      "addressCountry": "US"
    }
  },
  "organizer": {
    "@type": "Person",
    "name": "John Smith",
    "email": "john@example.com"
  }
}

// Test 1: Canonical key generation
function testCanonicalKeyGeneration() {
  console.log('\n🧪 Test 1: Canonical Key Generation...')
  
  const brokerageId = 'test-brokerage-123'
  const canonicalKey = computeCanonicalKey(mockEventWithAddress, brokerageId)
  
  const expectedKey = '123mainstreet-santamonica-ca-90405|test-brokerage-123'
  
  if (canonicalKey === expectedKey) {
    console.log(`✅ Canonical key generated correctly: ${canonicalKey}`)
    return true
  } else {
    console.error(`❌ Expected: ${expectedKey}`)
    console.error(`❌ Got: ${canonicalKey}`)
    return false
  }
}

// Test 2: Canonical key with missing address
function testCanonicalKeyWithMissingAddress() {
  console.log('\n🧪 Test 2: Canonical Key with Missing Address...')
  
  const eventWithoutLocation = {
    "@type": "Event",
    "name": "Event without location"
  }
  
  const brokerageId = 'test-brokerage'
  const canonicalKey = computeCanonicalKey(eventWithoutLocation, brokerageId)
  
  if (canonicalKey === null) {
    console.log('✅ Returns null for events without location')
    return true
  } else {
    console.error(`❌ Expected null, got: ${canonicalKey}`)
    return false
  }
}

// Test 3: Canonical key normalization (special characters)
function testCanonicalKeyNormalization() {
  console.log('\n🧪 Test 3: Canonical Key Normalization...')
  
  const eventWithSpecialChars = {
    ...mockEventWithAddress,
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        "streetAddress": "123 Main St.",
        "addressLocality": "Santa-Monica",
        "addressRegion": "CA",
        "postalCode": "90405"
      }
    }
  }
  
  const brokerageId = 'test-brokerage'
  const canonicalKey = computeCanonicalKey(eventWithSpecialChars, brokerageId)
  
  // Should normalize dots and dashes
  const expectedKey = '123mainst-santamonica-ca-90405|test-brokerage'
  
  if (canonicalKey === expectedKey) {
    console.log(`✅ Special characters normalized correctly: ${canonicalKey}`)
    return true
  } else {
    console.error(`❌ Expected: ${expectedKey}`)
    console.error(`❌ Got: ${canonicalKey}`)
    return false
  }
}

// Test 4: Canonical key with partial address
function testCanonicalKeyWithPartialAddress() {
  console.log('\n🧪 Test 4: Canonical Key with Partial Address...')
  
  const eventWithPartialAddress = {
    ...mockEventWithAddress,
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        "streetAddress": "456 Oak Ave",
        "addressLocality": "Los Angeles",
        // Missing addressRegion and postalCode
        "addressCountry": "US"
      }
    }
  }
  
  const brokerageId = 'test-brokerage'
  const canonicalKey = computeCanonicalKey(eventWithPartialAddress, brokerageId)
  
  // Should work with partial address
  const expectedKey = '456oakave-losangeles|test-brokerage'
  
  if (canonicalKey === expectedKey) {
    console.log(`✅ Partial address handled correctly: ${canonicalKey}`)
    return true
  } else {
    console.error(`❌ Expected: ${expectedKey}`)
    console.error(`❌ Got: ${canonicalKey}`)
    return false
  }
}

// Test 5: Different brokerages generate different keys
function testDifferentBrokerageIds() {
  console.log('\n🧪 Test 5: Different Brokerage IDs...')
  
  const key1 = computeCanonicalKey(mockEventWithAddress, 'brokerage-a')
  const key2 = computeCanonicalKey(mockEventWithAddress, 'brokerage-b')
  
  if (key1 !== key2 && key1.endsWith('|brokerage-a') && key2.endsWith('|brokerage-b')) {
    console.log('✅ Different brokerages generate different keys')
    console.log(`   Key 1: ${key1}`)
    console.log(`   Key 2: ${key2}`)
    return true
  } else {
    console.error('❌ Brokerage namespacing failed')
    return false
  }
}

// Test 6: Same address with same brokerage generates same key
function testKeyConsistency() {
  console.log('\n🧪 Test 6: Key Consistency...')
  
  const event1 = {
    ...mockEventWithAddress,
    name: "First Event"
  }
  
  const event2 = {
    ...mockEventWithAddress,
    name: "Second Event",
    description: "Different description"
  }
  
  const key1 = computeCanonicalKey(event1, 'same-brokerage')
  const key2 = computeCanonicalKey(event2, 'same-brokerage')
  
  if (key1 === key2) {
    console.log(`✅ Same address generates consistent key: ${key1}`)
    return true
  } else {
    console.error('❌ Keys should be identical for same address')
    console.error(`   Key 1: ${key1}`)
    console.error(`   Key 2: ${key2}`)
    return false
  }
}

// Test 7: Event storage with canonical key
async function testStorageWithCanonicalKey() {
  console.log('\n🧪 Test 7: Storage with Canonical Key...')
  
  clearEvents()
  
  const brokerageId = 'test-brokerage'
  const canonicalKey = computeCanonicalKey(mockEventWithAddress, brokerageId)
  
  const eventWithCanonicalKey = {
    ...mockEventWithAddress,
    flypost: {
      ...mockEventWithAddress.flypost,
      canonicalKey: canonicalKey,
      brokerageId: brokerageId
    }
  }
  
  // Add hash
  const hash = computeEventHash(eventWithCanonicalKey)
  eventWithCanonicalKey.hash = hash
  eventWithCanonicalKey.brokerageId = brokerageId
  
  const storedEvent = await storeEvent(eventWithCanonicalKey)
  
  if (storedEvent.flypost.canonicalKey === canonicalKey) {
    console.log(`✅ Event stored with canonical key: ${canonicalKey}`)
    return true
  } else {
    console.error('❌ Canonical key not preserved in storage')
    return false
  }
}

// Test 8: Case insensitivity
function testCaseInsensitivity() {
  console.log('\n🧪 Test 8: Case Insensitivity...')
  
  const event1 = {
    ...mockEventWithAddress,
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        "streetAddress": "123 Main Street",
        "addressLocality": "Santa Monica",
        "addressRegion": "CA",
        "postalCode": "90405"
      }
    }
  }
  
  const event2 = {
    ...mockEventWithAddress,
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        "streetAddress": "123 MAIN STREET",
        "addressLocality": "SANTA MONICA",
        "addressRegion": "ca",
        "postalCode": "90405"
      }
    }
  }
  
  const key1 = computeCanonicalKey(event1, 'test')
  const key2 = computeCanonicalKey(event2, 'test')
  
  if (key1 === key2) {
    console.log(`✅ Case insensitive normalization works: ${key1}`)
    return true
  } else {
    console.error('❌ Case normalization failed')
    console.error(`   Key 1: ${key1}`)
    console.error(`   Key 2: ${key2}`)
    return false
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Canonical Key Tests\n')
  
  try {
    const results = [
      testCanonicalKeyGeneration(),
      testCanonicalKeyWithMissingAddress(),
      testCanonicalKeyNormalization(),
      testCanonicalKeyWithPartialAddress(),
      testDifferentBrokerageIds(),
      testKeyConsistency(),
      await testStorageWithCanonicalKey(),
      testCaseInsensitivity()
    ]
    
    const passed = results.filter(r => r).length
    const total = results.length
    
    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`)
    
    if (passed === total) {
      console.log('🎉 All canonical key tests passed!')
      process.exit(0)
    } else {
      console.log('❌ Some tests failed.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test error:', error)
    process.exit(1)
  }
}

// Run the tests
runTests()
