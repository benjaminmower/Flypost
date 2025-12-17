#!/usr/bin/env node

/**
 * Integration test for origin-gated write authentication
 * Tests the new policy where app.goflypost.com requires Firebase auth
 * and other origins require static write tokens
 */

const express = require('express')
const cors = require('cors')
const http = require('http')

// Mock Firebase verification for testing
class MockFirebaseVerifier {
  constructor(validTokens = {}) {
    this.validTokens = validTokens // Map of token -> user payload
  }

  async verifyIdToken({ idToken }) {
    if (this.validTokens[idToken]) {
      return {
        getPayload: () => this.validTokens[idToken]
      }
    }
    throw new Error('Invalid token')
  }
}

// Create a test server that mimics the new forward.js logic
function createTestServer(firebaseVerifier, writeTokens = []) {
  const app = express()

  app.use(cors({ origin: '*', credentials: true }))
  app.use(express.json({ limit: '1mb' }))

  const APP_ORIGIN = 'https://app.goflypost.com'

  function extractBearer(authHeader) {
    if (!authHeader) return ''
    return authHeader.replace(/^Bearer\s+/i, '').trim()
  }

  async function verifyFirebaseIdToken(authHeader) {
    if (!firebaseVerifier) return { ok: false, reason: 'firebase-disabled' }

    const token = extractBearer(authHeader)
    if (!token) return { ok: false, reason: 'missing-token' }

    try {
      const ticket = await firebaseVerifier.verifyIdToken({ idToken: token })
      return { ok: true, decoded: ticket.getPayload() }
    } catch (err) {
      return { ok: false, reason: 'verify-failed', error: err }
    }
  }

  // Origin-gated auth middleware
  async function originGatedAuth(req, res, next) {
    const origin = req.headers.origin
    const isApiPost = req.method === 'POST' && req.path.startsWith('/api/')
    const isChatEndpoint = req.path === '/api/chat' || req.path.startsWith('/api/chat/')

    if (isApiPost && !isChatEndpoint) {
      const bearer = req.headers.authorization || req.headers.Authorization
      const headerToken = (req.headers['x-flypost-write-token'] || '').toString().trim()

      const isAppOrigin = origin === APP_ORIGIN

      if (isAppOrigin) {
        // App origin: require Firebase token
        const firebaseAuthResult = await verifyFirebaseIdToken(bearer)
        if (!firebaseAuthResult.ok) {
          console.log(`🔒 Firebase auth failed for ${origin}: ${firebaseAuthResult.reason}`)
          return res.status(401).json({
            success: false,
            error: 'unauthorized: Firebase authentication required for app.goflypost.com'
          })
        }
        console.log(`✅ Firebase auth successful for ${origin}`)
      } else {
        // Non-app origin: require static write token
        if (!writeTokens.length) {
          console.log(`⚠️  No write tokens configured, allowing ${req.method} ${req.path}`)
        } else {
          const matched = writeTokens.includes(headerToken)
          if (!matched) {
            console.log(`🔒 Static write token missing/invalid for origin=${origin || 'none'}`)
            return res.status(401).json({
              success: false,
              error: 'unauthorized: valid x-flypost-write-token required'
            })
          }
          console.log(`✅ Static write token validated for origin=${origin || 'none'}`)
        }
      }
    }

    next()
  }

  app.use(originGatedAuth)

  // Mock handlers
  app.post('/api/parse-and-publish', (req, res) => {
    res.json({ success: true, message: 'parse-and-publish called' })
  })

  app.post('/api/test-endpoint', (req, res) => {
    res.json({ success: true, message: 'test-endpoint called' })
  })

  app.post('/api/chat', (req, res) => {
    res.json({ success: true, message: 'chat called (exempt)' })
  })

  app.post('/api/chat/stream', (req, res) => {
    res.json({ success: true, message: 'chat stream called (exempt)' })
  })

  app.post('/api/chatbot', (req, res) => {
    res.json({ success: true, message: 'chatbot called (should require auth)' })
  })

  app.get('/api/schema', (req, res) => {
    res.json({ success: true, message: 'schema called' })
  })

  app.get('/health', (req, res) => {
    res.json({ success: true, message: 'health called' })
  })

  return app
}

