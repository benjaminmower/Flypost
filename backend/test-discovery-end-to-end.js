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
    description: 'X'.repeat(700), // Very long description to test truncation
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
    
    // More Layer 2 data
    insights: {
      quality: 'high',
      engagement: 'excellent'
    }
  }
]

console.log('📦 Simulating stored events with Layer 2 data leakage\n')
console.log('Event 1 has forbidden fields: attendance, attendees, feedback, sentiment, brokerageAffiliation, intelligenceScore')
console.log('Event 2 has forbidden field: insights')
console.log('Event 2 also has a 700-character description\n')

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
  const forbiddenKeys = ['attendance', 'attendees', 'feedback', 'sentiment', 'insights', 'brokerageAffiliation', 'intelligenceScore']
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

// Check description truncation
if (discoveryEvents[1].description) {
  const descLength = discoveryEvents[1].description.length
  console.log(`\n✅ Event 2 description truncated from 700 to ${descLength} characters`)
  if (descLength <= 503) {
    console.log('✅ Description is within safe limit (500 + "...")')
  }
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

// Check 4: No forbidden keys in any event
let allClean = true
const forbiddenKeys = ['attendance', 'attendees', 'feedback', 'sentiment', 'insights', 'brokerageAffiliation', 'intelligenceScore', 'buyerToken', 'presenceProof']
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
  console.log('✅ No forbidden Layer 2 keys in any event')
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

console.log('\n\nTest Summary')
console.log('============')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failed === 0) {
  console.log('\n✅ All guarantees verified!')
  console.log('The Two-Layer North Star is successfully enforced at runtime.')
  process.exit(0)
} else {
  console.log('\n❌ Some guarantees failed!')
  process.exit(1)
}
