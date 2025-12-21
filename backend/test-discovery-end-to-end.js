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

// Initialize Ajv validator with 2020-12 schema support
const ajv = new Ajv2020({ allErrors: true, strict: false })
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
      value: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'
    },
    url: 'https://example.com/listing/123'
  },
  {
    flypost: {
      eventId: 'evt_demo_002',
      category: 'garage-sales'
    },
    name: 'Weekend Garage Sale',
    description: 'Items for sale', // This should be stripped
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
      value: '1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd'
    }
  }
]

console.log('📦 Simulating stored events\n')
console.log(`Event 1: ${storedEvents[0].name}`)
console.log(`Event 2: ${storedEvents[1].name}\n`)

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
  console.log('  - url:', discoveryEvents[0].url)
}

// Check for forbidden keys after mapping
const forbiddenKeys = ['description', 'organizer', 'price', 'beds', 'baths', 'photos', 'attendance', 'feedback', 'sentiment']
let foundForbidden = false
for (const event of discoveryEvents) {
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

// Step 2: Build response and apply sanitizer
console.log('\n\nStep 2: Build Response & Apply Sanitizer')
console.log('-----------------------------------------')

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

// Check 3: Event structure (what/where/when)
let allEventsValid = true
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
  if (!('url' in event)) {
    console.log(`❌ Event ${event.eventId} missing url field`)
    allEventsValid = false
    failed++
  }
}

if (allEventsValid) {
  console.log('✅ All events have valid what/where/when structure')
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

console.log('\n\nTest Summary')
console.log('============')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failed === 0 && valid) {
  console.log('\n✅ All protocol guarantees verified!')
  console.log('The Discovery V1 Protocol is successfully enforced end-to-end.')
  console.log('\n📋 Sample Response (first event):')
  console.log(JSON.stringify(response.events[0], null, 2))
  process.exit(0)
} else {
  console.log('\n❌ Some guarantees failed or schema validation failed!')
  process.exit(1)
}
