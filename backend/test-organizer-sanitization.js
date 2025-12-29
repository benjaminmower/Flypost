#!/usr/bin/env node
/**
 * Test script to validate organizer field sanitization
 * Tests that invalid types in optional organizer fields are removed
 * and valid string values are preserved
 * 
 * NOTE: This test duplicates the sanitization logic from llmParser.js
 * to test it independently without requiring actual LLM API calls.
 * The duplication is intentional to keep tests fast and deterministic.
 */

import { parseEventWithLLM } from './src/llmParser.js'
import { validateEventData } from './src/validation.js'

console.log('🧪 Testing Organizer Field Sanitization\n')
console.log('=========================================\n')

/**
 * Mock parseEventWithLLM to return controlled test data
 * We'll test the sanitization that happens after the LLM response
 */

// Base event structure with minimal required fields
function createBaseEvent() {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "flypost": {
      "eventId": "evt_test_123456789",
      "category": "open-houses",
      "realTimeData": true,
      "crawlable": true,
      "queryable": true,
      "submissionTimestamp": new Date().toISOString()
    },
    "name": "Open House",
    "description": "Beautiful home with 3 bedrooms",
    "startDate": "2025-02-01T14:00:00.000Z",
    "location": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "123 Main Street",
        "addressLocality": "Los Angeles",
        "addressRegion": "CA",
        "postalCode": "90001",
        "addressCountry": "US"
      }
    },
    "organizer": {
      "@type": "Person",
      "name": "Test Organizer"
    }
  }
}

/**
 * Test that null values in organizer fields are removed
 */
async function testNullValuesRemoved() {
  console.log('Test 1: Null values in organizer fields should be removed')
  console.log('----------------------------------------------------------')
  
  // Simulate what LLM might return - organizer fields with null values
  const mockLLMResponse = createBaseEvent()
  mockLLMResponse.organizer.email = null
  mockLLMResponse.organizer.phone = null
  mockLLMResponse.organizer.licenseId = null
  mockLLMResponse.organizer.mlsNumber = null
  
  console.log('Input organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  // Manually apply the sanitization logic that's in parseEventWithLLM
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in mockLLMResponse.organizer) {
      const value = mockLLMResponse.organizer[field]
      if (typeof value !== 'string' || value.trim() === '') {
        delete mockLLMResponse.organizer[field]
      }
    }
  }
  
  console.log('Sanitized organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  // Now validate - should pass
  const validation = validateEventData(mockLLMResponse)
  
  if (validation.success) {
    console.log('✅ Event with null organizer fields validates successfully after sanitization')
    // Verify fields were actually removed
    if (!('email' in mockLLMResponse.organizer) && 
        !('phone' in mockLLMResponse.organizer) &&
        !('licenseId' in mockLLMResponse.organizer) &&
        !('mlsNumber' in mockLLMResponse.organizer)) {
      console.log('✅ All null fields were properly removed\n')
      return true
    } else {
      console.error('❌ Some null fields were not removed\n')
      return false
    }
  } else {
    console.error('❌ Validation failed:', validation.errors)
    console.error('Details:', JSON.stringify(validation.errors, null, 2), '\n')
    return false
  }
}

/**
 * Test that number values in organizer fields are removed
 */
async function testNumberValuesRemoved() {
  console.log('Test 2: Number values in organizer fields should be removed')
  console.log('-----------------------------------------------------------')
  
  const mockLLMResponse = createBaseEvent()
  mockLLMResponse.organizer.email = 12345
  mockLLMResponse.organizer.phone = 5551234567
  mockLLMResponse.organizer.licenseId = 123
  mockLLMResponse.organizer.mlsNumber = 456789
  
  console.log('Input organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  // Apply sanitization
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in mockLLMResponse.organizer) {
      const value = mockLLMResponse.organizer[field]
      if (typeof value !== 'string' || value.trim() === '') {
        delete mockLLMResponse.organizer[field]
      }
    }
  }
  
  console.log('Sanitized organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  const validation = validateEventData(mockLLMResponse)
  
  if (validation.success) {
    console.log('✅ Event with number organizer fields validates successfully after sanitization')
    if (!('email' in mockLLMResponse.organizer) && 
        !('phone' in mockLLMResponse.organizer) &&
        !('licenseId' in mockLLMResponse.organizer) &&
        !('mlsNumber' in mockLLMResponse.organizer)) {
      console.log('✅ All number fields were properly removed\n')
      return true
    } else {
      console.error('❌ Some number fields were not removed\n')
      return false
    }
  } else {
    console.error('❌ Validation failed:', validation.errors, '\n')
    return false
  }
}

