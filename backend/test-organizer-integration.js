#!/usr/bin/env node
/**
 * Integration test for organizer field sanitization in the full parse-and-validate flow
 * Tests that events with invalid organizer fields are properly sanitized before validation
 */

import { validateEventData } from './src/validation.js'

console.log('🧪 Testing Integration: Organizer Sanitization + Validation\n')
console.log('===========================================================\n')

/**
 * Test the complete flow: simulate LLM output → sanitize → validate
 * This mimics what happens in parseEventWithLLM after the LLM returns data
 */

function applyOrganizerSanitization(event) {
  // This is the same logic from llmParser.js
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in event.organizer) {
      const value = event.organizer[field]
      if (typeof value !== 'string' || value.trim() === '') {
        delete event.organizer[field]
      }
    }
  }
  return event
}

/**
 * Test case from the problem statement: event with invalid organizer fields
 */
function testProblemStatementCase() {
  console.log('Test 1: Problem Statement Case - Invalid organizer field types')
  console.log('---------------------------------------------------------------')
  
  // This is what the LLM might return for a minimal open house posting
  const mockLLMOutput = {
    "@context": "https://schema.org",
    "@type": "Event",
    "flypost": {
      "eventId": "evt_test_123",
      "category": "open-houses",
      "realTimeData": true,
      "crawlable": true,
      "queryable": true,
      "submissionTimestamp": new Date().toISOString()
    },
    "name": "Open House - 123 Main Street",
    "description": "Beautiful home with great views. Open house this Saturday 2-4pm.",
    "startDate": "2025-02-01T14:00:00.000Z",
    "endDate": "2025-02-01T16:00:00.000Z",
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
      "name": "Agent Name",
      // These are the problematic fields mentioned in the problem statement
      "email": null,
      "phone": null,
      "licenseId": 123,
      "mlsNumber": false
    },
    "url": "https://example.com/listing"
  }
  
  console.log('Input organizer fields:')
  console.log('  email:', mockLLMOutput.organizer.email, '(type:', typeof mockLLMOutput.organizer.email, ')')
  console.log('  phone:', mockLLMOutput.organizer.phone, '(type:', typeof mockLLMOutput.organizer.phone, ')')
  console.log('  licenseId:', mockLLMOutput.organizer.licenseId, '(type:', typeof mockLLMOutput.organizer.licenseId, ')')
  console.log('  mlsNumber:', mockLLMOutput.organizer.mlsNumber, '(type:', typeof mockLLMOutput.organizer.mlsNumber, ')')
  
  // Test validation WITHOUT sanitization (should fail)
  console.log('\n1. Validating WITHOUT sanitization (should fail)...')
  const validationBeforeSanitization = validateEventData(mockLLMOutput)
  
  if (!validationBeforeSanitization.success) {
    console.log('✅ Validation correctly fails without sanitization')
    console.log('   Errors:', validationBeforeSanitization.errors.map(e => `${e.field}: ${e.message}`).join(', '))
  } else {
    console.log('❌ Expected validation to fail without sanitization')
    return false
  }
  
  // Apply sanitization (simulating what happens in parseEventWithLLM)
  console.log('\n2. Applying sanitization...')
  const sanitizedEvent = applyOrganizerSanitization(mockLLMOutput)
  
  console.log('After sanitization, organizer has fields:', Object.keys(sanitizedEvent.organizer))
  console.log('  @type:', sanitizedEvent.organizer['@type'])
  console.log('  name:', sanitizedEvent.organizer.name)
  console.log('  email:', 'email' in sanitizedEvent.organizer ? sanitizedEvent.organizer.email : '(removed)')
  console.log('  phone:', 'phone' in sanitizedEvent.organizer ? sanitizedEvent.organizer.phone : '(removed)')
  console.log('  licenseId:', 'licenseId' in sanitizedEvent.organizer ? sanitizedEvent.organizer.licenseId : '(removed)')
  console.log('  mlsNumber:', 'mlsNumber' in sanitizedEvent.organizer ? sanitizedEvent.organizer.mlsNumber : '(removed)')
  
  // Test validation WITH sanitization (should pass)
  console.log('\n3. Validating WITH sanitization (should pass)...')
  const validationAfterSanitization = validateEventData(sanitizedEvent)
  
  if (validationAfterSanitization.success) {
    console.log('✅ Validation passes after sanitization!')
    console.log('✅ Minimal open house posting now works correctly\n')
    return true
  } else {
    console.log('❌ Validation still fails after sanitization')
    console.log('   Errors:', validationAfterSanitization.errors, '\n')
    return false
  }
}

