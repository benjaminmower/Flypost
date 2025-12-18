#!/usr/bin/env node
/**
 * Test script for Layer-2 key removal at all ingress points
 * Verifies that parse-and-publish, upsert, and other write paths strip forbidden keys
 */

import { sanitizeEvent } from './src/utils/northStarEnforcer.js'

console.log('🧪 Testing Ingress Sanitization (North Star Enforcement)\n')
console.log('========================================================\n')

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  totalTests++
  if (condition) {
    console.log(`   ✅ ${message}`)
    passedTests++
  } else {
    console.log(`   ❌ ${message}`)
    failedTests++
  }
}

/**
 * Test 1: Parse-and-publish path sanitization
 */
function testParseAndPublishSanitization() {
  console.log('Test 1: Parse-and-Publish Path Sanitization')
  console.log('--------------------------------------------')
  
  // Simulate LLM parsed event with Layer-2 keys (should be stripped)
  const llmParsedEvent = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Open House',
    description: 'Beautiful home',
    startDate: '2025-01-15T10:00:00Z',
    location: {
      address: {
        streetAddress: '123 Main St',
        addressLocality: 'Los Angeles',
        addressRegion: 'CA'
      }
    },
    // Layer-2 keys that LLM might hallucinate (should be stripped)
    attendance: 50,
    attendees: ['Alice', 'Bob'],
    buyerToken: 'abc123',
    feedback: { liked: true },
    sentiment: 'positive',
    brokerageAffiliation: 'brokerage1',
    insights: { score: 95 },
    intelligenceData: { foo: 'bar' }
  }
  
  const sanitized = sanitizeEvent(llmParsedEvent)
  
  assert(!sanitized.hasOwnProperty('attendance'), 'Stripped "attendance"')
  assert(!sanitized.hasOwnProperty('attendees'), 'Stripped "attendees"')
  assert(!sanitized.hasOwnProperty('buyerToken'), 'Stripped "buyerToken"')
  assert(!sanitized.hasOwnProperty('feedback'), 'Stripped "feedback"')
  assert(!sanitized.hasOwnProperty('sentiment'), 'Stripped "sentiment"')
  assert(!sanitized.hasOwnProperty('brokerageAffiliation'), 'Stripped "brokerageAffiliation"')
  assert(!sanitized.hasOwnProperty('insights'), 'Stripped "insights"')
  assert(!sanitized.hasOwnProperty('intelligenceData'), 'Stripped "intelligenceData"')
  
  assert(sanitized.name === 'Open House', 'Preserved "name"')
  assert(sanitized.description === 'Beautiful home', 'Preserved "description"')
  assert(sanitized.startDate === '2025-01-15T10:00:00Z', 'Preserved "startDate"')
  
  console.log('')
}

/**
 * Test 2: Upsert path sanitization
 */
function testUpsertSanitization() {
  console.log('Test 2: Upsert Path Sanitization')
  console.log('---------------------------------')
  
  // Simulate structured event from external source with Layer-2 keys
  const externalEvent = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Estate Sale',
    description: 'Great items',
    startDate: '2025-01-20T09:00:00Z',
    location: {
      address: {
        streetAddress: '456 Oak Ave',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA'
      }
    },
    organizer: {
      '@type': 'Person',
      name: 'John Doe'
    },
    // Layer-2 keys from external source (should be stripped)
    presenceProof: { method: 'geo' },
    feedback: { disliked: false },
    sentiment: 'negative',
    brokerageAffiliation: 'external-brokerage',
    intelligence: 'secret-data'
  }
  
  const sanitized = sanitizeEvent(externalEvent)
  
  assert(!sanitized.hasOwnProperty('presenceProof'), 'Stripped "presenceProof"')
  assert(!sanitized.hasOwnProperty('feedback'), 'Stripped "feedback"')
  assert(!sanitized.hasOwnProperty('sentiment'), 'Stripped "sentiment"')
  assert(!sanitized.hasOwnProperty('brokerageAffiliation'), 'Stripped "brokerageAffiliation"')
  assert(!sanitized.hasOwnProperty('intelligence'), 'Stripped "intelligence"')
  
  assert(sanitized.name === 'Estate Sale', 'Preserved "name"')
  assert(sanitized.organizer.name === 'John Doe', 'Preserved "organizer.name"')
  
  console.log('')
}