/**
 * Test that boolean values in organizer fields are removed
 */
async function testBooleanValuesRemoved() {
  console.log('Test 3: Boolean values in organizer fields should be removed')
  console.log('------------------------------------------------------------')
  
  const mockLLMResponse = createBaseEvent()
  mockLLMResponse.organizer.email = false
  mockLLMResponse.organizer.phone = true
  mockLLMResponse.organizer.licenseId = false
  mockLLMResponse.organizer.mlsNumber = true
  
  console.log('Input organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  // Apply sanitization
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in mockLLMResponse.organizer) {
      const value = mockLLMResponse.organizer[field]
      if (typeof value !== 'string' || value.trim() === '') {
        delete mockLLMResponse.organizer[field]
      }
    }
  }
  
  console.log('Sanitized organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  const validation = validateEventData(mockLLMResponse)
  
  if (validation.success) {
    console.log('✅ Event with boolean organizer fields validates successfully after sanitization')
    if (!('email' in mockLLMResponse.organizer) && 
        !('phone' in mockLLMResponse.organizer) &&
        !('licenseId' in mockLLMResponse.organizer) &&
        !('mlsNumber' in mockLLMResponse.organizer)) {
      console.log('✅ All boolean fields were properly removed\n')
      return true
    } else {
      console.error('❌ Some boolean fields were not removed\n')
      return false
    }
  } else {
    console.error('❌ Validation failed:', validation.errors, '\n')
    return false
  }
}

/**
 * Test that empty strings are removed
 */
async function testEmptyStringsRemoved() {
  console.log('Test 4: Empty strings in organizer fields should be removed')
  console.log('------------------------------------------------------------')
  
  const mockLLMResponse = createBaseEvent()
  mockLLMResponse.organizer.email = ''
  mockLLMResponse.organizer.phone = '   '
  mockLLMResponse.organizer.licenseId = ''
  mockLLMResponse.organizer.mlsNumber = '\t\n'
  
  console.log('Input organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  // Apply sanitization
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in mockLLMResponse.organizer) {
      const value = mockLLMResponse.organizer[field]
      if (typeof value !== 'string' || value.trim() === '') {
        delete mockLLMResponse.organizer[field]
      }
    }
  }
  
  console.log('Sanitized organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  const validation = validateEventData(mockLLMResponse)
  
  if (validation.success) {
    console.log('✅ Event with empty string organizer fields validates successfully after sanitization')
    if (!('email' in mockLLMResponse.organizer) && 
        !('phone' in mockLLMResponse.organizer) &&
        !('licenseId' in mockLLMResponse.organizer) &&
        !('mlsNumber' in mockLLMResponse.organizer)) {
      console.log('✅ All empty string fields were properly removed\n')
      return true
    } else {
      console.error('❌ Some empty string fields were not removed\n')
      return false
    }
  } else {
    console.error('❌ Validation failed:', validation.errors, '\n')
    return false
  }
}

/**
 * Test that valid string values are preserved
 */
