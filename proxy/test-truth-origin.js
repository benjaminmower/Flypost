#!/usr/bin/env node

/**
 * Offline integration test for truth endpoint origin restrictions
 * Tests that /v1/presence/* and /v1/feedback/* POST requests
 * require Origin: https://presence.goflypost.com
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
    'https://presence.goflypost.com': ['GET', 'POST'],
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

      // Mock backend endpoints - these should only be reached if origin check passes
      mockApp.post('/v1/presence/check-in', (req, res) => {
        res.json({ 
          success: true, 
          message: 'check-in successful', 
          data: { checkInId: 'checkin_123', eventId: 'evt_456' } 
        })
      })

      mockApp.post('/v1/presence/check-out', (req, res) => {
        res.json({ 
          success: true, 
          message: 'check-out successful', 
          data: { checkInId: 'checkin_123' } 
        })
      })

      mockApp.post('/v1/feedback/submit', (req, res) => {
        res.json({ 
          success: true, 
          message: 'feedback submitted', 
          data: { feedbackId: 'feedback_789' } 
        })
      })

      mockApp.post('/api/parse-and-publish', (req, res) => {
        res.json({ success: true, message: 'parse-and-publish called', data: { eventId: 'evt_123' } })
      })

      mockApp.get('/health', (req, res) => {
        res.json({ success: true, message: 'healthy' })
      })

      mockApp.get('/e/:shareId', (req, res) => {
        res.set('Content-Type', 'text/html')
        res.status(200).send('<html><head><title>Share</title></head><body>Share</body></html>')
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
    // Note: Not setting FIREBASE_PROJECT_ID to keep Firebase disabled for simplified testing
    // Truth endpoint tests focus on origin restrictions, not Firebase auth
    process.env.FLYPOST_WRITE_TOKEN = 'test-global-token'

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
    app.get('/e/:shareId', forward)
    
    // Truth endpoints
    app.post('/v1/presence/check-in', forward)
    app.post('/v1/presence/check-out', forward)
    app.post('/v1/feedback/submit', forward)
    app.use('/v1/presence', forward)
    app.use('/v1/feedback', forward)

    return app
  }

  return { app, initialize, cleanup: () => backendServer && backendServer.close() }
}

// Test runner
async function runTests() {
  console.log('🧪 Starting truth endpoint origin restriction tests\n')

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

      // =====================================================
      // Test Group 1: Presence endpoints with correct origin
      // =====================================================
      console.log('\n=== Testing presence endpoints with correct origin ===\n')

      await test('POST /v1/presence/check-in with presence.goflypost.com origin → allowed', async (url) => {
        const res = await fetch(`${url}/v1/presence/check-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://presence.goflypost.com'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            coordinates: { lat: 34.05, lng: -118.25 }
          })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`)
        if (!data.success) throw new Error('Expected success response')
      })

      await test('POST /v1/presence/check-out with presence.goflypost.com origin → allowed', async (url) => {
        const res = await fetch(`${url}/v1/presence/check-out`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://presence.goflypost.com'
          },
          body: JSON.stringify({ 
            checkInId: 'checkin_123'
          })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`)
        if (!data.success) throw new Error('Expected success response')
      })

      // =====================================================
      // Test Group 2: Presence endpoints with missing origin
      // =====================================================
      console.log('\n=== Testing presence endpoints with missing origin ===\n')

      await test('POST /v1/presence/check-in with missing origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/presence/check-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            coordinates: { lat: 34.05, lng: -118.25 }
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      await test('POST /v1/presence/check-out with missing origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/presence/check-out`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            checkInId: 'checkin_123'
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      // =====================================================
      // Test Group 3: Presence endpoints with wrong origin
      // =====================================================
      console.log('\n=== Testing presence endpoints with wrong origin ===\n')

      await test('POST /v1/presence/check-in with post.goflypost.com origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/presence/check-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://post.goflypost.com'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            coordinates: { lat: 34.05, lng: -118.25 }
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      await test('POST /v1/presence/check-in with app.goflypost.com origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/presence/check-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            coordinates: { lat: 34.05, lng: -118.25 }
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      await test('POST /v1/presence/check-in with localhost origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/presence/check-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:5173'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            coordinates: { lat: 34.05, lng: -118.25 }
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      // =====================================================
      // Test Group 4: Feedback endpoints with correct origin
      // =====================================================
      console.log('\n=== Testing feedback endpoints with correct origin ===\n')

      await test('POST /v1/feedback/submit with presence.goflypost.com origin → allowed', async (url) => {
        const res = await fetch(`${url}/v1/feedback/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://presence.goflypost.com'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            checkInId: 'checkin_456',
            rating: 5,
            feedbackText: 'Great event!'
          })
        })
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`)
        if (!data.success) throw new Error('Expected success response')
      })

      // =====================================================
      // Test Group 5: Feedback endpoints with missing/wrong origin
      // =====================================================
      console.log('\n=== Testing feedback endpoints with missing/wrong origin ===\n')

      await test('POST /v1/feedback/submit with missing origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/feedback/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            checkInId: 'checkin_456',
            rating: 5
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      await test('POST /v1/feedback/submit with post.goflypost.com origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/feedback/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://post.goflypost.com'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            checkInId: 'checkin_456',
            rating: 5
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      await test('POST /v1/feedback/submit with app.goflypost.com origin → 403', async (url) => {
        const res = await fetch(`${url}/v1/feedback/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://app.goflypost.com'
          },
          body: JSON.stringify({ 
            eventId: 'evt_123',
            checkInId: 'checkin_456',
            rating: 5
          })
        })
        const data = await res.json()
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
        if (!data.error.includes('presence.goflypost.com')) throw new Error('Expected presence.goflypost.com in error message')
      })

      // =====================================================
      // Test Group 6: Verify /api/* behavior unchanged
      // =====================================================
      console.log('\n=== Testing /api/* endpoints remain unchanged ===\n')

      await test('POST /api/parse-and-publish with valid token and no origin → 200', async (url) => {
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

      await test('POST /api/parse-and-publish with missing token and no origin → 401', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ naturalLanguageInput: 'Test event' })
        })
        const data = await res.json()
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        if (!data.error.includes('Unauthorized')) throw new Error('Expected Unauthorized error')
      })

      await test('POST /api/parse-and-publish from post.goflypost.com still requires Firebase → 401', async (url) => {
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
        // Without Firebase auth configured, this tests that the endpoint still requires write token auth
      })

      // =====================================================
      // Test Group 7: Share page restrictions
      // =====================================================
      console.log('\n=== Testing share page restrictions ===\n')

      await test('POST /e/test blocked (405)', async (url) => {
        const res = await fetch(`${url}/e/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true })
        })

        if (![404, 405].includes(res.status)) {
          throw new Error(`Expected 404 or 405, got ${res.status}`)
        }
      })

      await test('GET /e/test allowed', async (url) => {
        const res = await fetch(`${url}/e/test`, { method: 'GET' })

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // =====================================================
      // Test Group 8: GET requests not affected
      // =====================================================
      console.log('\n=== Testing GET requests not affected ===\n')

      await test('GET /health is public (no auth or origin required)', async (url) => {
        const res = await fetch(`${url}/health`)
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
        if (!data.success) throw new Error('Expected success response')
      })

      console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)

      // Cleanup
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
    console.log('\n✅ All truth endpoint origin restriction tests passed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Truth endpoint origin restriction tests failed:', error.message)
    process.exit(1)
  })