// Test function
async function runTests() {
  console.log('🧪 Starting origin-gated auth integration tests\n')

  // Set up mock Firebase tokens
  const validFirebaseToken = 'valid-firebase-token-xyz'
  const firebaseUser = {
    uid: 'test-user-123',
    email: 'test@example.com'
  }
  const mockFirebaseVerifier = new MockFirebaseVerifier({
    [validFirebaseToken]: firebaseUser
  })

  const validWriteToken = 'test-write-token-123'
  const app = createTestServer(mockFirebaseVerifier, [validWriteToken])
  const server = http.createServer(app)

  return new Promise((resolve, reject) => {
    server.listen(0, async () => {
      const port = server.address().port
      const baseUrl = `http://localhost:${port}`

      console.log(`✓ Test server started on port ${port}\n`)

      let passed = 0
      let failed = 0

      async function test(name, fn) {
        try {
          await fn(baseUrl)
          console.log(`✓ ${name}`)
          passed++
        } catch (error) {
          console.error(`✗ ${name}`)
          console.error(`  Error: ${error.message}`)
          failed++
        }
      }

      // Test 1: GET requests should not require any token
      await test('GET /api/schema without auth should succeed', async (url) => {
        const res = await fetch(`${url}/api/schema`)
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 2: GET /health should not require auth
      await test('GET /health without auth should succeed', async (url) => {
        const res = await fetch(`${url}/health`)
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 3: POST from app.goflypost.com with valid Firebase token
      await test('POST from app.goflypost.com with valid Firebase token should succeed', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com',
            'Authorization': `Bearer ${validFirebaseToken}`
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 4: POST from app.goflypost.com without Firebase token should fail
      await test('POST from app.goflypost.com without Firebase token should fail with 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        const data = await res.json()
        if (!data.error.includes('Firebase')) throw new Error('Expected Firebase auth error')
      })

      // Test 5: POST from app.goflypost.com with invalid Firebase token should fail
      await test('POST from app.goflypost.com with invalid Firebase token should fail with 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com',
            'Authorization': 'Bearer invalid-token'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
      })

      // Test 6: POST from app.goflypost.com with write token (not Firebase) should fail
      await test('POST from app.goflypost.com with write-token should fail with 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com',
            'x-flypost-write-token': validWriteToken
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
      })

      // Test 7: POST from non-app origin with valid write token should succeed
      await test('POST from non-app origin with valid write token should succeed', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://api.goflypost.com',
            'x-flypost-write-token': validWriteToken
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 8: POST from non-app origin without write token should fail
      await test('POST from non-app origin without write token should fail with 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://api.goflypost.com'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        const data = await res.json()
        if (!data.error.includes('x-flypost-write-token')) throw new Error('Expected write token error')
      })

      // Test 9: POST from non-app origin with invalid write token should fail
      await test('POST from non-app origin with invalid write token should fail with 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://api.goflypost.com',
            'x-flypost-write-token': 'wrong-token'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
      })

      // Test 10: POST with no origin and valid write token should succeed
      await test('POST with no origin and valid write token should succeed', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-flypost-write-token': validWriteToken
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 11: POST to /api/chat should be exempt (no auth needed)
      await test('POST /api/chat should be exempt from auth', async (url) => {
        const res = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 12: POST to /api/chat from any origin should be exempt
      await test('POST /api/chat from any origin should be exempt', async (url) => {
        const res = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://api.goflypost.com'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 13: POST to /api/chat/stream should be exempt (subpath of /api/chat/)
      await test('POST /api/chat/stream should be exempt', async (url) => {
        const res = await fetch(`${url}/api/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://api.goflypost.com'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 14: POST to /api/chatbot should require auth (not under /api/chat/)
      await test('POST /api/chatbot should require write token', async (url) => {
        const res = await fetch(`${url}/api/chatbot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://api.goflypost.com'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
      })

      console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)

      server.close(() => {
        if (failed > 0) {
          reject(new Error(`${failed} tests failed`))
        } else {
          resolve()
        }
      })
    })
  })
}

// Run tests
runTests()
  .then(() => {
    console.log('✅ All origin-gated auth tests passed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Origin-gated auth tests failed:', error.message)
    process.exit(1)
  })