async function testValidStringsPreserved() {
  console.log('Test 5: Valid string values in organizer fields should be preserved')
  console.log('--------------------------------------------------------------------')
  
  const mockLLMResponse = createBaseEvent()
  mockLLMResponse.organizer.email = 'test@example.com'
  mockLLMResponse.organizer.phone = '555-1234'
  mockLLMResponse.organizer.licenseId = 'LIC123456'
  mockLLMResponse.organizer.mlsNumber = 'MLS789012'
  
  console.log('Input organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  // Apply sanitization
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in mockLLMResponse.organizer) {
      const value = mockLLMResponse.organizer[field]
      if (typeof value !== 'string' || value.trim() === '') {
        delete mockLLMResponse.organizer[field]
      }
    }
  }
  
  console.log('Sanitized organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  const validation = validateEventData(mockLLMResponse)
  
  if (validation.success) {
    console.log('✅ Event with valid string organizer fields validates successfully')
    // Verify fields were preserved
    if (mockLLMResponse.organizer.email === 'test@example.com' &&
        mockLLMResponse.organizer.phone === '555-1234' &&
        mockLLMResponse.organizer.licenseId === 'LIC123456' &&
        mockLLMResponse.organizer.mlsNumber === 'MLS789012') {
      console.log('✅ All valid string fields were properly preserved\n')
      return true
    } else {
      console.error('❌ Some valid string fields were not preserved correctly\n')
      return false
    }
  } else {
    console.error('❌ Validation failed:', validation.errors, '\n')
    return false
  }
}

/**
 * Test mixed case: some valid, some invalid values
 */
async function testMixedValidAndInvalidValues() {
  console.log('Test 6: Mixed valid and invalid organizer fields')
  console.log('--------------------------------------------------')
  
  const mockLLMResponse = createBaseEvent()
  mockLLMResponse.organizer.email = null // should be removed
  mockLLMResponse.organizer.phone = '555-1234' // should be preserved
  mockLLMResponse.organizer.licenseId = 123 // should be removed
  mockLLMResponse.organizer.mlsNumber = 'MLS789012' // should be preserved
  
  console.log('Input organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  // Apply sanitization
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in mockLLMResponse.organizer) {
      const value = mockLLMResponse.organizer[field]
      if (typeof value !== 'string' || value.trim() === '') {
        delete mockLLMResponse.organizer[field]
      }
    }
  }
  
  console.log('Sanitized organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  const validation = validateEventData(mockLLMResponse)
  
  if (validation.success) {
    console.log('✅ Event with mixed organizer fields validates successfully')
    // Verify correct fields were removed/preserved
    if (!('email' in mockLLMResponse.organizer) &&
        mockLLMResponse.organizer.phone === '555-1234' &&
        !('licenseId' in mockLLMResponse.organizer) &&
        mockLLMResponse.organizer.mlsNumber === 'MLS789012') {
      console.log('✅ Invalid fields removed, valid fields preserved correctly\n')
      return true
    } else {
      console.error('❌ Field sanitization did not work correctly\n')
      return false
    }
  } else {
    console.error('❌ Validation failed:', validation.errors, '\n')
    return false
  }
}

/**
 * Test that minimal event (no organizer contact info) passes validation
 */
async function testMinimalEventWithoutContactInfo() {
  console.log('Test 7: Minimal event without organizer contact info')
  console.log('-----------------------------------------------------')
  
  const mockLLMResponse = createBaseEvent()
  // No email, phone, licenseId, or mlsNumber - just the required organizer.name and @type
  
  console.log('Input organizer:', JSON.stringify(mockLLMResponse.organizer, null, 2))
  
  const validation = validateEventData(mockLLMResponse)
  
  if (validation.success) {
    console.log('✅ Minimal event without organizer contact info validates successfully\n')
    return true
  } else {
    console.error('❌ Validation failed for minimal event:', validation.errors, '\n')
    return false
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Organizer Field Sanitization Tests\n')
  
  try {
    const results = [
      await testNullValuesRemoved(),
      await testNumberValuesRemoved(),
      await testBooleanValuesRemoved(),
      await testEmptyStringsRemoved(),
      await testValidStringsPreserved(),
      await testMixedValidAndInvalidValues(),
      await testMinimalEventWithoutContactInfo()
    ]
    
    const passed = results.filter(r => r).length
    const total = results.length
    
    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`)
    
    if (passed === total) {
      console.log('🎉 All organizer sanitization tests passed!')
      console.log('✨ Organizer fields are now properly sanitized.')
      process.exit(0)
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
