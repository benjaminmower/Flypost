/*
 * Test script for brokerage-agnostic event identity functionality
 * Tests the new global event identity system
 */

import { computeEventIdentity, computeStartTimeWindow } from './src/utils/canonicalKey.js'

// Test 1: Time window computation with hour precision
function testTimeWindowHourBucket() {
  console.log('\n🧪 Test 1: Time Window Hour Bucket...')
  
  const testCases = [
    {
      startDate: '2025-01-15T14:30:00.000Z',
      expected: '2025-01-15T14',
      description: 'Hour bucket with minutes'
    },
    {
      startDate: '2025-01-15T14:00:00.000Z',
      expected: '2025-01-15T14',
      description: 'Hour bucket at exact hour'
    },
    {
      startDate: '2025-01-15T14:59:59.999Z',
      expected: '2025-01-15T14',
      description: 'Hour bucket at end of hour'
    },
    {
      startDate: '2025-01-15T00:15:00.000Z',
      expected: '2025-01-15T00',
      description: 'Hour bucket at midnight'
    }
  ]

  let passed = 0
  for (const test of testCases) {
    const result = computeStartTimeWindow(test.startDate)
    if (result === test.expected) {
      console.log(`   ✅ ${test.description}: ${result}`)
      passed++
    } else {
      console.error(`   ❌ ${test.description}: expected ${test.expected}, got ${result}`)
    }
  }

  console.log(`   ${passed}/${testCases.length} tests passed`)
  return passed === testCases.length
}

// Test 2: Time window computation for date-only
function testTimeWindowDateOnly() {
  console.log('\n🧪 Test 2: Time Window Date-Only Bucket...')
  
  const testCases = [
    {
      startDate: '2025-01-15',
      expected: '2025-01-15',
      description: 'Date-only format'
    },
    {
      startDate: '2025-12-31',
      expected: '2025-12-31',
      description: 'End of year date'
    }
  ]

  let passed = 0
  for (const test of testCases) {
    const result = computeStartTimeWindow(test.startDate)
    // For date-only, we should get date bucket
    if (result && result.startsWith(test.expected.substring(0, 10))) {
      console.log(`   ✅ ${test.description}: ${result}`)
      passed++
    } else {
      console.error(`   ❌ ${test.description}: expected to start with ${test.expected}, got ${result}`)
    }
  }

  console.log(`   ${passed}/${testCases.length} tests passed`)
  return passed === testCases.length
}

// Test 3: Event identity generation
function testEventIdentityGeneration() {
  console.log('\n🧪 Test 3: Event Identity Generation...')
  
  const mockEvent = {
    location: {
      address: {
        streetAddress: '123 Main Street',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90405'
      }
    },
    startDate: '2025-01-15T14:30:00.000Z'
  }

  const identity = computeEventIdentity(mockEvent)
  
  if (!identity) {
    console.error('   ❌ Failed to generate event identity')
    return false
  }

  const expectedAddress = '123mainstreet-santamonica-ca-90405'
  const expectedTimeWindow = '2025-01-15T14'
  const expectedIdentity = `${expectedAddress}|${expectedTimeWindow}`

  if (identity === expectedIdentity) {
    console.log(`   ✅ Generated identity: ${identity}`)
    return true
  } else {
    console.error(`   ❌ Expected: ${expectedIdentity}`)
    console.error(`   ❌ Got: ${identity}`)
    return false
  }
}

// Test 4: Event identity determinism (same input = same output)
function testEventIdentityDeterminism() {
  console.log('\n🧪 Test 4: Event Identity Determinism...')
  
  const mockEvent1 = {
    location: {
      address: {
        streetAddress: '456 Oak Ave',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001'
      }
    },
    startDate: '2025-02-20T10:00:00.000Z'
  }

  const mockEvent2 = {
    location: {
      address: {
        streetAddress: '456 Oak Ave',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001'
      }
    },
    startDate: '2025-02-20T10:30:00.000Z' // Same hour bucket
  }

  const identity1 = computeEventIdentity(mockEvent1)
  const identity2 = computeEventIdentity(mockEvent2)

  if (identity1 === identity2) {
    console.log(`   ✅ Same event identity for same location and hour: ${identity1}`)
    return true
  } else {
    console.error(`   ❌ Different identities for same event:`)
    console.error(`      ${identity1}`)
    console.error(`      ${identity2}`)
    return false
  }
}

// Test 5: Different time windows produce different identities
function testDifferentTimeWindows() {
  console.log('\n🧪 Test 5: Different Time Windows...')
  
  const mockEvent1 = {
    location: {
      address: {
        streetAddress: '789 Pine St',
        addressLocality: 'Seattle',
        addressRegion: 'WA',
        postalCode: '98101'
      }
    },
    startDate: '2025-03-10T14:00:00.000Z'
  }

  const mockEvent2 = {
    ...mockEvent1,
    startDate: '2025-03-10T15:00:00.000Z' // Different hour
  }

  const identity1 = computeEventIdentity(mockEvent1)
  const identity2 = computeEventIdentity(mockEvent2)

  if (identity1 !== identity2) {
    console.log(`   ✅ Different identities for different hours:`)
    console.log(`      Hour 14: ${identity1}`)
    console.log(`      Hour 15: ${identity2}`)
    return true
  } else {
    console.error(`   ❌ Same identity for different hours: ${identity1}`)
    return false
  }
}

