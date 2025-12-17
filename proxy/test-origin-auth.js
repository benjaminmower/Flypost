#!/usr/bin/env node

/**
 * Integration test for origin-gated authentication policy
 * Tests the complete auth flow through cloudrun-proxy.js and forward.js
 */

const express = require('express')
const cors = require('cors')
const http = require('http')

// Create test server that mimics production setup
function createTestServer() {
  const app = express()

  // CORS setup (same as cloudrun-proxy.js)
  const allowedOrigins = {
    'https://ask.goflypost.com': ['GET', 'POST'],
    'https://post.goflypost.com': ['GET', 'POST'],
    'https://app.goflypost.com': ['GET', 'POST'],
    'http://localhost:5173': ['GET', 'POST'],
  }

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true)
        const allowedMethods = allowedOrigins[origin]
        if (allowedMethods) return cb(null, true)
        return cb(new Error('Not allowed by CORS: ' + origin))
      },
      credentials: true,
    }),
  )

  app.use(express.json({ limit: '1mb' }))

  // Preflight handling
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', req.headers.origin || '*')
      res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-flypost-write-token')
      res.sendStatus(204)
      return
    }
    next()
  })

  // Origin method enforcement
  function enforceOriginMethods(req, res, next) {
    const origin = req.headers.origin
    const allowedMethods = allowedOrigins[origin]
    if (allowedMethods && !allowedMethods.includes(req.method)) {
      return res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed for origin ${origin}`,
      })
    }
    next()
  }

  app.use(enforceOriginMethods)

  // Mock backend server
  let backendServer = null
  let backendUrl = null

  function startMockBackend() {
    return new Promise((resolve) => {
      const mockApp = express()
      mockApp.use(express.json())
      
      // Mock backend endpoints
      mockApp.post('/api/parse-and-publish', (req, res) => {
        res.json({ success: true, message: 'parse-and-publish called', data: { eventId: 'evt_123' } })
      })

      mockApp.post('/api/chat', (req, res) => {
        res.json({ success: true, message: 'chat called', response: 'Hello!' })
      })

      mockApp.post('/api/chatbot', (req, res) => {
        res.json({ success: true, message: 'chatbot called' })
      })

      mockApp.get('/health', (req, res) => {
        res.json({ success: true, message: 'healthy' })
      })

      backendServer = http.createServer(mockApp)
      backendServer.listen(0, () => {
        const port = backendServer.address().port
        backendUrl = `http://localhost:${port}`
        resolve(backendUrl)
      })
    })
  }

  async function initialize() {
    // Set up environment for forward.js BEFORE requiring it
    process.env.PROXY_USE_ID_TOKEN = 'false' // Disable Google ID token for tests
    process.env.FIREBASE_PROJECT_ID = 'test-project-id' // Enable Firebase validation
    process.env.FLYPOST_WRITE_TOKEN = 'test-global-token'
    process.env.VISTA_WRITE_TOKEN = 'test-vista-token'

    const backend = await startMockBackend()
    process.env.BACKEND_URL = backend

    // Delete cached module and require fresh to pick up env vars
    delete require.cache[require.resolve('./src/forward')]
    const createForward = require('./src/forward')
    const forward = createForward()

    // Mount routes (same as cloudrun-proxy.js)
    app.get('/', (req, res) => {
      res.status(200).json({ status: 'proxy running' })
    })

    app.get('/health', forward)
    app.post('/api/parse-and-publish', forward)
    app.use('/api', forward)

    return app
  }

  return { app, initialize, cleanup: () => backendServer && backendServer.close() }
}

// Mock Firebase token verification for testing
const originalVerify = require('google-auth-library').OAuth2Client.prototype.verifyIdToken

function mockFirebaseVerification(validTokens = {}) {
  require('google-auth-library').OAuth2Client.prototype.verifyIdToken = async function(options) {
    const token = options.idToken
    if (validTokens[token]) {
      return {
        getPayload: () => validTokens[token]
      }
    }
    throw new Error('Invalid token')
  }
}

function restoreFirebaseVerification() {
  require('google-auth-library').OAuth2Client.prototype.verifyIdToken = originalVerify
}

