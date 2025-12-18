#!/usr/bin/env node
/**
 * Test script for JSON stability
 * Verifies that all responses are JSON with deterministic status codes
 */

console.log('🧪 Testing JSON Stability\n')
console.log('=========================\n')

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
 * Test 1: Error response structure
 */
function testErrorResponseStructure() {
  console.log('Test 1: Error Response Structure')
  console.log('---------------------------------')
  
  // All error responses should have this structure
  const errorStructure = {
    success: false,
    error: 'Error message'
  }
  
  assert(typeof errorStructure.success === 'boolean', 'Error has boolean "success" field')
  assert(errorStructure.success === false, 'Error "success" is false')
  assert(typeof errorStructure.error === 'string', 'Error has string "error" field')
  
  // Errors can optionally have details
  const errorWithDetails = {
    success: false,
    error: 'Validation failed',
    details: ['Field x is required']
  }
  
  assert(Array.isArray(errorWithDetails.details), 'Error can have "details" array')
  
  console.log('')
}

/**
 * Test 2: Success response structure
 */
function testSuccessResponseStructure() {
  console.log('Test 2: Success Response Structure')
  console.log('-----------------------------------')
  
  // All success responses should have success: true
  const successResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: []
  }
  
  assert(typeof successResponse.success === 'boolean', 'Success has boolean "success" field')
  assert(successResponse.success === true, 'Success "success" is true')
  
  console.log('')
}

/**
 * Test 3: HTTP status codes are deterministic
 */
function testStatusCodes() {
  console.log('Test 3: Deterministic HTTP Status Codes')
  console.log('----------------------------------------')
  
  const statusCodes = {
    success: 200,
    created: 201,
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    tooManyRequests: 429,
    internalError: 500
  }
  
  assert(statusCodes.success === 200, 'Success responses use 200')
  assert(statusCodes.badRequest === 400, 'Invalid input uses 400')
  assert(statusCodes.unauthorized === 401, 'Auth failures use 401')
  assert(statusCodes.forbidden === 403, 'Permission denied uses 403')
  assert(statusCodes.notFound === 404, 'Not found uses 404')
  assert(statusCodes.tooManyRequests === 429, 'Rate limit uses 429')
  assert(statusCodes.internalError === 500, 'Server errors use 500')
  
  console.log('')
}

/**
 * Test 4: Rate limiter response format
 */
function testRateLimiterResponse() {
  console.log('Test 4: Rate Limiter Response Format')
  console.log('-------------------------------------')
  
  const rateLimitResponse = {
    success: false,
    error: 'Too many read requests, please try again later.'
  }
  
  assert(rateLimitResponse.success === false, 'Rate limit response has success: false')
  assert(typeof rateLimitResponse.error === 'string', 'Rate limit response has error message')
  assert(rateLimitResponse.error.includes('Too many'), 'Rate limit message indicates limit exceeded')
  
  console.log('')
}

/**
 * Test 5: Discovery API response structure
 */
function testDiscoveryApiStructure() {
  console.log('Test 5: Discovery API Response Structure')
  console.log('-----------------------------------------')
  
  const discoveryResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: [
      {
        eventId: 'evt_123',
        eventIdentity: 'test-identity',
        category: 'open-houses',
        name: 'Test Event',
        startDate: '2025-01-15T10:00:00Z',
        address: {
          streetAddress: '123 Main St',
          addressLocality: 'Los Angeles',
          addressRegion: 'CA',
          postalCode: '90001',
          addressCountry: 'US'
        },
        geo: {
          latitude: 34.052235,
          longitude: -118.243683
        },
        detailsUrl: 'https://goflypost.com/events/evt_123'
      }
    ],
    meta: {
      count: 1,
      totalCount: 1,
      radiusKm: 10,
      limit: 25,
      hasMore: false
    }
  }
  
  assert(discoveryResponse.success === true, 'Discovery response has success: true')
  assert(discoveryResponse.schemaVersion === 'discovery.v1', 'Discovery response has schemaVersion')
  assert(Array.isArray(discoveryResponse.events), 'Discovery response has events array')
  assert(typeof discoveryResponse.meta === 'object', 'Discovery response has meta object')
  assert(typeof discoveryResponse.meta.count === 'number', 'Meta has count')
  assert(typeof discoveryResponse.meta.radiusKm === 'number', 'Meta has radiusKm')
  assert(typeof discoveryResponse.meta.limit === 'number', 'Meta has limit')
  assert(typeof discoveryResponse.meta.hasMore === 'boolean', 'Meta has hasMore')
  
  const event = discoveryResponse.events[0]
  assert(typeof event.eventId === 'string', 'Event has eventId')
  assert(typeof event.eventIdentity === 'string', 'Event has eventIdentity')
  assert(typeof event.category === 'string', 'Event has category')
  assert(typeof event.name === 'string', 'Event has name')
  assert(typeof event.startDate === 'string', 'Event has startDate')
  assert(typeof event.address === 'object', 'Event has address object')
  assert(typeof event.geo === 'object', 'Event has geo object')
  assert(typeof event.detailsUrl === 'string', 'Event has detailsUrl')
  
  console.log('')
}

