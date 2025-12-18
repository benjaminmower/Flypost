#!/usr/bin/env node

/*
 * Test: Firebase Auth with Optional brokerageId
 * 
 * This test verifies that:
 * 1. Firebase-authenticated requests can publish without brokerageId
 * 2. Non-Firebase requests still require brokerageId
 */

import http from 'http'
import dotenv from 'dotenv'

dotenv.config()

const PORT = process.env.PORT || 3001
const BASE_URL = `http://localhost:${PORT}`

console.log('🧪 Testing Firebase Auth with Optional brokerageId')
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

  // Test 1: Firebase auth without brokerageId should succeed
  await test('Firebase-authenticated request without brokerageId → SUCCESS', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Open house Saturday 2pm at 123 Main St, Santa Monica CA 90405. Price $2.5M'
      },
      {
        'x-flypost-auth-provider': 'firebase',
        'x-flypost-auth-uid': 'test-user-123'
      }
    )

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.success) {
      throw new Error(`Expected success=true, got: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.data?.eventId) {
      throw new Error(`Expected eventId in response, got: ${JSON.stringify(response.data)}`)
    }
  })

  // Test 2: Firebase auth with brokerageId should still work
  await test('Firebase-authenticated request with brokerageId → SUCCESS', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Open house Sunday 3pm at 456 Oak Ave, Santa Monica CA 90405. List price $1.8M',
        brokerageId: 'test-brokerage'
      },
      {
        'x-flypost-auth-provider': 'firebase',
        'x-flypost-auth-uid': 'test-user-456'
      }
    )

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.success) {
      throw new Error(`Expected success=true, got: ${JSON.stringify(response.data)}`)
    }
  })

  // Test 3: Non-Firebase request without brokerageId should fail
  await test('Non-Firebase request without brokerageId → FAIL (400)', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Open house Monday 4pm at 789 Pine St, Santa Monica CA 90405. Price $3M'
      },
      {
        // No Firebase auth headers
      }
    )

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.error || !response.data.error.includes('brokerageId')) {
      throw new Error(`Expected brokerageId error message, got: ${JSON.stringify(response.data)}`)
    }
  })

  // Test 4: Non-Firebase request with brokerageId should succeed (if proxy normally adds it)
  await test('Non-Firebase request with brokerageId → SUCCESS', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Open house Tuesday 1pm at 321 Elm Dr, Santa Monica CA 90405. List price $2.2M',
        brokerageId: 'test-brokerage-2'
      },
      {
        // No Firebase auth headers
      }
    )

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.success) {
      throw new Error(`Expected success=true, got: ${JSON.stringify(response.data)}`)
    }
  })

  // Test 5: Non-Firebase request with x-flypost-brokerage-id header should succeed
  await test('Non-Firebase request with x-flypost-brokerage-id header → SUCCESS', async () => {
    const response = await makeRequest(
      'POST',
      '/api/parse-and-publish',
      {
        naturalLanguageInput: 'Open house Wednesday 5pm at 654 Maple Ct, Santa Monica CA 90405. Price $4M'
      },
      {
        'x-flypost-brokerage-id': 'test-brokerage-3'
      }
    )

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`)
    }

    if (!response.data.success) {
      throw new Error(`Expected success=true, got: ${JSON.stringify(response.data)}`)
    }
  })

  console.log('\n' + '='.repeat(70))
  console.log(`📊 Results: ${passed} passed, ${failed} failed`)
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed!')
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
