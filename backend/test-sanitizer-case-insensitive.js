#!/usr/bin/env node
/**
 * Test script for case-insensitive sanitizer functionality
 * Tests that Layer-2 keys are stripped regardless of casing
 */

import { sanitizeDiscoveryResponse, _internal } from './src/utils/sanitizer.js'
import { sanitizeEvent } from './src/utils/northStarEnforcer.js'

console.log('🧪 Testing Case-Insensitive Sanitizer\n')
console.log('======================================\n')

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
 * Test 1: Case-insensitive stripping in sanitizeDiscoveryResponse
 */
function testSanitizerCaseInsensitive() {
  console.log('Test 1: Case-Insensitive Stripping in sanitizeDiscoveryResponse')
  console.log('---------------------------------------------------------------')
  
  const payload = {
    success: true,
    events: [
      {
        eventId: 'evt_123',
        name: 'Test Event',
        attendance: 50,           // lowercase - should be stripped
        Attendance: 60,           // capitalized - should be stripped
        ATTENDANCE: 70,           // uppercase - should be stripped
        buyerToken: 'abc',        // lowercase - should be stripped
        BuyerToken: 'def',        // capitalized - should be stripped
        feedback: { liked: true }, // lowercase - should be stripped
        Feedback: { liked: false }, // capitalized - should be stripped
        presenceProof: {},        // lowercase - should be stripped
        PresenceProof: {},        // capitalized - should be stripped
        sentiment: 'positive',    // lowercase - should be stripped
        Sentiment: 'negative',    // capitalized - should be stripped
        brokerageAffiliation: 'brok1', // lowercase - should be stripped
        BrokerageAffiliation: 'brok2', // capitalized - should be stripped
        intelligence: 'data',     // lowercase - should be stripped
        Intelligence: 'data2',    // capitalized - should be stripped
        intelligenceScore: 95,    // starts with intelligence - should be stripped
        IntelligenceLevel: 5,     // starts with intelligence - should be stripped
        // These should remain
        category: 'open_house',
        startDate: '2025-01-15T10:00:00Z'
      }
    ]
  }
  
  const sanitized = sanitizeDiscoveryResponse(payload)
  const event = sanitized.events[0]
  
  // Check that forbidden keys were stripped
  assert(!event.hasOwnProperty('attendance'), 'Stripped lowercase "attendance"')
  assert(!event.hasOwnProperty('Attendance'), 'Stripped capitalized "Attendance"')
  assert(!event.hasOwnProperty('ATTENDANCE'), 'Stripped uppercase "ATTENDANCE"')
  assert(!event.hasOwnProperty('buyerToken'), 'Stripped lowercase "buyerToken"')
  assert(!event.hasOwnProperty('BuyerToken'), 'Stripped capitalized "BuyerToken"')
  assert(!event.hasOwnProperty('feedback'), 'Stripped lowercase "feedback"')
  assert(!event.hasOwnProperty('Feedback'), 'Stripped capitalized "Feedback"')
  assert(!event.hasOwnProperty('presenceProof'), 'Stripped lowercase "presenceProof"')
  assert(!event.hasOwnProperty('PresenceProof'), 'Stripped capitalized "PresenceProof"')
  assert(!event.hasOwnProperty('sentiment'), 'Stripped lowercase "sentiment"')
  assert(!event.hasOwnProperty('Sentiment'), 'Stripped capitalized "Sentiment"')
  assert(!event.hasOwnProperty('brokerageAffiliation'), 'Stripped lowercase "brokerageAffiliation"')
  assert(!event.hasOwnProperty('BrokerageAffiliation'), 'Stripped capitalized "BrokerageAffiliation"')
  assert(!event.hasOwnProperty('intelligence'), 'Stripped lowercase "intelligence"')
  assert(!event.hasOwnProperty('Intelligence'), 'Stripped capitalized "Intelligence"')
  assert(!event.hasOwnProperty('intelligenceScore'), 'Stripped "intelligenceScore"')
  assert(!event.hasOwnProperty('IntelligenceLevel'), 'Stripped "IntelligenceLevel"')
  
  // Check that allowed keys remain
  assert(event.category === 'open_house', 'Preserved "category"')
  assert(event.startDate === '2025-01-15T10:00:00Z', 'Preserved "startDate"')
  assert(event.eventId === 'evt_123', 'Preserved "eventId"')
  assert(event.name === 'Test Event', 'Preserved "name"')
  
  console.log('')
}

