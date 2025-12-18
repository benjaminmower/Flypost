#!/usr/bin/env node
/**
 * Test script for public read-only API layer
 * Tests the new endpoints, date filtering, and two-tier access control
 */

import { toDiscoveryEventV1, toDiscoveryEventsV1 } from './src/utils/discoveryMapper.js'

console.log('🧪 Testing Public Read-Only API Layer\n')
console.log('=====================================\n')

/**
 * Test 1: Two-tier access - Public tier reduces precision
 */
function testPublicTierGeoPrecision() {
  console.log('Test 1: Public Tier Geo Precision Reduction')
  console.log('--------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  const mockEvent = {
    flypost: {
      eventId: 'evt_test_123',
      eventIdentity: 'test-identity',
      category: 'open_house'
    },
    name: 'Test Open House',
    startDate: '2025-01-15T10:00:00Z',
    location: {
      address: {
        streetAddress: '123 Main St',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA',
        postalCode: '90001',
        addressCountry: 'US'
      },
      geo: {
        latitude: 34.052235,
        longitude: -118.243683
      }
    }
  }
  
  // Test public tier
  const publicEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'public' })
  
  // Check geo precision (should be 2 decimal places)
  if (publicEvent.geo.latitude === 34.05 && publicEvent.geo.longitude === -118.24) {
    console.log(`   ✅ Public tier geo reduced to 2 decimals: (${publicEvent.geo.latitude}, ${publicEvent.geo.longitude})`)
    passed++
  } else {
    console.log(`   ❌ Public tier geo precision incorrect: (${publicEvent.geo.latitude}, ${publicEvent.geo.longitude})`)
    failed++
  }
  
  // Check address (should only have city, region, country)
  if (!publicEvent.address.streetAddress && !publicEvent.address.postalCode) {
    console.log('   ✅ Public tier address excludes streetAddress and postalCode')
    passed++
  } else {
    console.log('   ❌ Public tier address includes sensitive fields')
    failed++
  }
  
  if (publicEvent.address.addressLocality === 'Los Angeles' && 
      publicEvent.address.addressRegion === 'CA') {
    console.log('   ✅ Public tier address includes city and region')
    passed++
  } else {
    console.log('   ❌ Public tier address missing city or region')
    failed++
  }
  
  // Test brokerage tier
  const brokerageEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'brokerage' })
  
  // Check full precision geo
  if (brokerageEvent.geo.latitude === 34.052235 && 
      brokerageEvent.geo.longitude === -118.243683) {
    console.log(`   ✅ Brokerage tier geo at full precision: (${brokerageEvent.geo.latitude}, ${brokerageEvent.geo.longitude})`)
    passed++
  } else {
    console.log(`   ❌ Brokerage tier geo precision incorrect`)
    failed++
  }
  
  // Check full address
  if (brokerageEvent.address.streetAddress === '123 Main St' && 
      brokerageEvent.address.postalCode === '90001') {
    console.log('   ✅ Brokerage tier address includes full details')
    passed++
  } else {
    console.log('   ❌ Brokerage tier address missing details')
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${passed + failed} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 2: Two-tier access - Public tier gets shorter description
 */
function testPublicTierDescriptionTruncation() {
  console.log('Test 2: Public Tier Description Truncation')
  console.log('------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Create long description (300 chars)
  const longDesc = 'A'.repeat(300)
  
  const mockEvent = {
    flypost: {
      eventId: 'evt_test_456',
      category: 'open_house'
    },
    name: 'Test Event',
    description: longDesc,
    startDate: '2025-01-15T10:00:00Z',
    location: {
      address: { addressLocality: 'LA', addressRegion: 'CA' },
      geo: { latitude: 34.05, longitude: -118.24 }
    }
  }
  
  // Public tier should truncate to 200 chars
  const publicEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'public' })
  if (publicEvent.description.length <= 203) { // 200 + '...'
    console.log(`   ✅ Public tier description truncated: ${publicEvent.description.length} chars`)
    passed++
  } else {
    console.log(`   ❌ Public tier description too long: ${publicEvent.description.length} chars`)
    failed++
  }
  
  // Brokerage tier should truncate to 500 chars
  const brokerageEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'brokerage' })
  if (brokerageEvent.description.length <= 303) { // 300 chars, no truncation needed
    console.log(`   ✅ Brokerage tier description preserved: ${brokerageEvent.description.length} chars`)
    passed++
  } else {
    console.log(`   ❌ Brokerage tier description length incorrect: ${brokerageEvent.description.length} chars`)
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${passed + failed} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 3: Two-tier access - Public tier excludes metadata
 */
function testPublicTierMetadataExclusion() {
  console.log('Test 3: Public Tier Metadata Exclusion')
  console.log('---------------------------------------')
  
  let passed = 0
  let failed = 0
  
  const mockEvent = {
    flypost: {
      eventId: 'evt_test_789',
      category: 'open_house',
      submissionTimestamp: '2025-01-01T00:00:00Z',
      updateCount: 5
    },
    name: 'Test Event',
    startDate: '2025-01-15T10:00:00Z',
    location: {
      address: { addressLocality: 'LA', addressRegion: 'CA' },
      geo: { latitude: 34.05, longitude: -118.24 }
    }
  }
  
  // Public tier should exclude metadata
  const publicEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'public' })
  if (!publicEvent.submissionTimestamp && !publicEvent.updateCount) {
    console.log('   ✅ Public tier excludes submissionTimestamp and updateCount')
    passed++
  } else {
    console.log('   ❌ Public tier includes metadata fields')
    failed++
  }
  
  // Brokerage tier should include metadata
  const brokerageEvent = toDiscoveryEventV1(mockEvent, { accessTier: 'brokerage' })
  if (brokerageEvent.submissionTimestamp && brokerageEvent.updateCount === 5) {
    console.log('   ✅ Brokerage tier includes submissionTimestamp and updateCount')
    passed++
  } else {
    console.log('   ❌ Brokerage tier missing metadata fields')
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${passed + failed} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 4: Date filtering simulation
 */
function testDateFiltering() {
  console.log('Test 4: Date Filtering Logic')
  console.log('-----------------------------')
  
  let passed = 0
  let failed = 0
  
  const events = [
    {
      flypost: { eventId: 'evt_1', category: 'open_house' },
      name: 'Event 1 (Jan 10-12)',
      startDate: '2025-01-10T10:00:00Z',
      endDate: '2025-01-12T14:00:00Z',
      location: { address: { addressLocality: 'LA', addressRegion: 'CA' } }
    },
    {
      flypost: { eventId: 'evt_2', category: 'open_house' },
      name: 'Event 2 (Jan 15-17)',
      startDate: '2025-01-15T10:00:00Z',
      endDate: '2025-01-17T14:00:00Z',
      location: { address: { addressLocality: 'LA', addressRegion: 'CA' } }
    },
    {
      flypost: { eventId: 'evt_3', category: 'open_house' },
      name: 'Event 3 (Jan 20-22)',
      startDate: '2025-01-20T10:00:00Z',
      endDate: '2025-01-22T14:00:00Z',
      location: { address: { addressLocality: 'LA', addressRegion: 'CA' } }
    }
  ]
  
  // Simulate date filtering (Jan 14 - Jan 18)
  const startFilter = new Date('2025-01-14T00:00:00Z')
  const endFilter = new Date('2025-01-18T23:59:59Z')
  
  const filtered = events.filter(ev => {
    const eventStart = new Date(ev.startDate)
    const eventEnd = new Date(ev.endDate)
    
    // Event must overlap with requested range
    if (eventEnd < startFilter) return false
    if (eventStart > endFilter) return false
    return true
  })
  
  if (filtered.length === 1 && filtered[0].flypost.eventId === 'evt_2') {
    console.log(`   ✅ Date filtering correctly identified 1 event in range`)
    passed++
  } else {
    console.log(`   ❌ Date filtering returned ${filtered.length} events, expected 1`)
    failed++
  }
  
  // Test edge case: filter with only start date
  const filtered2 = events.filter(ev => {
    const eventEnd = new Date(ev.endDate)
    if (eventEnd < startFilter) return false
    return true
  })
  
  if (filtered2.length === 2) { // Events 2 and 3 should match
    console.log(`   ✅ Start-only filtering correctly identified 2 events`)
    passed++
  } else {
    console.log(`   ❌ Start-only filtering returned ${filtered2.length} events, expected 2`)
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${passed + failed} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 5: Access tier determination
 */
function testAccessTierDetermination() {
  console.log('Test 5: Access Tier Determination')
  console.log('----------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Simulate request objects
  const publicRequest = {
    query: {},
    get: () => null
  }
  
  const brokerageRequest1 = {
    query: { brokerageId: 'brokerage_123' },
    get: () => null
  }
  
  const brokerageRequest2 = {
    query: {},
    get: (header) => header === 'x-api-key' ? 'api_key_123' : null
  }
  
  // Simple access tier determination logic (matches server.js)
  function determineAccessTier(req) {
    const brokerageId = req.query.brokerageId || req.query.brokerage_id
    const hasApiKey = req.get('x-api-key') || req.query.api_key
    
    if (brokerageId || hasApiKey) {
      return 'brokerage'
    }
    return 'public'
  }
  
  const tier1 = determineAccessTier(publicRequest)
  if (tier1 === 'public') {
    console.log('   ✅ Request without brokerageId/key → public tier')
    passed++
  } else {
    console.log(`   ❌ Expected public tier, got ${tier1}`)
    failed++
  }
  
  const tier2 = determineAccessTier(brokerageRequest1)
  if (tier2 === 'brokerage') {
    console.log('   ✅ Request with brokerageId → brokerage tier')
    passed++
  } else {
    console.log(`   ❌ Expected brokerage tier, got ${tier2}`)
    failed++
  }
  
  const tier3 = determineAccessTier(brokerageRequest2)
  if (tier3 === 'brokerage') {
    console.log('   ✅ Request with API key → brokerage tier')
    passed++
  } else {
    console.log(`   ❌ Expected brokerage tier, got ${tier3}`)
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${passed + failed} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 6: Anomaly detection simulation
 */
function testAnomalyDetection() {
  console.log('Test 6: Anomaly Detection')
  console.log('-------------------------')
  
  let passed = 0
  let failed = 0
  
  const ipRequestTracker = new Map()
  const ANOMALY_THRESHOLD = 50
  const ANOMALY_WINDOW_MS = 5 * 60 * 1000
  
  function trackAndDetectAnomaly(ip) {
    const now = Date.now()
    
    if (!ipRequestTracker.has(ip)) {
      ipRequestTracker.set(ip, [])
    }
    
    const requests = ipRequestTracker.get(ip)
    const recentRequests = requests.filter(timestamp => now - timestamp < ANOMALY_WINDOW_MS)
    recentRequests.push(now)
    ipRequestTracker.set(ip, recentRequests)
    
    return recentRequests.length > ANOMALY_THRESHOLD
  }
  
  // Simulate normal traffic
  const normalIp = '192.168.1.1'
  let anomalyDetected = false
  
  for (let i = 0; i < 30; i++) {
    if (trackAndDetectAnomaly(normalIp)) {
      anomalyDetected = true
    }
  }
  
  if (!anomalyDetected) {
    console.log('   ✅ Normal traffic (30 requests) not flagged as anomaly')
    passed++
  } else {
    console.log('   ❌ Normal traffic incorrectly flagged as anomaly')
    failed++
  }
  
  // Simulate anomalous traffic
  const suspiciousIp = '192.168.1.2'
  anomalyDetected = false
  
  for (let i = 0; i < 60; i++) {
    if (trackAndDetectAnomaly(suspiciousIp)) {
      anomalyDetected = true
    }
  }
  
  if (anomalyDetected) {
    console.log('   ✅ High traffic (60 requests) correctly flagged as anomaly')
    passed++
  } else {
    console.log('   ❌ High traffic not flagged as anomaly')
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${passed + failed} checks`)
  console.log('')
  
  return failed === 0
}

// Run all tests
console.log('🚀 Running all tests...\n')

const results = [
  testPublicTierGeoPrecision(),
  testPublicTierDescriptionTruncation(),
  testPublicTierMetadataExclusion(),
  testDateFiltering(),
  testAccessTierDetermination(),
  testAnomalyDetection()
]

const allPassed = results.every(result => result === true)

console.log('\n' + '='.repeat(50))
console.log(`\n📊 Overall: ${results.filter(r => r).length}/${results.length} test suites passed\n`)

if (allPassed) {
  console.log('✅ All tests passed!\n')
  process.exit(0)
} else {
  console.log('❌ Some tests failed\n')
  process.exit(1)
}
