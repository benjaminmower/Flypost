/*
 * Test script to validate schema flexibility improvements
 * Tests that additional properties in flypost object are accepted
 * and that validation still enforces required fields
 */

import { validateEventData } from './src/validation.js'

// Base valid event for testing
const baseEvent = {
  "@context": "https://schema.org",
  "@type": "Event",
  "flypost": {
    "eventId": "evt_test_123456789",
    "category": "garage-sales",
    "realTimeData": true,
    "crawlable": true,
    "queryable": true,
    "submissionTimestamp": new Date().toISOString()
  },
  "name": "Test Event",
  "description": "Test event for schema flexibility validation",
  "startDate": "2025-01-04T08:00:00.000Z",
  "location": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Main Street"
    }
  },
  "organizer": {
    "@type": "Person",
    "name": "John Smith"
  }
}

function testFlypostWithAdditionalProperties() {
  console.log('\n🧪 Testing flypost object with additional properties...')
  
  const eventWithAdditionalProps = {
    ...baseEvent,
    flypost: {
      ...baseEvent.flypost,
      // Additional properties from agents with rich natural-language inputs
      "agentMetadata": "Some metadata from agent",
      "customField1": "value1",
      "customField2": 12345,
      "nestedObject": {
        "key": "value"
      }
    }
  }
  
  const result = validateEventData(eventWithAdditionalProps)
  
  if (result.success) {
    console.log('✅ Event with additional flypost properties validates successfully')
    return true
  } else {
    console.error('❌ Validation failed for event with additional flypost properties:', result.errors)
    return false
  }
}

function testRootLevelAdditionalProperties() {
  console.log('\n🧪 Testing root-level additional properties for backward compatibility...')
  
  const eventWithRootProps = {
    ...baseEvent,
    // Additional root-level properties for backward compatibility
    "customRootField": "backward compat value",
    "legacyField": true
  }
  
  const result = validateEventData(eventWithRootProps)
  
  if (result.success) {
    console.log('✅ Event with additional root-level properties validates successfully')
    return true
  } else {
    console.error('❌ Validation failed for event with root-level additional properties:', result.errors)
    return false
  }
}

function testRequiredFieldsStillEnforced() {
  console.log('\n🧪 Testing that required fields are still enforced...')
  
  // Test missing eventId
  const eventMissingEventId = {
    ...baseEvent,
    flypost: {
      ...baseEvent.flypost,
      eventId: undefined
    }
  }
  delete eventMissingEventId.flypost.eventId
  
  const result1 = validateEventData(eventMissingEventId)
  
  if (!result1.success) {
    console.log('✅ Validation correctly fails for missing eventId')
  } else {
    console.error('❌ Validation should have failed for missing eventId')
    return false
  }
  
  // Test missing category
  const eventMissingCategory = {
    ...baseEvent,
    flypost: {
      ...baseEvent.flypost,
      category: undefined
    }
  }
  delete eventMissingCategory.flypost.category
  
  const result2 = validateEventData(eventMissingCategory)
  
  if (!result2.success) {
    console.log('✅ Validation correctly fails for missing category')
    return true
  } else {
    console.error('❌ Validation should have failed for missing category')
    return false
  }
}

function testInvalidRequiredFieldsRejected() {
  console.log('\n🧪 Testing that invalid required fields are rejected...')
  
  // Test invalid category value
  const eventInvalidCategory = {
    ...baseEvent,
    flypost: {
      ...baseEvent.flypost,
      category: "invalid-category"
    }
  }
  
  const result1 = validateEventData(eventInvalidCategory)
  
  if (!result1.success) {
    console.log('✅ Validation correctly fails for invalid category value')
  } else {
    console.error('❌ Validation should have failed for invalid category value')
    return false
  }
  
  // Test invalid eventId pattern
  const eventInvalidEventId = {
    ...baseEvent,
    flypost: {
      ...baseEvent.flypost,
      eventId: "invalid id with spaces!"
    }
  }
  
  const result2 = validateEventData(eventInvalidEventId)
  
  if (!result2.success) {
    console.log('✅ Validation correctly fails for invalid eventId pattern')
    return true
  } else {
    console.error('❌ Validation should have failed for invalid eventId pattern')
    return false
  }
}

function testCombinedAdditionalAndRequiredFields() {
  console.log('\n🧪 Testing combination of additional properties and required fields...')
  
  const complexEvent = {
    ...baseEvent,
    // Root-level additional properties
    "customRootField": "root value",
    "metadata": {
      "source": "agent-system",
      "version": "1.0"
    },
    flypost: {
      ...baseEvent.flypost,
      // Additional flypost properties
      "agentId": "agent-123",
      "processingMetadata": {
        "timestamp": new Date().toISOString(),
        "version": "2.0"
      },
      "tags": ["tag1", "tag2", "tag3"]
    }
  }
  
  const result = validateEventData(complexEvent)
  
  if (result.success) {
    console.log('✅ Complex event with multiple additional properties validates successfully')
    return true
  } else {
    console.error('❌ Validation failed for complex event:', result.errors)
    return false
  }
}

function testBackwardCompatibility() {
  console.log('\n🧪 Testing backward compatibility with legacy event formats...')
  
  // Simulate an event that might have been created with older schema
  const legacyEvent = {
    ...baseEvent,
    "legacyVersion": "3.0",
    "oldFormat": true,
    flypost: {
      ...baseEvent.flypost,
      "v3Metadata": "legacy data",
      "oldSystemId": "old-123"
    }
  }
  
  const result = validateEventData(legacyEvent)
  
  if (result.success) {
    console.log('✅ Legacy event format validates successfully (backward compatibility)')
    return true
  } else {
    console.error('❌ Validation failed for legacy event:', result.errors)
    return false
  }
}

function testRichNaturalLanguageInput() {
  console.log('\n🧪 Testing rich natural-language input scenario...')
  
  // Simulate what an agent might send with rich natural-language input
  const agentEvent = {
    ...baseEvent,
    flypost: {
      ...baseEvent.flypost,
      // Agent-specific metadata
      "agentType": "conversational-ai",
      "confidenceScore": 0.95,
      "extractedEntities": ["location", "date", "organizer"],
      "processingChain": ["nlp", "validation", "enrichment"],
      "sourceLanguage": "en-US",
      "originalInput": "There's a garage sale this Saturday at 123 Main Street",
      "enrichmentData": {
        "geocoded": true,
        "categorized": true,
        "validated": true
      }
    }
  }
  
  const result = validateEventData(agentEvent)
  
  if (result.success) {
    console.log('✅ Rich agent event with natural-language metadata validates successfully')
    return true
  } else {
    console.error('❌ Validation failed for rich agent event:', result.errors)
    return false
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Schema Flexibility Tests\n')
  
  try {
    const results = [
      testFlypostWithAdditionalProperties(),
      testRootLevelAdditionalProperties(),
      testRequiredFieldsStillEnforced(),
      testInvalidRequiredFieldsRejected(),
      testCombinedAdditionalAndRequiredFields(),
      testBackwardCompatibility(),
      testRichNaturalLanguageInput()
    ]
    
    const passed = results.filter(r => r).length
    const total = results.length
    
    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`)
    
    if (passed === total) {
      console.log('🎉 All schema flexibility tests passed!')
      console.log('✨ Schema now accepts additional properties while maintaining validation.')
    } else {
      console.log('❌ Some tests failed. Check implementation.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test error:', error)
    process.exit(1)
  }
}

// Run the tests
runTests()