/**
 * Test 3: Nested Layer-2 keys in ingress
 */
function testNestedLayerTwoKeys() {
  console.log('Test 3: Nested Layer-2 Keys in Ingress')
  console.log('---------------------------------------')
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Garage Sale',
    startDate: '2025-01-25T08:00:00Z',
    location: {
      address: {
        streetAddress: '789 Pine St',
        // Layer-2 key nested in location (should be stripped)
        attendance: 100,
        feedback: 'Great location'
      },
      // Another nested Layer-2 key
      sentiment: 'positive'
    },
    organizer: {
      name: 'Jane Smith',
      // Layer-2 keys nested in organizer
      buyerToken: 'xyz789',
      intelligenceProfile: { rating: 5 }
    }
  }
  
  const sanitized = sanitizeEvent(event)
  
  assert(!sanitized.location.address.hasOwnProperty('attendance'), 'Stripped nested "location.address.attendance"')
  assert(!sanitized.location.address.hasOwnProperty('feedback'), 'Stripped nested "location.address.feedback"')
  assert(!sanitized.location.hasOwnProperty('sentiment'), 'Stripped nested "location.sentiment"')
  assert(!sanitized.organizer.hasOwnProperty('buyerToken'), 'Stripped nested "organizer.buyerToken"')
  assert(!sanitized.organizer.hasOwnProperty('intelligenceProfile'), 'Stripped nested "organizer.intelligenceProfile"')
  
  assert(sanitized.location.address.streetAddress === '789 Pine St', 'Preserved nested allowed field')
  assert(sanitized.organizer.name === 'Jane Smith', 'Preserved nested allowed field')
  
  console.log('')
}

/**
 * Test 4: Layer-2 keys in arrays
 */
function testLayerTwoKeysInArrays() {
  console.log('Test 4: Layer-2 Keys in Arrays')
  console.log('-------------------------------')
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Community Event',
    startDate: '2025-02-01T10:00:00Z',
    // Custom array field (not schema.org standard, but should be processed)
    customAttendees: [
      {
        name: 'Alice',
        attendance: true,        // Layer-2 key in array item
        feedback: 'Great event'  // Layer-2 key in array item
      },
      {
        name: 'Bob',
        buyerToken: 'token123',  // Layer-2 key in array item
        sentiment: 'positive'    // Layer-2 key in array item
      }
    ]
  }
  
  const sanitized = sanitizeEvent(event)
  
  assert(Array.isArray(sanitized.customAttendees), 'Preserved array structure')
  assert(sanitized.customAttendees.length === 2, 'Preserved array length')
  assert(sanitized.customAttendees[0].name === 'Alice', 'Preserved allowed field in array item')
  assert(!sanitized.customAttendees[0].hasOwnProperty('attendance'), 'Stripped "attendance" in array item')
  assert(!sanitized.customAttendees[0].hasOwnProperty('feedback'), 'Stripped "feedback" in array item')
  assert(sanitized.customAttendees[1].name === 'Bob', 'Preserved allowed field in second array item')
  assert(!sanitized.customAttendees[1].hasOwnProperty('buyerToken'), 'Stripped "buyerToken" in array item')
  assert(!sanitized.customAttendees[1].hasOwnProperty('sentiment'), 'Stripped "sentiment" in array item')
  
  console.log('')
}

/**
 * Test 5: Case-insensitive stripping at ingress
 */
