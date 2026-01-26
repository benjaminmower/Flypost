#!/usr/bin/env node

/**
 * Offline integration test for share allowlist restrictions
 * Tests that only GET /e/* is allowed on the public proxy surface
 */

const express = require('express')
const cors = require('cors')
const http = require('http')
const rateLimit = require('express-rate-limit')

// Create test server that mimics production setup
function createTestServer() {
  const app = express()

  app.use(cors({ origin: '*', credentials: true }))

  app.use(express.json({ limit: '1mb' }))
  const shareLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })

  function getRequestPath(req) {
    try {
      return new URL(req.originalUrl, 'http://localhost').pathname
    } catch {
      return req.originalUrl.split('?')[0].split('#')[0]
    }
  }

  function isSharePath(pathname) {
    return pathname.startsWith('/e/')
  }

  // Preflight handling + share allowlist
  app.use((req, res, next) => {
    const pathname = getRequestPath(req)
    const isShareRequest = isSharePath(pathname)

    if (req.method === 'OPTIONS') {
      if (!isShareRequest) {
        return res.sendStatus(404)
      }
      res.set('Access-Control-Allow-Origin', req.headers.origin || '*')
      res.set('Access-Control-Allow-Methods', 'GET,OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-flypost-write-token')
      res.sendStatus(204)
      return
    }

    if (!isShareRequest) {
      return res.sendStatus(404)
    }
    if (req.method !== 'GET') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: only GET /e/* is allowed',
      })
    }
    shareLimiter(req, res, next)
  })

  // Mock backend server
  let backendServer = null
  let backendUrl = null

  function startMockBackend() {
    return new Promise((resolve) => {
      const mockApp = express()
      mockApp.use(express.json())

      // Mock backend endpoints
      mockApp.get('/e/share-id', (req, res) => {
        res.json({ success: true, message: 'share page', shareId: 'share-id' })
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
    // Share allowlist tests focus on proxy routing, not Firebase auth
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

    app.get('/e/*', forward) // No auth; test-only share allowlist surface

    return app
  }

  return { app, initialize, cleanup: () => backendServer && backendServer.close() }
}

// Test runner
async function runTests() {
  console.log('🧪 Starting share allowlist restriction tests\n')

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
      // Test Group 1: Share allowlist enforcement
      // =====================================================
      console.log('\n=== Testing share allowlist enforcement ===\n')

      await test('GET /e/share-id → allowed', async (url) => {
        const res = await fetch(`${url}/e/share-id`)
        if (res.status !== 200) {
          throw new Error(`Expected 200, got ${res.status}`)
        }
      })

      await test('POST /e/share-id → 403', async (url) => {
        const res = await fetch(`${url}/e/share-id`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: 'Hello' })
        })
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`)
      })

      await test('GET /health → 404 (blocked)', async (url) => {
        const res = await fetch(`${url}/health`)
        if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`)
      })

      await test('POST /api/parse-and-publish → 404 (blocked)', async (url) => {
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: 'Hello' })
        })
        if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`)
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
    console.log('\n✅ All share allowlist restriction tests passed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Share allowlist restriction tests failed:', error.message)
    process.exit(1)
  })
