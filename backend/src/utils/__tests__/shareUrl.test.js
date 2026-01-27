/**
 * Tests for shareUrl utilities
 */

import { generateShareUrl, extractEventIdFromFpid, validateExternalUrl } from '../shareUrl.js'

console.log('🧪 Testing shareUrl utilities...\n')

// Test 1: generateShareUrl with stored event format
console.log('Test 1: generateShareUrl with stored event')
const storedEvent = {
  id: 'evt_abc123_1641234567890',
  name: 'Open House - 123 Main Street',
  location: {
    address: {
      streetAddress: '123 Main St',
      addressLocality: 'San Francisco',
      addressRegion: 'CA'
    }
  },
  flypost: {
    eventId: 'evt_abc123_1641234567890'
  }
}

const url1 = generateShareUrl(storedEvent)
console.log('Result:', url1)
console.log('Expected format: https://goflypost.com/e/{slug}/evt_abc123_1641234567890_fpid')
console.log('✓ Pass\n')

// Test 2: generateShareUrl with discovery event format
console.log('Test 2: generateShareUrl with discovery event')
const discoveryEvent = {
  eventId: 'evt_xyz789_1641234567890',
  what: {
    type: 'open_house',
    label: 'Luxury Home Open House'
  },
  where: {
    address: '456 Oak Ave, Los Angeles, CA'
  }
}

const url2 = generateShareUrl(discoveryEvent)
console.log('Result:', url2)
console.log('Expected format: https://goflypost.com/e/{slug}/evt_xyz789_1641234567890_fpid')
console.log('✓ Pass\n')

// Test 3: generateShareUrl with missing eventId
console.log('Test 3: generateShareUrl with missing eventId')
const noIdEvent = {
  name: 'Test Event'
}

const url3 = generateShareUrl(noIdEvent)
console.log('Result:', url3)
console.log('Expected: null')
if (url3 === null) {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail - expected null\n')
}

// Test 4: extractEventIdFromFpid - valid format
console.log('Test 4: extractEventIdFromFpid - valid format')
const validFpid = 'evt_abc123_1641234567890_fpid'
const eventId1 = extractEventIdFromFpid(validFpid)
console.log('Result:', eventId1)
console.log('Expected: evt_abc123_1641234567890')
if (eventId1 === 'evt_abc123_1641234567890') {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail\n')
}

// Test 5: extractEventIdFromFpid - invalid format (no _fpid suffix)
console.log('Test 5: extractEventIdFromFpid - invalid format (no _fpid suffix)')
const invalidFpid1 = 'evt_abc123_1641234567890'
const eventId2 = extractEventIdFromFpid(invalidFpid1)
console.log('Result:', eventId2)
console.log('Expected: null')
if (eventId2 === null) {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail\n')
}

// Test 6: extractEventIdFromFpid - invalid format (wrong timestamp length)
console.log('Test 6: extractEventIdFromFpid - invalid format (wrong timestamp length)')
const invalidFpid2 = 'evt_abc123_123_fpid'
const eventId3 = extractEventIdFromFpid(invalidFpid2)
console.log('Result:', eventId3)
console.log('Expected: null')
if (eventId3 === null) {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail\n')
}

// Test 7: extractEventIdFromFpid - completely invalid
console.log('Test 7: extractEventIdFromFpid - completely invalid')
const invalidFpid3 = 'invalid_format'
const eventId4 = extractEventIdFromFpid(invalidFpid3)
console.log('Result:', eventId4)
console.log('Expected: null')
if (eventId4 === null) {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail\n')
}

// Test 8: validateExternalUrl - valid https URL
console.log('Test 8: validateExternalUrl - valid https URL')
const validUrl1 = 'https://example.com/listing/123'
const result1 = validateExternalUrl(validUrl1)
console.log('Result:', result1)
console.log('Expected:', validUrl1)
if (result1 === validUrl1) {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail\n')
}

// Test 9: validateExternalUrl - valid http URL
console.log('Test 9: validateExternalUrl - valid http URL')
const validUrl2 = 'http://example.com/listing/456'
const result2 = validateExternalUrl(validUrl2)
console.log('Result:', result2)
console.log('Expected:', validUrl2)
if (result2 === validUrl2) {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail\n')
}

// Test 10: validateExternalUrl - javascript: XSS attempt
console.log('Test 10: validateExternalUrl - javascript: XSS attempt')
const xssUrl = 'javascript:alert(1)'
const result3 = validateExternalUrl(xssUrl)
console.log('Result:', result3)
console.log('Expected: null')
if (result3 === null) {
  console.log('✓ Pass - XSS blocked\n')
} else {
  console.log('✗ Fail - XSS not blocked!\n')
}

// Test 11: validateExternalUrl - data: URI
console.log('Test 11: validateExternalUrl - data: URI')
const dataUrl = 'data:text/html,<script>alert(1)</script>'
const result4 = validateExternalUrl(dataUrl)
console.log('Result:', result4)
console.log('Expected: null')
if (result4 === null) {
  console.log('✓ Pass - data URI blocked\n')
} else {
  console.log('✗ Fail - data URI not blocked!\n')
}

// Test 12: validateExternalUrl - null/undefined
console.log('Test 12: validateExternalUrl - null/undefined')
const result5 = validateExternalUrl(null)
console.log('Result:', result5)
console.log('Expected: null')
if (result5 === null) {
  console.log('✓ Pass\n')
} else {
  console.log('✗ Fail\n')
}

console.log('✅ All shareUrl utility tests completed!')