/**
 * Test 2: Nested objects stripping
 */
function testNestedObjectStripping() {
  console.log('Test 2: Nested Object Stripping (Case-Insensitive)')
  console.log('--------------------------------------------------')
  
  const payload = {
    success: true,
    events: [
      {
        eventId: 'evt_456',
        location: {
          address: {
            street: '123 Main St',
            feedback: 'should be stripped',     // nested forbidden key
            Sentiment: 'positive'                // nested forbidden key
          },
          attendance: 100                        // nested forbidden key
        },
        organizer: {
          name: 'John Doe',
          BuyerToken: 'xyz',                     // nested forbidden key
          IntelligenceData: { score: 50 }        // nested forbidden key
        }
      }
    ]
  }
  
  const sanitized = sanitizeDiscoveryResponse(payload)
  const event = sanitized.events[0]
  
  assert(event.location.address.street === '123 Main St', 'Preserved nested allowed field')
  assert(!event.location.address.hasOwnProperty('feedback'), 'Stripped nested "feedback"')
  assert(!event.location.address.hasOwnProperty('Sentiment'), 'Stripped nested "Sentiment"')
  assert(!event.location.hasOwnProperty('attendance'), 'Stripped nested "attendance"')
  assert(event.organizer.name === 'John Doe', 'Preserved nested allowed field')
  assert(!event.organizer.hasOwnProperty('BuyerToken'), 'Stripped nested "BuyerToken"')
  assert(!event.organizer.hasOwnProperty('IntelligenceData'), 'Stripped nested "IntelligenceData"')
  
  console.log('')
}

/**
 * Test 3: Array handling
 */
function testArrayHandling() {
  console.log('Test 3: Array Handling (Case-Insensitive)')
  console.log('------------------------------------------')
  
  const payload = {
    success: true,
    events: [
      {
        eventId: 'evt_789',
        attendeesList: [                         // This key itself should be preserved
          {
            name: 'Alice',
            Attendance: true,                    // forbidden key in array item
            feedback: 'great'                    // forbidden key in array item
          },
          {
            name: 'Bob',
            BuyerToken: 'token123',              // forbidden key in array item
            IntelligenceScore: 88                // forbidden key in array item
          }
        ]
      }
    ]
  }
  
  const sanitized = sanitizeDiscoveryResponse(payload)
  const event = sanitized.events[0]
  
  assert(Array.isArray(event.attendeesList), 'Preserved array structure')
  assert(event.attendeesList.length === 2, 'Preserved array length')
  assert(event.attendeesList[0].name === 'Alice', 'Preserved allowed field in array item')
  assert(!event.attendeesList[0].hasOwnProperty('Attendance'), 'Stripped "Attendance" in array item')
  assert(!event.attendeesList[0].hasOwnProperty('feedback'), 'Stripped "feedback" in array item')
  assert(event.attendeesList[1].name === 'Bob', 'Preserved allowed field in second array item')
  assert(!event.attendeesList[1].hasOwnProperty('BuyerToken'), 'Stripped "BuyerToken" in array item')
  assert(!event.attendeesList[1].hasOwnProperty('IntelligenceScore'), 'Stripped "IntelligenceScore" in array item')
  
  console.log('')
}

/**
 * Test 4: North Star Enforcer case-insensitive stripping
 */
