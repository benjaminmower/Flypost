#!/usr/bin/env node
/**
 * Test script for Discovery V1 Protocol Contract
 * Tests the strict what/where/when M2M Oracle schema enforcement
 */

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { toDiscoveryEventV1, toDiscoveryEventsV1, normalizeCategory } from './src/utils/discoveryMapper.js'
import { sanitizeDiscoveryResponse, _internal } from './src/utils/sanitizer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load the Discovery V1 schema
const schemaPath = join(__dirname, 'schemas', 'flypost-discovery-v1.schema.json')
const discoverySchema = JSON.parse(readFileSync(schemaPath, 'utf8'))

// Initialize Ajv validator with 2020-12 schema support (strict mode enabled)
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateDiscoveryResponse = ajv.compile(discoverySchema)

console.log('🧪 Testing Discovery V1 Protocol Contract\n')
console.log('==========================================\n')

/**
 * Test 1: Discovery V1 mapping produces valid schema-compliant output
 */
function testDiscoveryV1Mapping() {
  console.log('Test 1: Discovery V1 Mapping - Schema Validation')
  console.log('------------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  const mockEvent = {
    id: 'evt_test_123',
    flypost: {
      eventId: 'evt_test_123',
      category: 'open_house'
    },
    name: 'Test Open House',
    description: 'A wonderful open house event', // Should be stripped
    url: 'https://www.zillow.com/homedetails/123-Main-St',
    startDate: '2025-01-15T10:00:00Z',
    endDate: '2025-01-15T14:00:00Z',
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
      algorithm: 'SHA-256',
      encoding: 'hex',
      value: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      canonicalVersion: 1
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(mockEvent)
  
  if (!discoveryEvent) {
    console.log('   ❌ Mapper returned null')
    failed++
    console.log(`\n   Summary: ${passed} passed, ${failed} failed`)
    console.log('')
    return false
  }
  
  // Check structure matches what/where/when
  if (discoveryEvent.what && discoveryEvent.where && discoveryEvent.when) {
    console.log('   ✅ Has what/where/when structure')
    passed++
  } else {
    console.log('   ❌ Missing what/where/when structure')
    failed++
  }
  
  // Check required fields according to Discovery v1 schema
  const checks = [
    { field: 'eventId', expected: 'evt_test_123', actual: discoveryEvent.eventId },
    { field: 'what.type', expected: 'open_house', actual: discoveryEvent.what?.type },
    { field: 'what.label', expected: 'Test Open House', actual: discoveryEvent.what?.label },
    { field: 'when.start', expected: '2025-01-15T10:00:00.000Z', actual: discoveryEvent.when?.start },
    { field: 'when.end', expected: '2025-01-15T14:00:00.000Z', actual: discoveryEvent.when?.end }
  ]
  
  for (const check of checks) {
    if (check.actual === check.expected) {
      console.log(`   ✅ ${check.field}: ${check.actual}`)
      passed++
    } else {
      console.log(`   ❌ ${check.field}: Expected ${check.expected}, got ${check.actual}`)
      failed++
    }
  }
  
  // Check NEW M2M fields
  
  // Check externalListingUrl field is present
  if (discoveryEvent.externalListingUrl === 'https://www.zillow.com/homedetails/123-Main-St') {
    console.log(`   ✅ externalListingUrl: ${discoveryEvent.externalListingUrl}`)
    passed++
  } else {
    console.log(`   ❌ externalListingUrl: Expected https://www.zillow.com/homedetails/123-Main-St, got ${discoveryEvent.externalListingUrl}`)
    failed++
  }
  
  // Check old url field is NOT present
  if (!('url' in discoveryEvent)) {
    console.log('   ✅ url field correctly absent (renamed to externalListingUrl)')
    passed++
  } else {
    console.log(`   ❌ url field should not exist: ${discoveryEvent.url}`)
    failed++
  }
  
  // Check dataHash field is present
  if (discoveryEvent.dataHash === 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890') {
    console.log(`   ✅ dataHash: ${discoveryEvent.dataHash.substring(0, 16)}...`)
    passed++
  } else {
    console.log(`   ❌ dataHash: Missing or incorrect`)
    failed++
  }
  
  // Check description is ABSENT (hardened contract strips fluff)
  if (!('description' in discoveryEvent)) {
    console.log('   ✅ description: Correctly stripped (M2M hardening)')
    passed++
  } else {
    console.log(`   ❌ description: Should be stripped but found: ${discoveryEvent.description}`)
    failed++
  }
  
  // Check address structure in where
  if (discoveryEvent.where?.address && discoveryEvent.where.address.includes('123 Main St')) {
    console.log('   ✅ where.address includes street address')
    passed++
  } else {
    console.log('   ❌ where.address missing street address')
    failed++
  }
  
  // Check forbidden fields are NOT present
  const forbiddenFields = ['description', 'organizer', 'price', 'beds', 'baths', 'photos', 'eventIdentity', 'submissionTimestamp', 'category', 'startDate', 'endDate', 'name']
  let allStripped = true
  for (const field of forbiddenFields) {
    if (field in discoveryEvent) {
      console.log(`   ❌ Forbidden field present: ${field}`)
      failed++
      allStripped = false
    }
  }
  
  if (allStripped) {
    console.log('   ✅ All forbidden fields stripped')
    passed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${checks.length + 5} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 2: externalListingUrl and DataHash fields (M2M hardening)
 */
function testUrlAndDataHash() {
  console.log('Test 2: externalListingUrl and DataHash Fields (M2M Contract)')
  console.log('-------------------------------------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Test with url and hash
  const eventWithUrl = {
    flypost: {
      eventId: 'evt_test_456',
      category: 'open_house'
    },
    url: 'https://www.redfin.com/property/123',
    startDate: '2025-01-15T10:00:00Z',
    endDate: '2025-01-15T14:00:00Z',
    location: {
      geo: {
        latitude: 34.0522,
        longitude: -118.2437
      }
    },
    hash: {
      algorithm: 'SHA-256',
      encoding: 'hex',
      value: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      canonicalVersion: 1
    }
  }
  
  const discoveryEvent = toDiscoveryEventV1(eventWithUrl)
  
  // Check externalListingUrl is present
  if (discoveryEvent.externalListingUrl === 'https://www.redfin.com/property/123') {
    console.log('   ✅ externalListingUrl field preserved correctly')
    passed++
  } else {
    console.log(`   ❌ externalListingUrl field missing or incorrect: ${discoveryEvent.externalListingUrl}`)
    failed++
  }
  
  // Check old url field does NOT exist
  if (!('url' in discoveryEvent)) {
    console.log('   ✅ url field correctly absent (renamed to externalListingUrl)')
    passed++
  } else {
    console.log(`   ❌ url field should not exist: ${discoveryEvent.url}`)
    failed++
  }
  
  // Check dataHash is present
  if (discoveryEvent.dataHash === '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef') {
    console.log('   ✅ dataHash field mapped from hash.value')
    passed++
  } else {
    console.log(`   ❌ dataHash field missing or incorrect: ${discoveryEvent.dataHash}`)
    failed++
  }
  
  // Test without url (should not break, but field must still exist as null)
  const eventWithoutUrl = {
    flypost: {
      eventId: 'evt_test_789',
      category: 'open_house'
    },
    startDate: '2025-01-15T10:00:00Z',
    endDate: '2025-01-15T14:00:00Z',
    location: {
      geo: {
        latitude: 34.0522,
        longitude: -118.2437
      }
    },
    hash: {
      algorithm: 'SHA-256',
      encoding: 'hex',
      value: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      canonicalVersion: 1
    },
    description: 'This should be ignored'
  }
  
  const discoveryEventNoUrl = toDiscoveryEventV1(eventWithoutUrl)
  
  // externalListingUrl must exist even when null (required field)
  if ('externalListingUrl' in discoveryEventNoUrl && discoveryEventNoUrl.externalListingUrl === null) {
    console.log('   ✅ externalListingUrl field exists as null when not provided')
    passed++
  } else {
    console.log('   ❌ externalListingUrl field must exist (even as null)')
    failed++
  }
  
  // url field should NOT exist
  if (!('url' in discoveryEventNoUrl)) {
    console.log('   ✅ url field correctly absent')
    passed++
  } else {
    console.log('   ❌ url field should not exist')
    failed++
  }
  
  // dataHash should be present since hash was provided
  if ('dataHash' in discoveryEventNoUrl && discoveryEventNoUrl.dataHash === 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890') {
    console.log('   ✅ dataHash field present and correct')
    passed++
  } else {
    console.log('   ❌ dataHash field missing or incorrect')
    failed++
  }
  
  // Verify description is stripped even when present
  if (!('description' in discoveryEventNoUrl)) {
    console.log('   ✅ Description correctly stripped (M2M hardening)')
    passed++
  } else {
    console.log(`   ❌ Description should be stripped: ${discoveryEventNoUrl.description}`)
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of 7 checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 3: Additional properties detection
 */
function testAdditionalPropertiesRejection() {
  console.log('Test 3: Additional Properties Detection')
  console.log('----------------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Create a response with additional properties
  const invalidResponse = {
    protocol: 'flypost-discovery',
    version: 'v1',
    success: true,
    events: [
      {
        eventId: 'evt_test_123',
        dataHash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        what: {
          type: 'open_house',
          label: 'Test'
        },
        where: {
          latitude: 34.05,
          longitude: -118.24
        },
        when: {
          start: '2025-01-20T10:00:00.000Z',
          end: '2025-01-20T14:00:00.000Z'
        },
        externalListingUrl: null,
        // Additional forbidden properties
        description: 'This should not be here',
        price: 500000
      }
    ],
    meta: {
      count: 1
    }
  }
  
  const valid = validateDiscoveryResponse(invalidResponse)
  
  if (!valid) {
    console.log('   ✅ Schema correctly rejects additional properties')
    passed++
    
    // Check that the error is about additional properties
    const hasAdditionalPropError = validateDiscoveryResponse.errors?.some(
      err => err.keyword === 'additionalProperties'
    )
    
    if (hasAdditionalPropError) {
      console.log('   ✅ Error identifies additionalProperties violation')
      passed++
    } else {
      console.log('   ❌ Error does not identify additionalProperties violation')
      failed++
    }
  } else {
    console.log('   ❌ Schema incorrectly accepts additional properties')
    failed++
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of 2 checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Test 4: Category normalization
 */
function testCategoryNormalization() {
  console.log('Test 4: Category Normalization')
  console.log('-------------------------------')
  
  let passed = 0
  let failed = 0
  
  const tests = [
    { input: 'open-houses', expected: 'open_house' },
    { input: 'garage-sale', expected: 'garage_sale' },
    { input: 'yard sales', expected: 'yard_sale' },
    { input: 'estate_sale', expected: 'estate_sale' },
    { input: 'moving sale', expected: 'moving_sale' },
    { input: 'unknown', expected: 'other' }
  ]
  
  for (const test of tests) {
    const result = normalizeCategory(test.input)
    if (result === test.expected) {
      console.log(`   ✅ "${test.input}" → "${result}"`)
      passed++
    } else {
      console.log(`   ❌ "${test.input}": Expected "${test.expected}", got "${result}"`)
      failed++
    }
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${tests.length} checks`)
  console.log('')
  
  return failed === 0
}

/**
 * Run all tests
 */
function runAllTests() {
  console.log('Starting Discovery V1 Protocol tests...\n')
  
  const results = []
  
  results.push(testDiscoveryV1Mapping())
  results.push(testUrlAndDataHash())
  results.push(testAdditionalPropertiesRejection())
  results.push(testCategoryNormalization())
  
  // Summary
  console.log('==========================================')
  console.log('Test Summary')
  console.log('==========================================')
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log(`\nPassed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('\n✅ All Discovery V1 Protocol tests passed!')
    console.log('The strict what/where/when M2M Oracle contract is enforced correctly.')
    process.exit(0)
  } else {
    console.log(`\n❌ ${total - passed} test(s) failed`)
    process.exit(1)
  }
}

// Run tests
runAllTests()
