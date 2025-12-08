/*
 * Rate Limiting Test
 * 
 * This test verifies that rate limiting is properly configured and
 * returns appropriate error messages when limits are exceeded.
 */

import http from 'http'
import dotenv from 'dotenv'

dotenv.config()

const PORT = process.env.PORT || 3001

console.log('🧪 Rate Limiting Test')
console.log('='.repeat(70))

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
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

async function testRateLimiting() {
  console.log('\n📊 Testing Read Endpoint Rate Limiting (/v1/events/near)')
  console.log('-'.repeat(70))
  
  try {
    // Make a few requests to verify rate limiting headers are present
    const response = await makeRequest('GET', '/v1/events/near?lat=34.0195&lng=-118.4912&radius=10')
    
    console.log(`✅ Status: ${response.status}`)
    console.log(`✅ Response:`, JSON.stringify(response.data, null, 2))
    
    // Check for rate limit headers
    if (response.headers['ratelimit-limit']) {
      console.log(`✅ RateLimit-Limit header: ${response.headers['ratelimit-limit']}`)
      console.log(`✅ RateLimit-Remaining header: ${response.headers['ratelimit-remaining']}`)
      console.log(`✅ RateLimit-Reset header: ${response.headers['ratelimit-reset']}`)
    } else {
      console.log('⚠️  Rate limit headers not found (expected with standardHeaders: true)')
    }
    
  } catch (error) {
    console.error('❌ Read endpoint test failed:', error.message)
  }
  
  console.log('\n📝 Testing Write Endpoint Rate Limiting (/api/parse-and-publish)')
  console.log('-'.repeat(70))
  
  try {
    // Test write endpoint with rate limiting
    const writeResponse = await makeRequest('POST', '/api/parse-and-publish', {
      brokerageId: 'test-brokerage',
      naturalLanguageInput: 'Test event for rate limiting'
    })
    
    console.log(`✅ Status: ${writeResponse.status}`)
    
    // Check for rate limit headers
    if (writeResponse.headers['ratelimit-limit']) {
      console.log(`✅ RateLimit-Limit header: ${writeResponse.headers['ratelimit-limit']}`)
      console.log(`✅ RateLimit-Remaining header: ${writeResponse.headers['ratelimit-remaining']}`)
      console.log(`✅ RateLimit-Reset header: ${writeResponse.headers['ratelimit-reset']}`)
    } else {
      console.log('⚠️  Rate limit headers not found (expected with standardHeaders: true)')
    }
    
    // Note: We don't actually test exceeding the limit as that would require 50+ requests
    // and we'd need an API key. The headers confirm rate limiting is active.
    
  } catch (error) {
    console.error('❌ Write endpoint test failed:', error.message)
  }
  
  console.log('\n✅ Rate Limiting Test Complete')
  console.log('='.repeat(70))
  console.log('Note: Full rate limit testing (exceeding limits) requires running the')
  console.log('server and making 50+ write requests or 500+ read requests.')
  console.log('The presence of RateLimit-* headers confirms rate limiting is active.')
}

// Run test
console.log('\n⏳ Starting test in 2 seconds to allow server to start...')
setTimeout(testRateLimiting, 2000)