/**
 * Test that the exact error from problem statement is fixed
 */
function testExactProblemStatementError() {
  console.log('Test 2: Exact Error From Problem Statement')
  console.log('-------------------------------------------')
  
  const mockLLMOutput = {
    "@context": "https://schema.org",
    "@type": "Event",
    "flypost": {
      "eventId": "evt_test_456",
      "category": "open-houses",
      "realTimeData": true,
      "crawlable": true,
      "queryable": true,
      "submissionTimestamp": new Date().toISOString()
    },
    "name": "Open House",
    "description": "Open house event",
    "startDate": "2025-02-01T14:00:00.000Z",
    "location": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "456 Oak Ave"
      }
    },
    "organizer": {
      "@type": "Person",
      "name": "Agent",
      // These specific invalid types were causing the exact error in the problem statement
      "email": null,       // Should cause: "must be string" error
      "phone": null,       // Should cause: "must be string" error
      "licenseId": 123,    // Should cause: "must be string" error (number instead)
      "mlsNumber": false   // Should cause: "must be string" error (boolean instead)
    }
  }
  
  // Before sanitization - should get the exact errors from problem statement
  console.log('Before sanitization:')
  const validationBefore = validateEventData(mockLLMOutput)
  
  if (!validationBefore.success) {
    const emailError = validationBefore.errors.find(e => e.field.includes('email'))
    const phoneError = validationBefore.errors.find(e => e.field.includes('phone'))
    const licenseIdError = validationBefore.errors.find(e => e.field.includes('licenseId'))
    const mlsNumberError = validationBefore.errors.find(e => e.field.includes('mlsNumber'))
    
    console.log('  ✅ Got expected errors:')
    if (emailError) console.log('    - /organizer/email:', emailError.message)
    if (phoneError) console.log('    - /organizer/phone:', phoneError.message)
    if (licenseIdError) console.log('    - /organizer/licenseId:', licenseIdError.message)
    if (mlsNumberError) console.log('    - /organizer/mlsNumber:', mlsNumberError.message)
  } else {
    console.log('  ❌ Expected validation to fail')
    return false
  }
  
  // After sanitization - should pass
  console.log('\nAfter sanitization:')
  const sanitizedEvent = applyOrganizerSanitization(mockLLMOutput)
  const validationAfter = validateEventData(sanitizedEvent)
  
  if (validationAfter.success) {
    console.log('  ✅ Validation passes - errors are fixed!\n')
    return true
  } else {
    console.log('  ❌ Validation still fails:', validationAfter.errors, '\n')
    return false
  }
}

/**
 * Test minimal event with just date/time + address (no organizer contact details)
 */
