#!/usr/bin/env node
/**
 * Test script for authentication middleware
 * Tests Firebase ID token verification and HMAC signature verification
 */

import crypto from 'crypto'
import { computeSignature, buildCanonicalString, computeBodyHash } from './src/auth/hmac.js'

console.log('🧪 Testing Authentication Middleware\n')

// Test 1: HMAC Signature Computation
console.log('Test 1: HMAC Signature Computation')
try {
  const secret = 'test-secret-123'
  const timestamp = '1234567890'
  const method = 'POST'
  const path = '/v1/events/upsert'
  const body = JSON.stringify({ test: 'data' })
  
  const bodyHash = computeBodyHash(Buffer.from(body))
  console.log('  Body hash:', bodyHash)
  
  const canonicalString = buildCanonicalString(timestamp, method, path, bodyHash)
  console.log('  Canonical string:', canonicalString)
  
  const signature = computeSignature(secret, canonicalString)
  console.log('  Signature:', signature)
  
  // Verify we can reproduce the same signature
  const signature2 = computeSignature(secret, canonicalString)
  if (signature === signature2) {
    console.log('✅ Test 1 passed: Signature computation is deterministic\n')
  } else {
    console.log('❌ Test 1 failed: Signatures do not match\n')
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 1 failed:', error.message, '\n')
  process.exit(1)
}

// Test 2: HMAC Signature Verification (valid signature)
console.log('Test 2: HMAC Signature Verification (valid)')
try {
  const { verifyHmacSignature } = await import('./src/auth/hmac.js')
  
  // Set up test environment
  const testSecrets = {
    'test-client': 'test-secret-123'
  }
  process.env.FLYPOST_HMAC_SECRETS_JSON = JSON.stringify(testSecrets)
  process.env.HMAC_TIMESTAMP_SKEW_SECONDS = '300'
  
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'POST'
  const path = '/v1/events/upsert'
  const body = JSON.stringify({ event: { name: 'Test Event' } })
  const rawBody = Buffer.from(body)
  
  const bodyHash = computeBodyHash(rawBody)
  const canonicalString = buildCanonicalString(timestamp, method, path, bodyHash)
  const signature = computeSignature('test-secret-123', canonicalString)
  
  const result = verifyHmacSignature({
    clientId: 'test-client',
    timestamp,
    signature,
    method,
    path,
    rawBody
  })
  
  if (result.valid) {
    console.log('✅ Test 2 passed: Valid signature verified\n')
  } else {
    console.log(`❌ Test 2 failed: ${result.error}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 2 failed:', error.message, '\n')
  process.exit(1)
}

// Test 3: HMAC Signature Verification (invalid signature)
console.log('Test 3: HMAC Signature Verification (invalid)')
try {
  const { verifyHmacSignature } = await import('./src/auth/hmac.js')
  
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'POST'
  const path = '/v1/events/upsert'
  const body = JSON.stringify({ event: { name: 'Test Event' } })
  const rawBody = Buffer.from(body)
  
  // Use wrong signature
  const wrongSignature = 'invalid-signature-base64=='
  
  const result = verifyHmacSignature({
    clientId: 'test-client',
    timestamp,
    signature: wrongSignature,
    method,
    path,
    rawBody
  })
  
  if (!result.valid && result.error === 'Invalid signature') {
    console.log('✅ Test 3 passed: Invalid signature rejected\n')
  } else {
    console.log(`❌ Test 3 failed: Expected rejection but got: ${JSON.stringify(result)}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 3 failed:', error.message, '\n')
  process.exit(1)
}

// Test 4: HMAC Timestamp Replay Protection
console.log('Test 4: HMAC Timestamp Replay Protection')
try {
  const { verifyHmacSignature } = await import('./src/auth/hmac.js')
  
  // Use old timestamp (1 hour ago)
  const oldTimestamp = (Math.floor(Date.now() / 1000) - 3600).toString()
  const method = 'POST'
  const path = '/v1/events/upsert'
  const body = JSON.stringify({ event: { name: 'Test Event' } })
  const rawBody = Buffer.from(body)
  
  const bodyHash = computeBodyHash(rawBody)
  const canonicalString = buildCanonicalString(oldTimestamp, method, path, bodyHash)
  const signature = computeSignature('test-secret-123', canonicalString)
  
  const result = verifyHmacSignature({
    clientId: 'test-client',
    timestamp: oldTimestamp,
    signature,
    method,
    path,
    rawBody
  })
  
  if (!result.valid && result.error.includes('Timestamp out of range')) {
    console.log('✅ Test 4 passed: Old timestamp rejected\n')
  } else {
    console.log(`❌ Test 4 failed: Expected timestamp rejection but got: ${JSON.stringify(result)}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 4 failed:', error.message, '\n')
  process.exit(1)
}

// Test 5: HMAC Unknown Client ID
console.log('Test 5: HMAC Unknown Client ID')
try {
  const { verifyHmacSignature } = await import('./src/auth/hmac.js')
  
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'POST'
  const path = '/v1/events/upsert'
  const body = JSON.stringify({ event: { name: 'Test Event' } })
  const rawBody = Buffer.from(body)
  
  const bodyHash = computeBodyHash(rawBody)
  const canonicalString = buildCanonicalString(timestamp, method, path, bodyHash)
  const signature = computeSignature('test-secret-123', canonicalString)
  
  const result = verifyHmacSignature({
    clientId: 'unknown-client',
    timestamp,
    signature,
    method,
    path,
    rawBody
  })
  
  if (!result.valid && result.error.includes('Unknown client ID')) {
    console.log('✅ Test 5 passed: Unknown client ID rejected\n')
  } else {
    console.log(`❌ Test 5 failed: Expected client ID rejection but got: ${JSON.stringify(result)}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 5 failed:', error.message, '\n')
  process.exit(1)
}

// Test 6: HMAC Body Tampering Detection
console.log('Test 6: HMAC Body Tampering Detection')
try {
  const { verifyHmacSignature } = await import('./src/auth/hmac.js')
  
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'POST'
  const path = '/v1/events/upsert'
  const originalBody = JSON.stringify({ event: { name: 'Original Event' } })
  const tamperedBody = JSON.stringify({ event: { name: 'Tampered Event' } })
  
  // Sign with original body
  const bodyHash = computeBodyHash(Buffer.from(originalBody))
  const canonicalString = buildCanonicalString(timestamp, method, path, bodyHash)
  const signature = computeSignature('test-secret-123', canonicalString)
  
  // Verify with tampered body
  const result = verifyHmacSignature({
    clientId: 'test-client',
    timestamp,
    signature,
    method,
    path,
    rawBody: Buffer.from(tamperedBody)
  })
  
  if (!result.valid && result.error === 'Invalid signature') {
    console.log('✅ Test 6 passed: Body tampering detected\n')
  } else {
    console.log(`❌ Test 6 failed: Expected tampering detection but got: ${JSON.stringify(result)}\n`)
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Test 6 failed:', error.message, '\n')
  process.exit(1)
}

console.log('✅ All HMAC tests passed!')
console.log('\nNote: Firebase authentication tests require a running server with Firebase Admin SDK initialized.')
console.log('See test-auth-integration.js for end-to-end authentication tests.\n')