// Test 6: Brokerage-agnostic (no brokerage in identity)
function testBrokerageAgnostic() {
  console.log('\n🧪 Test 6: Brokerage-Agnostic Identity...')
  
  const mockEvent = {
    location: {
      address: {
        streetAddress: '321 Elm St',
        addressLocality: 'Portland',
        addressRegion: 'OR',
        postalCode: '97201'
      }
    },
    startDate: '2025-04-05T16:00:00.000Z'
  }

  const identity = computeEventIdentity(mockEvent)
  
  // Check that identity doesn't contain any brokerage-like patterns
  if (!identity.includes('brokerage') && !identity.includes('broker')) {
    console.log(`   ✅ Identity is brokerage-agnostic: ${identity}`)
    return true
  } else {
    console.error(`   ❌ Identity contains brokerage reference: ${identity}`)
    return false
  }
}

// Test 7: Missing data handling
function testMissingDataHandling() {
  console.log('\n🧪 Test 7: Missing Data Handling...')
  
  let passed = 0
  
  // Missing location
  const noLocation = { startDate: '2025-01-01T12:00:00Z' }
  if (computeEventIdentity(noLocation) === null) {
    console.log('   ✅ Returns null for missing location')
    passed++
  } else {
    console.error('   ❌ Should return null for missing location')
  }

  // Missing address
  const noAddress = { 
    location: {},
    startDate: '2025-01-01T12:00:00Z'
  }
  if (computeEventIdentity(noAddress) === null) {
    console.log('   ✅ Returns null for missing address')
    passed++
  } else {
    console.error('   ❌ Should return null for missing address')
  }

  // Missing startDate
  const noStartDate = {
    location: {
      address: {
        streetAddress: '123 Main St',
        addressLocality: 'City',
        addressRegion: 'ST',
        postalCode: '12345'
      }
    }
  }
  if (computeEventIdentity(noStartDate) === null) {
    console.log('   ✅ Returns null for missing startDate')
    passed++
  } else {
    console.error('   ❌ Should return null for missing startDate')
  }

  console.log(`   ${passed}/3 tests passed`)
  return passed === 3
}

// Test 8: Address normalization consistency
function testAddressNormalization() {
  console.log('\n🧪 Test 8: Address Normalization Consistency...')
  
  // Test that similar addresses normalize the same way
  const addresses = [
    {
      input: {
        streetAddress: '123 Main St.',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90405'
      },
      description: 'With period'
    },
    {
      input: {
        streetAddress: '123 Main St',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90405'
      },
      description: 'Without period (should match)'
    },
    {
      input: {
        streetAddress: '123 main st',
        addressLocality: 'santa monica',
        addressRegion: 'ca',
        postalCode: '90405'
      },
      description: 'Lowercase (should match)'
    }
  ]

  const identities = addresses.map(addr => {
    const event = {
      location: { address: addr.input },
      startDate: '2025-01-15T14:00:00Z'
    }
    return computeEventIdentity(event)
  })

  // First three should be the same (St. and St and st normalize identically)
  const allSame = identities.every(id => id === identities[0])
  
  if (allSame) {
    console.log(`   ✅ Similar addresses produce same identity: ${identities[0]}`)
    
    // Test that genuinely different addresses produce different identities
    const differentAddress = {
      streetAddress: '456 Oak Ave',
      addressLocality: 'Santa Monica',
      addressRegion: 'CA',
      postalCode: '90405'
    }
    
    const differentEvent = {
      location: { address: differentAddress },
      startDate: '2025-01-15T14:00:00Z'
    }
    
    const differentIdentity = computeEventIdentity(differentEvent)
    
    if (differentIdentity !== identities[0]) {
      console.log(`   ✅ Different addresses produce different identities`)
      return true
    } else {
      console.error('   ❌ Different addresses should not match')
      return false
    }
  } else {
    console.error('   ❌ Different identities for similar addresses:')
    identities.forEach((id, i) => {
      console.error(`      ${addresses[i].description}: ${id}`)
    })
    return false
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Event Identity Test Suite')
  console.log('=' .repeat(60))

  const results = [
    testTimeWindowHourBucket(),
    testTimeWindowDateOnly(),
    testEventIdentityGeneration(),
    testEventIdentityDeterminism(),
    testDifferentTimeWindows(),
    testBrokerageAgnostic(),
    testMissingDataHandling(),
    testAddressNormalization()
  ]

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