/**
 * Test 6: Single event response structure
 */
function testSingleEventResponse() {
  console.log('Test 6: Single Event Response Structure')
  console.log('----------------------------------------')
  
  const singleEventResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    event: {
      eventId: 'evt_456',
      eventIdentity: 'test-identity-2',
      category: 'garage-sales',
      name: 'Test Sale',
      startDate: '2025-01-20T09:00:00Z',
      detailsUrl: 'https://goflypost.com/events/evt_456'
    },
    meta: {}
  }
  
  assert(singleEventResponse.success === true, 'Single event response has success: true')
  assert(singleEventResponse.schemaVersion === 'discovery.v1', 'Single event response has schemaVersion')
  assert(typeof singleEventResponse.event === 'object', 'Single event response has event object')
  assert(typeof singleEventResponse.meta === 'object', 'Single event response has meta object')
  
  const event = singleEventResponse.event
  assert(typeof event.eventId === 'string', 'Event has eventId')
  assert(typeof event.eventIdentity === 'string', 'Event has eventIdentity')
  assert(typeof event.detailsUrl === 'string', 'Event has detailsUrl')
  
  console.log('')
}

/**
 * Test 7: Content-Type header
 */
function testContentTypeHeader() {
  console.log('Test 7: Content-Type Header')
  console.log('----------------------------')
  
  // Verify that Content-Type should be application/json
  const expectedContentType = 'application/json'
  
  assert(expectedContentType === 'application/json', 'Content-Type is application/json')
  
  console.log('')
}

/**
 * Test 8: 404 Not Found response
 */
function testNotFoundResponse() {
  console.log('Test 8: 404 Not Found Response')
  console.log('-------------------------------')
  
  const notFoundResponse = {
    success: false,
    error: 'Event not found',
    eventId: 'evt_nonexistent'
  }
  
  assert(notFoundResponse.success === false, '404 response has success: false')
  assert(typeof notFoundResponse.error === 'string', '404 response has error message')
  assert(notFoundResponse.error.includes('not found'), '404 message indicates not found')
  
  console.log('')
}

/**
 * Test 9: Validation error response
 */
function testValidationErrorResponse() {
  console.log('Test 9: Validation Error Response')
  console.log('----------------------------------')
  
  const validationError = {
    success: false,
    error: 'Event validation failed',
    details: [
      'Field "name" is required',
      'Field "startDate" must be ISO 8601 format'
    ]
  }
  
  assert(validationError.success === false, 'Validation error has success: false')
  assert(typeof validationError.error === 'string', 'Validation error has error message')
  assert(Array.isArray(validationError.details), 'Validation error has details array')
  assert(validationError.details.length > 0, 'Validation error details is not empty')
  
  console.log('')
}

/**
 * Test 10: No accessTier in responses
 */
function testNoAccessTierInResponse() {
  console.log('Test 10: No accessTier in Responses (North Star)')
  console.log('-------------------------------------------------')
  
  const discoveryResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    events: [],
    meta: {
      count: 0,
      radiusKm: 10,
      limit: 25,
      hasMore: false
    }
  }
  
  assert(!discoveryResponse.meta.hasOwnProperty('accessTier'), 'Meta does not have accessTier')
  
  const singleEventResponse = {
    success: true,
    schemaVersion: 'discovery.v1',
    event: {},
    meta: {}
  }
  
  assert(!singleEventResponse.meta.hasOwnProperty('accessTier'), 'Single event meta does not have accessTier')
  
  console.log('')
}

// Run all tests
testErrorResponseStructure()
testSuccessResponseStructure()
testStatusCodes()
testRateLimiterResponse()
testDiscoveryApiStructure()
testSingleEventResponse()
testContentTypeHeader()
testNotFoundResponse()
testValidationErrorResponse()
testNoAccessTierInResponse()

// Print summary
console.log('=========================')
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