// Test runner
async function runTests() {
  console.log('🧪 Starting origin-gated authentication tests\n')

  const { app, initialize, cleanup } = createTestServer()
  await initialize()
  
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

      // Set up mock Firebase tokens
      const validFirebaseToken = 'valid_firebase_token_123'
      const invalidFirebaseToken = 'invalid_firebase_token'
      
      mockFirebaseVerification({
        [validFirebaseToken]: {
          uid: 'user123',
          email: 'test@example.com',
          firebase: { sign_in_provider: 'password' }
        }
      })

      // =====================================================
      // Test Group 1: Firebase-required browser origins
      // =====================================================
      console.log('\n=== Testing Firebase-required browser origins ===\n')

      await test('app.goflypost.com + valid Firebase token → allowed', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com',
            'Authorization': `Bearer ${validFirebaseToken}`
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`)
        if (!data.success) throw new Error('Expected success response')
      })

      await test('app.goflypost.com + missing Firebase token → 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('Firebase')) throw new Error('Expected Firebase error message')
      })

      await test('app.goflypost.com + invalid Firebase token → 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com',
            'Authorization': `Bearer ${invalidFirebaseToken}`
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
      })

      await test('app.goflypost.com + static token → 401 (not allowed for browser origin)', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com',
            'x-flypost-write-token': 'test-global-token'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('Firebase')) throw new Error('Expected Firebase error message')
      })

      await test('post.goflypost.com + valid Firebase token → allowed', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://post.goflypost.com',
            'Authorization': `Bearer ${validFirebaseToken}`
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
        if (!data.success) throw new Error('Expected success response')
      })

      await test('post.goflypost.com + missing Firebase token → 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://post.goflypost.com'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('Firebase')) throw new Error('Expected Firebase error message')
      })

      // =====================================================
      // Test Group 2: Read-only ask origin
      // =====================================================
      console.log('\n=== Testing read-only ask origin ===\n')

      await test('ask.goflypost.com + POST /api/chat → allowed without auth', async (url) => {
        const res = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://ask.goflypost.com'
          },
          body: JSON.stringify({ message: 'Hello' })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`)
        if (!data.success) throw new Error('Expected success response')
      })

      await test('ask.goflypost.com + POST /api/chat/conversation → allowed without auth', async (url) => {
        const res = await fetch(`${url}/api/chat/conversation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://ask.goflypost.com'
          },
          body: JSON.stringify({ message: 'Hello' })
        })
        // Backend may return 404 if endpoint doesn't exist, but auth should not block it
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Expected no auth block, got ${res.status}`)
        }
        // 200 or 404 are both acceptable (endpoint reached backend)
      })

      await test('ask.goflypost.com + POST /api/parse-and-publish → 401 (read-only)', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://ask.goflypost.com'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('read-only')) throw new Error('Expected read-only error message')
      })

      await test('ask.goflypost.com + POST /api/parse-and-publish with Firebase token → still 401 (read-only enforced)', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://ask.goflypost.com',
            'Authorization': `Bearer ${validFirebaseToken}`
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('read-only')) throw new Error('Expected read-only error message')
      })

      // =====================================================
      // Test Group 3: /api/chat exemption and boundaries
      // =====================================================
      console.log('\n=== Testing /api/chat exemption ===\n')

      await test('/api/chat is exempt from auth (no origin)', async (url) => {
        const res = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: 'Hello' })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
        if (!data.success) throw new Error('Expected success response')
      })

      await test('/api/chat/subpath is exempt from auth', async (url) => {
        const res = await fetch(`${url}/api/chat/conversation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: 'Hello' })
        })
        // Backend may return 404 if endpoint doesn't exist, but auth should not block it
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Expected no auth block, got ${res.status}`)
        }
        // 200 or 404 are both acceptable
      })

      await test('/api/chatbot is NOT exempt (requires auth)', async (url) => {
        const res = await fetch(`${url}/api/chatbot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: 'Hello' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('Unauthorized')) throw new Error('Expected unauthorized error')
      })

      // =====================================================
      // Test Group 4: Machine/server-to-server writes
      // =====================================================
      console.log('\n=== Testing machine/server-to-server writes ===\n')

      await test('No origin + valid x-flypost-write-token → allowed', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-flypost-write-token': 'test-global-token'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`)
        if (!data.success) throw new Error('Expected success response')
      })

      await test('No origin + invalid x-flypost-write-token → 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-flypost-write-token': 'wrong-token'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('Unauthorized')) throw new Error('Expected unauthorized error')
      })

      await test('No origin + missing token → 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
      })

      await test('Brokerage token (VISTA) works', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-flypost-write-token': 'test-vista-token'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
        if (!data.success) throw new Error('Expected success response')
      })

      // =====================================================
      // Test Group 5: Public read endpoints
      // =====================================================
      console.log('\n=== Testing public read endpoints ===\n')

      await test('GET /health is public (no auth required)', async (url) => {
        const res = await fetch(`${url}/health`)
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
        if (!data.success) throw new Error('Expected success response')
      })

      console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)

      // Cleanup
      restoreFirebaseVerification()
      cleanup()
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
    console.log('\n✅ All origin-gated authentication tests passed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Origin-gated authentication tests failed:', error.message)
    process.exit(1)
  })