function testNorthStarEnforcerCaseInsensitive() {
  console.log('Test 4: North Star Enforcer Case-Insensitive Stripping')
  console.log('------------------------------------------------------')
  
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Test Event',
    attendance: 50,                              // should be stripped
    Attendees: ['Alice', 'Bob'],                 // should be stripped
    buyerToken: 'abc123',                        // should be stripped
    BuyerToken: 'def456',                        // should be stripped
    feedback: { liked: true },                   // should be stripped
    Feedback: { disliked: false },               // should be stripped
    presenceProof: { method: 'geo' },            // should be stripped
    PresenceProof: { method: 'qr' },             // should be stripped
    sentiment: 'positive',                       // should be stripped
    Sentiment: 'negative',                       // should be stripped
    brokerageAffiliation: 'brokerage1',          // should be stripped
    BrokerageAffiliation: 'brokerage2',          // should be stripped
    insights: { score: 95 },                     // should be stripped
    Insights: { level: 5 },                      // should be stripped
    intelligence: 'data',                        // should be stripped
    Intelligence: 'data2',                       // should be stripped
    intelligenceMetadata: { foo: 'bar' },        // should be stripped
    IntelligenceScore: 88,                       // should be stripped
    // These should remain
    startDate: '2025-01-15T10:00:00Z',
    location: {
      address: {
        street: '123 Main St',
        feedback: 'nested forbidden'             // nested, should be stripped
      }
    }
  }
  
  const sanitized = sanitizeEvent(event)
  
  assert(!sanitized.hasOwnProperty('attendance'), 'Stripped "attendance"')
  assert(!sanitized.hasOwnProperty('Attendees'), 'Stripped "Attendees"')
  assert(!sanitized.hasOwnProperty('buyerToken'), 'Stripped "buyerToken"')
  assert(!sanitized.hasOwnProperty('BuyerToken'), 'Stripped "BuyerToken"')
  assert(!sanitized.hasOwnProperty('feedback'), 'Stripped "feedback"')
  assert(!sanitized.hasOwnProperty('Feedback'), 'Stripped "Feedback"')
  assert(!sanitized.hasOwnProperty('presenceProof'), 'Stripped "presenceProof"')
  assert(!sanitized.hasOwnProperty('PresenceProof'), 'Stripped "PresenceProof"')
  assert(!sanitized.hasOwnProperty('sentiment'), 'Stripped "sentiment"')
  assert(!sanitized.hasOwnProperty('Sentiment'), 'Stripped "Sentiment"')
  assert(!sanitized.hasOwnProperty('brokerageAffiliation'), 'Stripped "brokerageAffiliation"')
  assert(!sanitized.hasOwnProperty('BrokerageAffiliation'), 'Stripped "BrokerageAffiliation"')
  assert(!sanitized.hasOwnProperty('insights'), 'Stripped "insights"')
  assert(!sanitized.hasOwnProperty('Insights'), 'Stripped "Insights"')
  assert(!sanitized.hasOwnProperty('intelligence'), 'Stripped "intelligence"')
  assert(!sanitized.hasOwnProperty('Intelligence'), 'Stripped "Intelligence"')
  assert(!sanitized.hasOwnProperty('intelligenceMetadata'), 'Stripped "intelligenceMetadata"')
  assert(!sanitized.hasOwnProperty('IntelligenceScore'), 'Stripped "IntelligenceScore"')
  
  assert(sanitized['@context'] === 'https://schema.org', 'Preserved "@context"')
  assert(sanitized['@type'] === 'Event', 'Preserved "@type"')
  assert(sanitized.name === 'Test Event', 'Preserved "name"')
  assert(sanitized.startDate === '2025-01-15T10:00:00Z', 'Preserved "startDate"')
  assert(sanitized.location.address.street === '123 Main St', 'Preserved nested allowed field')
  assert(!sanitized.location.address.hasOwnProperty('feedback'), 'Stripped nested "feedback"')
  
  console.log('')
}

/**
 * Test 5: Edge cases
 */
function testEdgeCases() {
  console.log('Test 5: Edge Cases')
  console.log('------------------')
  
  // Test null and undefined
  assert(sanitizeDiscoveryResponse(null) === null, 'Handles null input')
  assert(sanitizeDiscoveryResponse(undefined) === undefined, 'Handles undefined input')
  
  // Test empty object
  const empty = sanitizeDiscoveryResponse({})
  assert(typeof empty === 'object' && Object.keys(empty).length === 0, 'Handles empty object')
  
  // Test empty array
  const emptyArr = sanitizeDiscoveryResponse([])
  assert(Array.isArray(emptyArr) && emptyArr.length === 0, 'Handles empty array')
  
  // Test primitives
  assert(sanitizeDiscoveryResponse('string') === 'string', 'Handles string primitive')
  assert(sanitizeDiscoveryResponse(123) === 123, 'Handles number primitive')
  assert(sanitizeDiscoveryResponse(true) === true, 'Handles boolean primitive')
  
  console.log('')
}

// Run all tests
testSanitizerCaseInsensitive()
testNestedObjectStripping()
testArrayHandling()
testNorthStarEnforcerCaseInsensitive()
testEdgeCases()

// Print summary
console.log('========================================')
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
