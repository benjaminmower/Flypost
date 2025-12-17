#!/usr/bin/env node
/**
 * Integration test for authentication middleware
 * Tests actual HTTP endpoints with authentication
 */

import crypto from 'crypto'
import { computeSignature, buildCanonicalString, computeBodyHash } from './src/auth/hmac.js'

// Use native fetch (Node 18+)
const fetch = globalThis.fetch

const BASE_URL = 'http://localhost:3001'

// Helper: wait for server to be ready
async function waitForServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`)
      if (response.ok) {
        console.log('✅ Server is ready\n')
        return true
      }
    } catch (err) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Server did not become ready in time')
}

console.log('🧪 Testing Authentication Integration\n')
console.log('Starting server...')

await waitForServer()

// Test 1: Unauthenticated request should fail
console.log('Test 1: Unauthenticated POST should return 401')
try {
  const response = await fetch(`${BASE_URL}/v1/events/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: 'Test Event'
      }
    })
  })
  
  if (response.status === 401) {
    const data = await response.json()
    console.log('  Response:', data.error)
    console.log('✅ Test 1 passed: Unauthenticated request rejected\n')
  } else {
    console.log(`❌ Test 1 failed: Expected 401, got ${response.status}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 1 failed:', error.message, '\n')
  process.exit(1)
}

// Test 2: HMAC authenticated request should succeed
console.log('Test 2: HMAC authenticated POST should succeed')
try {
  // NOTE: Test secrets only - never use these in production!
  // In production, secrets should be securely managed (e.g., Secret Manager)
  process.env.FLYPOST_HMAC_SECRETS_JSON = JSON.stringify({
    'test-client': 'test-secret-123'
  })
  
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'POST'
  const path = '/v1/events/upsert'
  
  const bodyObj = {
    event: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      flypost: {
        category: 'open-houses'
      },
      name: 'Test Open House',
      description: 'Test property',
      startDate: '2025-01-20T14:00:00.000Z',
      location: {
        '@type': 'Place',
        name: '123 Test Street',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '123 Test Street',
          addressLocality: 'Santa Monica',
          addressRegion: 'CA',
          postalCode: '90405',
          addressCountry: 'US'
        }
      },
      organizer: {
        '@type': 'Person',
        name: 'Test Organizer',
        email: 'test@example.com'
      }
    }
  }
  
  const body = JSON.stringify(bodyObj)
  const rawBody = Buffer.from(body)
  
  const bodyHash = computeBodyHash(rawBody)
  const canonicalString = buildCanonicalString(timestamp, method, path, bodyHash)
  const signature = computeSignature('test-secret-123', canonicalString)
  
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-flypost-client-id': 'test-client',
      'x-flypost-timestamp': timestamp,
      'x-flypost-signature': signature
    },
    body
  })
  
  const data = await response.json()
  
  if (response.ok && data.success) {
    console.log('  Event ID:', data.data.eventId)
    console.log('✅ Test 2 passed: HMAC authenticated request succeeded\n')
  } else {
    console.log(`❌ Test 2 failed: ${response.status} - ${JSON.stringify(data)}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 2 failed:', error.message, '\n')
  process.exit(1)
}

// Test 3: HMAC request with wrong signature should fail
console.log('Test 3: HMAC with invalid signature should return 401')
try {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'POST'
  const path = '/v1/events/upsert'
  
  const bodyObj = {
    event: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Test Event'
    }
  }
  
  const body = JSON.stringify(bodyObj)
  
  // Use wrong signature
  const wrongSignature = 'wrong-signature-base64=='
  
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-flypost-client-id': 'test-client',
      'x-flypost-timestamp': timestamp,
      'x-flypost-signature': wrongSignature
    },
    body
  })
  
  if (response.status === 401) {
    const data = await response.json()
    console.log('  Response:', data.error)
    console.log('✅ Test 3 passed: Invalid signature rejected\n')
  } else {
    console.log(`❌ Test 3 failed: Expected 401, got ${response.status}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 3 failed:', error.message, '\n')
  process.exit(1)
}

// Test 4: Read endpoints should work without auth
console.log('Test 4: GET /v1/events/near should work without auth')
try {
  const response = await fetch(`${BASE_URL}/v1/events/near?lat=34.0195&lng=-118.4912&radius=10`)
  
  if (response.ok) {
    const data = await response.json()
    console.log('  Events found:', data.meta.count)
    console.log('✅ Test 4 passed: Read endpoint works without auth\n')
  } else {
    console.log(`❌ Test 4 failed: Expected 200, got ${response.status}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 4 failed:', error.message, '\n')
  process.exit(1)
}

// Test 5: Health endpoint should work without auth
console.log('Test 5: GET /health should work without auth')
try {
  const response = await fetch(`${BASE_URL}/health`)
  
  if (response.ok) {
    const data = await response.json()
    console.log('  Status:', data.status)
    console.log('✅ Test 5 passed: Health endpoint works without auth\n')
  } else {
    console.log(`❌ Test 5 failed: Expected 200, got ${response.status}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 5 failed:', error.message, '\n')
  process.exit(1)
}

// Test 6: All write endpoints should require auth
console.log('Test 6: All write endpoints should require auth')
const writeEndpoints = [
  { path: '/api/parse-and-publish', body: { naturalLanguageInput: 'test' } },
  { path: '/v1/presence/check-in', body: { lat: 34.0, lng: -118.4, buyerToken: 'test' } },
  { path: '/v1/feedback/submit', body: { answers: { wantsSimilar: true } } }
]

let allPassed = true
for (const endpoint of writeEndpoints) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(endpoint.body)
    })
    
    if (response.status === 401) {
      console.log(`  ✓ ${endpoint.path} requires auth`)
    } else {
      console.log(`  ✗ ${endpoint.path} returned ${response.status} instead of 401`)
      allPassed = false
    }
  } catch (error) {
    console.log(`  ✗ ${endpoint.path} error: ${error.message}`)
    allPassed = false
  }
}

if (allPassed) {
  console.log('✅ Test 6 passed: All write endpoints require auth\n')
} else {
  console.log('❌ Test 6 failed: Some endpoints did not require auth\n')
  process.exit(1)
}

console.log('✅ All integration tests passed!')
console.log('\nNote: Firebase ID token tests require Firebase Admin SDK to be initialized.')
console.log('For production testing, set GOOGLE_CLOUD_PROJECT and provide valid Firebase tokens.\n')
