#!/usr/bin/env node
/**
 * End-to-end test demonstrating Discovery V1 contract and drift protection
 * This test shows what would happen if Layer 2 data leaked into stored events
 */

import { toDiscoveryEventsV1 } from './src/utils/discoveryMapper.js'
import { sanitizeDiscoveryResponse } from './src/utils/sanitizer.js'

console.log('🧪 End-to-End Discovery V1 Demo\n')
console.log('=================================\n')

// Simulate stored events with potential Layer 2 data leakage
const storedEvents = [
  {
    // Valid Layer 1 (Registry) data
    flypost: {
      eventId: 'evt_demo_001',
      eventIdentity: 'demo-key-001',
      category: 'open-houses',
      submissionTimestamp: '2025-01-15T10:00:00Z',
      updateCount: 0
    },
    name: 'Beautiful Home Open House',
    description: 'Come see this stunning 3-bedroom home with modern updates and a spacious backyard.',
    url: 'https://www.zillow.com/homedetails/123-Oak-Street',
    startDate: '2025-01-20T10:00:00Z',
    endDate: '2025-01-20T14:00:00Z',
    location: {
      address: {
        streetAddress: '123 Oak Street',
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
      value: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc123',
      canonicalVersion: 1
    },
    
    // Layer 2 (Intelligence) data that should NOT appear in discovery
    attendance: 47,
    attendees: ['buyer_token_123', 'buyer_token_456'],
    feedback: 'Great turnout, many interested buyers',
    sentiment: 'positive',
    brokerageAffiliation: 'premium-partner',
    intelligenceScore: 0.92
  },
  {
    flypost: {
      eventId: 'evt_demo_002',
      category: 'garage-sales',
      submissionTimestamp: '2025-01-15T11:00:00Z'
    },
    name: 'Weekend Garage Sale',
    description: 'X'.repeat(700), // Should be stripped in M2M hardened contract
    url: 'https://www.craigslist.org/garage-sale/456',
    startDate: '2025-01-21T08:00:00Z',
    endDate: '2025-01-21T16:00:00Z',
    location: {
      address: {
        streetAddress: '456 Maple Ave',
        addressLocality: 'Pasadena',
        addressRegion: 'CA',
        postalCode: '91101'
      }
    },
    hash: {
      algorithm: 'SHA-256',
      encoding: 'hex',
      value: 'def789ghi012def789ghi012def789ghi012def789ghi012def789ghi012def789',
      canonicalVersion: 1
    },
    
    // More Layer 2 data
    insights: {
      quality: 'high',
      engagement: 'excellent'
    }
  }
]

console.log('📦 Simulating stored events with Layer 2 data leakage\n')
console.log('Event 1 has forbidden fields: attendance, attendees, feedback, sentiment, brokerageAffiliation, intelligenceScore')
console.log('Event 1 also has description (should be stripped in M2M contract)')
console.log('Event 2 has forbidden field: insights')
console.log('Event 2 has 700-character description (should be stripped, not truncated)\n')

// Step 1: Apply Discovery V1 mapper (allowlist)
console.log('Step 1: Apply Discovery V1 Allowlist Mapper')
console.log('--------------------------------------------')
const discoveryEvents = toDiscoveryEventsV1(storedEvents)

console.log(`✅ Mapped ${discoveryEvents.length} events to Discovery V1 format`)
console.log('\nEvent 1 fields:', Object.keys(discoveryEvents[0]).join(', '))
console.log('Event 2 fields:', Object.keys(discoveryEvents[1]).join(', '))

// Check for forbidden keys after mapping
let foundForbidden = false
for (const event of discoveryEvents) {
  const forbiddenKeys = ['attendance', 'attendees', 'feedback', 'sentiment', 'insights', 'brokerageAffiliation', 'intelligenceScore', 'description']
  for (const key of forbiddenKeys) {
    if (key in event) {
      console.log(`❌ WARNING: Forbidden key "${key}" found in mapped event!`)
      foundForbidden = true
    }
  }
}

if (!foundForbidden) {
  console.log('✅ No forbidden keys found in mapped events (as expected)')
}

// Check M2M hardening: url and dataHash present, description absent
console.log('\n✅ Verifying M2M Contract Hardening:')

if (discoveryEvents[0].url === 'https://www.zillow.com/homedetails/123-Oak-Street') {
  console.log('   ✅ Event 1 has url field: ' + discoveryEvents[0].url)
} else {
  console.log('   ❌ Event 1 missing url field')
}

if (discoveryEvents[0].dataHash === 'abc123def456abc123def456abc123def456abc123def456abc123def456abc123') {
  console.log('   ✅ Event 1 has dataHash field: ' + discoveryEvents[0].dataHash.substring(0, 16) + '...')
} else {
  console.log('   ❌ Event 1 missing dataHash field')
}

if (!('description' in discoveryEvents[0])) {
  console.log('   ✅ Event 1 description correctly stripped (M2M hardening)')
} else {
  console.log('   ❌ Event 1 should not have description field')
}

if (discoveryEvents[1].url === 'https://www.craigslist.org/garage-sale/456') {
  console.log('   ✅ Event 2 has url field: ' + discoveryEvents[1].url)
} else {
  console.log('   ❌ Event 2 missing url field')
}

if (discoveryEvents[1].dataHash === 'def789ghi012def789ghi012def789ghi012def789ghi012def789ghi012def789') {
  console.log('   ✅ Event 2 has dataHash field: ' + discoveryEvents[1].dataHash.substring(0, 16) + '...')
} else {
  console.log('   ❌ Event 2 missing dataHash field')
}

if (!('description' in discoveryEvents[1])) {
  console.log('   ✅ Event 2 description correctly stripped (M2M hardening)')
} else {
  console.log('   ❌ Event 2 should not have description field')
}

// Step 2: Build response and apply sanitizer (defense in depth)
console.log('\n\nStep 2: Apply Runtime Sanitizer (Defense in Depth)')
console.log('---------------------------------------------------')

let response = {
  success: true,
  schemaVersion: 'discovery.v1',
  events: discoveryEvents,
  meta: {
    count: discoveryEvents.length,
    radiusKm: 10
  }
}

// Apply sanitizer
response = sanitizeDiscoveryResponse(response)

console.log(`✅ Sanitizer processed response`)
console.log(`✅ Final response has ${response.events.length} events`)
console.log(`✅ Schema version: ${response.schemaVersion}`)

// Verify final response structure
console.log('\n\nFinal Discovery V1 Response Structure')
console.log('--------------------------------------')
console.log(JSON.stringify(response, null, 2))

// Verify guarantees
console.log('\n\nVerifying Two-Layer North Star Guarantees')
console.log('------------------------------------------')

let passed = 0
let failed = 0

// Check 1: Schema version present
if (response.schemaVersion === 'discovery.v1') {
  console.log('✅ Response has schemaVersion: "discovery.v1"')
  passed++
} else {
  console.log('❌ Schema version missing or incorrect')
  failed++
}

// Check 2: Events array exists
if (Array.isArray(response.events)) {
  console.log('✅ Events array exists')
  passed++
} else {
  console.log('❌ Events array missing')
  failed++
}

// Check 3: Meta exists with count and radiusKm
if (response.meta && typeof response.meta.count === 'number' && typeof response.meta.radiusKm === 'number') {
  console.log('✅ Meta object has count and radiusKm')
  passed++
} else {
  console.log('❌ Meta object incomplete')
  failed++
}

// Check 4: No forbidden keys in any event (including description)
let allClean = true
const forbiddenKeys = ['attendance', 'attendees', 'feedback', 'sentiment', 'insights', 'brokerageAffiliation', 'intelligenceScore', 'buyerToken', 'presenceProof', 'description']
for (const event of response.events) {
  for (const key of forbiddenKeys) {
    if (key in event) {
      console.log(`❌ Forbidden key "${key}" found in event ${event.eventId}`)
      allClean = false
      failed++
    }
  }
}

if (allClean) {
  console.log('✅ No forbidden Layer 2 keys in any event (including description)')
  passed++
}

// Check 5: Required fields present
for (let i = 0; i < response.events.length; i++) {
  const event = response.events[i]
  if (event.eventId && event.eventIdentity && event.category) {
    console.log(`✅ Event ${i + 1} has required fields (eventId, eventIdentity, category)`)
    passed++
  } else {
    console.log(`❌ Event ${i + 1} missing required fields`)
    failed++
  }
}

// Check 6: M2M Contract - url and dataHash present
console.log('\n✅ Verifying M2M Contract Fields:')
for (let i = 0; i < response.events.length; i++) {
  const event = response.events[i]
  
  if (event.url) {
    console.log(`✅ Event ${i + 1} has url field for hand-off`)
    passed++
  } else {
    console.log(`❌ Event ${i + 1} missing url field`)
    failed++
  }
  
  if (event.dataHash) {
    console.log(`✅ Event ${i + 1} has dataHash for integrity verification`)
    passed++
  } else {
    console.log(`❌ Event ${i + 1} missing dataHash field`)
    failed++
  }
}

console.log('\n\nTest Summary')
console.log('============')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failed === 0) {
  console.log('\n✅ All guarantees verified!')
  console.log('The Two-Layer North Star is successfully enforced at runtime.')
  console.log('M2M Contract Hardening: ✅ url present, ✅ dataHash present, ✅ description stripped')
  process.exit(0)
} else {
  console.log('\n❌ Some guarantees failed!')
  process.exit(1)
}
