#!/usr/bin/env node
/**
 * End-to-end test for Discovery V1 Protocol with schema validation
 * Tests the complete pipeline from stored events to validated API responses
 */

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { toDiscoveryEventsV1 } from './src/utils/discoveryMapper.js'
import { sanitizeDiscoveryResponse } from './src/utils/sanitizer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load the Discovery V1 schema
const schemaPath = join(__dirname, 'schemas', 'flypost-discovery-v1.schema.json')
const discoverySchema = JSON.parse(readFileSync(schemaPath, 'utf8'))

// Initialize Ajv validator with 2020-12 schema support (strict mode enabled)
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateDiscoveryResponse = ajv.compile(discoverySchema)

console.log('🧪 End-to-End Discovery V1 Protocol Test\n')
console.log('==========================================\n')

// Simulate stored events with hash values
const storedEvents = [
  {
    // Valid Layer 1 (Registry) data
    flypost: {
      eventId: 'evt_demo_001',
      category: 'open-houses'
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
      category: 'garage-sales'
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
      },
      geo: {
        latitude: 34.1478,
        longitude: -118.1445
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

// Step 1: Apply Discovery V1 mapper
console.log('Step 1: Apply Discovery V1 Protocol Mapper')
console.log('-------------------------------------------')
const discoveryEvents = toDiscoveryEventsV1(storedEvents)

console.log(`✅ Mapped ${discoveryEvents.length} events to Discovery V1 format`)

if (discoveryEvents.length > 0) {
  console.log('\nEvent 1 structure:')
  console.log('  - eventId:', discoveryEvents[0].eventId)
  console.log('  - dataHash:', discoveryEvents[0].dataHash?.substring(0, 16) + '...')
  console.log('  - what.type:', discoveryEvents[0].what.type)
  console.log('  - what.label:', discoveryEvents[0].what.label)
  console.log('  - where:', `lat ${discoveryEvents[0].where.latitude}, lng ${discoveryEvents[0].where.longitude}`)
  console.log('  - when.start:', discoveryEvents[0].when.start)
  console.log('  - externalListingUrl:', discoveryEvents[0].externalListingUrl)
}

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
  console.log('\n✅ No forbidden keys found in mapped events (strict stripping enforced)')
}

// Check M2M hardening: externalListingUrl and dataHash present, description absent, url field absent
console.log('\n✅ Verifying M2M Contract Hardening:')

if (discoveryEvents[0].externalListingUrl === 'https://www.zillow.com/homedetails/123-Oak-Street') {
  console.log('   ✅ Event 1 has externalListingUrl field: ' + discoveryEvents[0].externalListingUrl)
} else {
  console.log('   ❌ Event 1 missing externalListingUrl field')
}

if (!('url' in discoveryEvents[0])) {
  console.log('   ✅ Event 1 url field correctly absent (renamed to externalListingUrl)')
} else {
  console.log('   ❌ Event 1 should not have url field')
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

if (discoveryEvents[1].externalListingUrl === 'https://www.craigslist.org/garage-sale/456') {
  console.log('   ✅ Event 2 has externalListingUrl field: ' + discoveryEvents[1].externalListingUrl)
} else {
  console.log('   ❌ Event 2 missing externalListingUrl field')
}

if (!('url' in discoveryEvents[1])) {
  console.log('   ✅ Event 2 url field correctly absent (renamed to externalListingUrl)')
} else {
  console.log('   ❌ Event 2 should not have url field')
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
  protocol: 'flypost-discovery',
  version: 'v1',
  success: true,
  events: discoveryEvents,
  meta: {
    count: discoveryEvents.length
  }
}

// Apply sanitizer
response = sanitizeDiscoveryResponse(response)

console.log(`✅ Sanitizer processed response`)
console.log(`✅ Final response has ${response.events.length} events`)

// Step 3: Schema validation with Ajv
console.log('\n\nStep 3: Schema Validation with Ajv')
console.log('-----------------------------------')

const valid = validateDiscoveryResponse(response)

if (valid) {
  console.log('✅ Response passes strict schema validation')
  console.log('✅ Protocol: ' + response.protocol)
  console.log('✅ Version: ' + response.version)
} else {
  console.log('❌ Response fails schema validation:')
  for (const error of validateDiscoveryResponse.errors || []) {
    console.log(`   - ${error.instancePath}: ${error.message}`)
    if (error.params) {
      console.log(`     Params:`, JSON.stringify(error.params))
    }
  }
}

// Step 4: Verify protocol guarantees
console.log('\n\nStep 4: Verify Protocol Guarantees')
console.log('-----------------------------------')

let passed = 0
let failed = 0

// Check 1: Protocol metadata
if (response.protocol === 'flypost-discovery' && response.version === 'v1') {
  console.log('✅ Protocol metadata present and correct')
  passed++
} else {
  console.log('❌ Protocol metadata missing or incorrect')
  failed++
}

// Check 2: Required root fields
if (response.success && response.events && response.meta) {
  console.log('✅ All required root fields present')
  passed++
} else {
  console.log('❌ Missing required root fields')
  failed++
}

// Check 4: No forbidden keys in any event (including description)
let allClean = true
const forbiddenKeys = ['attendance', 'attendees', 'feedback', 'sentiment', 'insights', 'brokerageAffiliation', 'intelligenceScore', 'buyerToken', 'presenceProof', 'description', 'url']
for (const event of response.events) {
  if (!event.what || !event.where || !event.when) {
    console.log(`❌ Event ${event.eventId} missing what/where/when structure`)
    allEventsValid = false
    failed++
  }
  if (!event.eventId || !event.dataHash) {
    console.log(`❌ Event ${event.eventId} missing required fields`)
    allEventsValid = false
    failed++
  }
  if (!('externalListingUrl' in event)) {
    console.log(`❌ Event ${event.eventId} missing externalListingUrl field`)
    allEventsValid = false
    failed++
  }
  if ('url' in event) {
    console.log(`❌ Event ${event.eventId} has old url field (should be externalListingUrl)`)
    allClean = false
    failed++
  }
  for (const key of forbiddenKeys) {
    if (key in event) {
      console.log(`❌ Event ${event.eventId} has forbidden key: ${key}`)
      allClean = false
    }
  }
}

if (allClean) {
  console.log('✅ No forbidden Layer 2 keys in any event (including description)')
  passed++
}

// Check 4: No additional properties
if (valid) {
  console.log('✅ No additional properties detected (schema enforced)')
  passed++
} else {
  const hasAdditionalPropError = validateDiscoveryResponse.errors?.some(
    err => err.keyword === 'additionalProperties'
  )
  if (hasAdditionalPropError) {
    console.log('❌ Additional properties detected')
    failed++
  }
}

// Check 6: M2M Contract - externalListingUrl and dataHash present, url absent
console.log('\n✅ Verifying M2M Contract Fields:')
for (let i = 0; i < response.events.length; i++) {
  const event = response.events[i]
  
  if (event.externalListingUrl) {
    console.log(`✅ Event ${i + 1} has externalListingUrl field for hand-off`)
    passed++
  } else {
    console.log(`❌ Event ${i + 1} missing externalListingUrl field`)
    failed++
  }
  
  if (!('url' in event)) {
    console.log(`✅ Event ${i + 1} url field correctly absent`)
    passed++
  } else {
    console.log(`❌ Event ${i + 1} has old url field (should be externalListingUrl)`)
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
  console.log('M2M Contract Hardening: ✅ externalListingUrl present, ✅ dataHash present, ✅ description stripped')
  process.exit(0)
} else {
  console.log('\n❌ Some guarantees failed or schema validation failed!')
  process.exit(1)
}
