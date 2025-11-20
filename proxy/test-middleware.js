#!/usr/bin/env node

/**
 * Integration test for the write-token middleware
 * This script starts a minimal proxy server and tests the middleware behavior
 */

const express = require('express')
const cors = require('cors')
const http = require('http')

// Create a minimal test server that mimics the proxy
function createTestServer() {
  const app = express()

  app.use(cors({ origin: '*', credentials: true }))
  app.use(express.json({ limit: '1mb' }))

  // Write-token authentication middleware (same as in cloudrun-proxy.js)
  function requireWriteToken(req, res, next) {
    const isApiPost = req.method === 'POST' && (req.originalUrl || '').startsWith('/api/')
    
    if (isApiPost) {
      const token = req.get('x-flypost-write-token')
      const expectedToken = process.env.FLYPOST_WRITE_TOKEN
      
      // If FLYPOST_WRITE_TOKEN is configured, enforce it
      if (expectedToken && token !== expectedToken) {
        console.log(`🔒 Write-token check failed for ${req.method} ${req.originalUrl}`)
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid or missing write token'
        })
      }
      
      if (expectedToken && token === expectedToken) {
        console.log(`✅ Write-token validated for ${req.method} ${req.originalUrl}`)
      }
    }
    
    next()
  }

  app.use(requireWriteToken)

  // Mock handlers
  app.post('/api/parse-and-publish', (req, res) => {
    res.json({ success: true, message: 'parse-and-publish called' })
  })

  app.post('/api/test-endpoint', (req, res) => {
    res.json({ success: true, message: 'test-endpoint called' })
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
  console.log('🧪 Starting integration tests for write-token middleware\n')

  const app = createTestServer()
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

      // Test 1: GET requests should not require token
      await test('GET /api/schema without token should succeed', async (url) => {
        const res = await fetch(`${url}/api/schema`)
        const data = await res.json()
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 2: GET /health should not require token
      await test('GET /health without token should succeed', async (url) => {
        const res = await fetch(`${url}/health`)
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 3: POST without FLYPOST_WRITE_TOKEN set (no auth required)
      await test('POST /api/parse-and-publish without token when not configured', async (url) => {
        delete process.env.FLYPOST_WRITE_TOKEN
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 4: POST with FLYPOST_WRITE_TOKEN set and valid token
      await test('POST /api/parse-and-publish with valid token', async (url) => {
        process.env.FLYPOST_WRITE_TOKEN = 'test-token-123'
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-flypost-write-token': 'test-token-123'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      })

      // Test 5: POST with FLYPOST_WRITE_TOKEN set and invalid token
      await test('POST /api/parse-and-publish with invalid token should fail', async (url) => {
        process.env.FLYPOST_WRITE_TOKEN = 'test-token-123'
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-flypost-write-token': 'wrong-token'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
        const data = await res.json()
        if (!data.error.includes('Unauthorized')) throw new Error('Expected unauthorized error')
      })

      // Test 6: POST with FLYPOST_WRITE_TOKEN set and no token
      await test('POST /api/parse-and-publish without token when configured should fail', async (url) => {
        process.env.FLYPOST_WRITE_TOKEN = 'test-token-123'
        const res = await fetch(`${url}/api/parse-and-publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
      })

      // Test 7: POST to /api/test-endpoint with valid token
      await test('POST /api/test-endpoint with valid token', async (url) => {
        process.env.FLYPOST_WRITE_TOKEN = 'test-token-123'
        const res = await fetch(`${url}/api/test-endpoint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-flypost-write-token': 'test-token-123'
          },
          body: JSON.stringify({ test: 'data' })
        })
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
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
    console.log('✅ All integration tests passed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Integration tests failed:', error.message)
    process.exit(1)
  })