function testCaseInsensitiveIngress() {
  console.log('Test 5: Case-Insensitive Stripping at Ingress')
  console.log('----------------------------------------------')
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Test Event',
    startDate: '2025-03-01T12:00:00Z',
    // Various casing of Layer-2 keys
    Attendance: 50,
    ATTENDANCE: 60,
    BuyerToken: 'abc',
    BUYERTOKEN: 'def',
    Feedback: { liked: true },
    FEEDBACK: { disliked: false },
    Sentiment: 'positive',
    SENTIMENT: 'negative',
    IntelligenceData: { score: 95 },
    INTELLIGENCEDATA: { level: 5 }
  }
  
  const sanitized = sanitizeEvent(event)
  
  assert(!sanitized.hasOwnProperty('Attendance'), 'Stripped "Attendance"')
  assert(!sanitized.hasOwnProperty('ATTENDANCE'), 'Stripped "ATTENDANCE"')
  assert(!sanitized.hasOwnProperty('BuyerToken'), 'Stripped "BuyerToken"')
  assert(!sanitized.hasOwnProperty('BUYERTOKEN'), 'Stripped "BUYERTOKEN"')
  assert(!sanitized.hasOwnProperty('Feedback'), 'Stripped "Feedback"')
  assert(!sanitized.hasOwnProperty('FEEDBACK'), 'Stripped "FEEDBACK"')
  assert(!sanitized.hasOwnProperty('Sentiment'), 'Stripped "Sentiment"')
  assert(!sanitized.hasOwnProperty('SENTIMENT'), 'Stripped "SENTIMENT"')
  assert(!sanitized.hasOwnProperty('IntelligenceData'), 'Stripped "IntelligenceData"')
  assert(!sanitized.hasOwnProperty('INTELLIGENCEDATA'), 'Stripped "INTELLIGENCEDATA"')
  
  assert(sanitized.name === 'Test Event', 'Preserved allowed field')
  
  console.log('')
}

/**
 * Test 6: Complete list of forbidden keys
 */
function testCompleteForbiddenKeysList() {
  console.log('Test 6: Complete List of Forbidden Keys')
  console.log('----------------------------------------')
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Comprehensive Test',
    startDate: '2025-04-01T10:00:00Z',
    // All forbidden keys from North Star spec
    attendance: 1,
    attendees: [],
    buyerToken: 'x',
    presenceProof: {},
    feedback: {},
    sentiment: 'x',
    brokerageAffiliation: 'x',
    insights: {},
    intelligence: 'x',
    intelligenceFoo: 'x',
    intelligenceBar: 'x'
  }
  
  const sanitized = sanitizeEvent(event)
  
  assert(!sanitized.hasOwnProperty('attendance'), 'Stripped "attendance"')
  assert(!sanitized.hasOwnProperty('attendees'), 'Stripped "attendees"')
  assert(!sanitized.hasOwnProperty('buyerToken'), 'Stripped "buyerToken"')
  assert(!sanitized.hasOwnProperty('presenceProof'), 'Stripped "presenceProof"')
  assert(!sanitized.hasOwnProperty('feedback'), 'Stripped "feedback"')
  assert(!sanitized.hasOwnProperty('sentiment'), 'Stripped "sentiment"')
  assert(!sanitized.hasOwnProperty('brokerageAffiliation'), 'Stripped "brokerageAffiliation"')
  assert(!sanitized.hasOwnProperty('insights'), 'Stripped "insights"')
  assert(!sanitized.hasOwnProperty('intelligence'), 'Stripped "intelligence"')
  assert(!sanitized.hasOwnProperty('intelligenceFoo'), 'Stripped "intelligenceFoo"')
  assert(!sanitized.hasOwnProperty('intelligenceBar'), 'Stripped "intelligenceBar"')
  
  assert(sanitized.name === 'Comprehensive Test', 'Preserved allowed field')
  
  console.log('')
}

// Run all tests
testParseAndPublishSanitization()
testUpsertSanitization()
testNestedLayerTwoKeys()
testLayerTwoKeysInArrays()
testCaseInsensitiveIngress()
testCompleteForbiddenKeysList()

// Print summary
console.log('========================================================')
console.log(`\n📊 Test Summary:`)
console.log(`   Total: ${totalTests}`)
console.log(`   ✅ Passed: ${passedTests}`)
console.log(`   ❌ Failed: ${failedTests}`)
console.log('')

if (failedTests > 0) {
  console.log('❌ Some tests failed')
  process.exit(1)
} else {
  console.log('✅ All tests passed!')
  process.exit(0)
}
