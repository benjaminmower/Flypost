#!/usr/bin/env node

/*
 * Test: Firebase Auth Validation (No LLM Required)
 * 
 * This test verifies the authentication logic before reaching the LLM.
 * It only tests that the initial brokerageId validation accepts Firebase auth.
 */

import http from 'http'
import dotenv from 'dotenv'

dotenv.config()

const PORT = process.env.PORT || 3001
const BASE_URL = `http://localhost:${PORT}`

console.log('🧪 Testing Firebase Auth Validation Logic')
console.log('='.repeat(70))

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(data)
          })
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          })
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

async function runTests() {
  let passed = 0
  let failed = 0

  async function test(name, fn) {
    try {
      await fn()
      console.log(`✅ ${name}`)
      passed++
    } catch (error) {
      console.log(`❌ ${name}`)
      console.log(`   Error: ${error.message}`)
      failed++
    }
  }

  // Test 1: Firebase auth without brokerageId should NOT get 400 "Missing brokerageId" error
  // (It may fail later with OpenAI API key error, but that's OK - we just want to pass the brokerageId check)
  await test('Firebase-authenticated request without brokerageId → passes brokerageId validation', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Test event'
      },
      {
        'x-flypost-auth-provider': 'firebase',
        'x-flypost-auth-uid': 'test-user-123'
      }
    )

    // We expect it to NOT fail with 400 "Missing brokerageId"
    if (response.status === 400 && response.data.error && response.data.error.includes('Missing brokerageId')) {
      throw new Error(`Firebase auth should bypass brokerageId requirement, but got: ${JSON.stringify(response.data)}`)
    }

    // Any other error (like OpenAI API key missing) is acceptable for this test
    console.log(`   → Got status ${response.status}, error: ${response.data.error || 'none'}`)
  })

  // Test 2: Firebase auth with brokerageId should also work
  await test('Firebase-authenticated request with brokerageId → passes brokerageId validation', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Test event',
        brokerageId: 'test-brokerage'
      },
      {
        'x-flypost-auth-provider': 'firebase',
        'x-flypost-auth-uid': 'test-user-456'
      }
    )

    // We expect it to NOT fail with 400 "Missing brokerageId"
    if (response.status === 400 && response.data.error && response.data.error.includes('Missing brokerageId')) {
      throw new Error(`Should pass brokerageId validation, but got: ${JSON.stringify(response.data)}`)
    }

    console.log(`   → Got status ${response.status}, error: ${response.data.error || 'none'}`)
  })

  // Test 3: Non-Firebase request without brokerageId should fail with 400 "Missing brokerageId"
  await test('Non-Firebase request without brokerageId → REJECTED with 400', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Test event'
      },
      {
        // No Firebase auth headers
      }
    )

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.error || !response.data.error.includes('Missing brokerageId')) {
      throw new Error(`Expected "Missing brokerageId" error, got: ${JSON.stringify(response.data)}`)
    }

    console.log(`   → Correctly rejected with: ${response.data.error}`)
  })

  // Test 4: Non-Firebase request with brokerageId should pass brokerageId validation
  await test('Non-Firebase request with brokerageId → passes brokerageId validation', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Test event',
        brokerageId: 'test-brokerage-2'
      },
      {
        // No Firebase auth headers
      }
    )

    // We expect it to NOT fail with 400 "Missing brokerageId"
    if (response.status === 400 && response.data.error && response.data.error.includes('Missing brokerageId')) {
      throw new Error(`Should pass brokerageId validation, but got: ${JSON.stringify(response.data)}`)
    }

    console.log(`   → Got status ${response.status}, error: ${response.data.error || 'none'}`)
  })

  // Test 5: Non-Firebase request with x-flypost-brokerage-id header should pass validation
  await test('Non-Firebase request with x-flypost-brokerage-id header → passes validation', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Test event'
      },
      {
        'x-flypost-brokerage-id': 'test-brokerage-3'
      }
    )

    // We expect it to NOT fail with 400 "Missing brokerageId"
    if (response.status === 400 && response.data.error && response.data.error.includes('Missing brokerageId')) {
      throw new Error(`Should pass brokerageId validation, but got: ${JSON.stringify(response.data)}`)
    }

    console.log(`   → Got status ${response.status}, error: ${response.data.error || 'none'}`)
  })

  console.log('\n' + '='.repeat(70))
  console.log(`📊 Results: ${passed} passed, ${failed} failed`)
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed!')
    console.log('Note: Tests may show OpenAI API key errors - that\'s OK!')
    console.log('We only validate the brokerageId authentication logic.')
    process.exit(0)
  }
}

// Wait a bit for server to be ready, then run tests
console.log(`\nConnecting to backend at ${BASE_URL}...`)
setTimeout(() => {
  runTests().catch((error) => {
    console.error('❌ Test error:', error)
    process.exit(1)
  })
}, 1000)