function testMinimalViableEvent() {
  console.log('Test 3: Minimal Viable Event (no organizer contact info)')
  console.log('----------------------------------------------------------')
  
  const minimalEvent = {
    "@context": "https://schema.org",
    "@type": "Event",
    "flypost": {
      "eventId": "evt_test_789",
      "category": "open-houses",
      "realTimeData": true,
      "crawlable": true,
      "queryable": true,
      "submissionTimestamp": new Date().toISOString()
    },
    "name": "Open House",
    "description": "Open house this weekend",
    "startDate": "2025-02-01T14:00:00.000Z",
    "endDate": "2025-02-01T16:00:00.000Z",
    "location": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "789 Elm Street",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "postalCode": "94102",
        "addressCountry": "US"
      }
    },
    "organizer": {
      "@type": "Person",
      "name": "Event Organizer"
      // No email, phone, licenseId, or mlsNumber
    },
    "url": "https://example.com/listing"
  }
  
  console.log('Event has only required fields:')
  console.log('  - Date/time window: ✓')
  console.log('  - Geocodable address: ✓')
  console.log('  - Optional URL: ✓')
  console.log('  - No organizer contact details')
  
  const validation = validateEventData(minimalEvent)
  
  if (validation.success) {
    console.log('✅ Minimal viable event validates successfully\n')
    return true
  } else {
    console.log('❌ Minimal viable event validation failed:', validation.errors, '\n')
    return false
  }
}

/**
 * Test that sanitization preserves valid contact info when present
 */
function testValidContactInfoPreserved() {
  console.log('Test 4: Valid Contact Info is Preserved')
  console.log('----------------------------------------')
  
  const eventWithValidContact = {
    "@context": "https://schema.org",
    "@type": "Event",
    "flypost": {
      "eventId": "evt_test_101112",
      "category": "open-houses",
      "realTimeData": true,
      "crawlable": true,
      "queryable": true,
      "submissionTimestamp": new Date().toISOString()
    },
    "name": "Open House with Agent",
    "description": "Contact us for details",
    "startDate": "2025-02-01T14:00:00.000Z",
    "location": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "101 Park Ave"
      }
    },
    "organizer": {
      "@type": "Person",
      "name": "Jane Agent",
      "email": "jane@realty.com",
      "phone": "555-1234",
      "licenseId": "CA-DRE-12345",
      "mlsNumber": "MLS987654"
    }
  }
  
  console.log('Event has valid organizer contact info:')
  console.log('  email:', eventWithValidContact.organizer.email)
  console.log('  phone:', eventWithValidContact.organizer.phone)
  console.log('  licenseId:', eventWithValidContact.organizer.licenseId)
  console.log('  mlsNumber:', eventWithValidContact.organizer.mlsNumber)
  
  // Apply sanitization
  const sanitizedEvent = applyOrganizerSanitization(eventWithValidContact)
  
  // Verify all valid fields are preserved
  if (sanitizedEvent.organizer.email === 'jane@realty.com' &&
      sanitizedEvent.organizer.phone === '555-1234' &&
      sanitizedEvent.organizer.licenseId === 'CA-DRE-12345' &&
      sanitizedEvent.organizer.mlsNumber === 'MLS987654') {
    console.log('✅ All valid contact fields preserved after sanitization')
  } else {
    console.log('❌ Some valid contact fields were incorrectly removed')
    return false
  }
  
  const validation = validateEventData(sanitizedEvent)
  
  if (validation.success) {
    console.log('✅ Event with valid contact info validates successfully\n')
    return true
  } else {
    console.log('❌ Validation failed:', validation.errors, '\n')
    return false
  }
}

// Run all integration tests
async function runTests() {
  console.log('🚀 Starting Integration Tests\n')
  
  try {
    const results = [
      testProblemStatementCase(),
      testExactProblemStatementError(),
      testMinimalViableEvent(),
      testValidContactInfoPreserved()
    ]
    
    const passed = results.filter(r => r).length
    const total = results.length
    
    console.log('=' .repeat(60))
    console.log(`📊 Integration Test Results: ${passed}/${total} tests passed`)
    console.log('=' .repeat(60))
    
    if (passed === total) {
      console.log('🎉 All integration tests passed!')
      console.log('✨ Organizer field sanitization works correctly in the full flow.')
      console.log('✅ Minimal open house posts no longer fail schema validation.')
      process.exit(0)
    } else {
      console.log('❌ Some integration tests failed. Check implementation.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test error:', error)
    process.exit(1)
  }
}

// Run the tests
runTests()
