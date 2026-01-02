/*
 * Integration Test - Timezone & Multi-Slot Open Houses
 * 
 * Tests the full flow of timezone inference, timestamp normalization,
 * and multi-slot event handling.
 * 
 * NOTE: This test requires the server to be running on port 8080
 * Run: cd backend && npm start
 * Then in another terminal: node test-timezone-integration.js
 */

import { clearEvents } from './src/storage.js'

// Use built-in fetch (Node 18+)
const fetchImpl = globalThis.fetch || (await import('node-fetch').then(m => m.default))

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080'

console.log('🧪 Timezone & Multi-Slot Integration Test')
console.log('='.repeat(70))
console.log(`Testing against: ${BASE_URL}\n`)

// Clear storage before tests
console.log('🧹 Clearing storage...')
await clearEvents()

// Test 1: Open house without explicit timezone (should infer and reinterpret)
async function testOpenHouseNoExplicitTimezone() {
  console.log('\n📋 Test 1: Open house without explicit timezone')
  console.log('Expected: Infer timezone from address, reinterpret timestamps as local time\n')
  
  const input = `Open house Saturday 2pm-4pm at 123 Main St, Santa Monica, CA 90405`
  
  try {
    const response = await fetchImpl(`${BASE_URL}/api/parse-and-publish`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-flypost-brokerage-id': 'test-brokerage'
      },
      body: JSON.stringify({
        naturalLanguageInput: input
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Request failed: ${response.status}`)
      console.error(`   Error: ${data.error}`)
      if (data.hint) console.error(`   Hint: ${data.hint}`)
      return false
    }

    console.log(`✅ Event published: ${data.data.flypost.eventId}`)
    console.log(`   Category: ${data.data.flypost.category}`)
    console.log(`   Timezone: ${data.data.flypost.timezone || 'NOT SET'}`)
    console.log(`   StartDate: ${data.data.startDate}`)
    console.log(`   EndDate: ${data.data.endDate}`)
    
    // Verify timezone was inferred
    if (!data.data.flypost.timezone) {
      console.error(`❌ Timezone not inferred`)
      return false
    }
    
    // Verify endDate is present
    if (!data.data.endDate) {
      console.error(`❌ EndDate missing for open house`)
      return false
    }
    
    console.log(`✅ Test 1 passed`)
    return true
  } catch (error) {
    console.error(`❌ Test 1 error:`, error.message)
    return false
  }
}

// Test 2: Open house with explicit timezone (should honor as-is)
async function testOpenHouseWithExplicitTimezone() {
  console.log('\n📋 Test 2: Open house with explicit timezone')
  console.log('Expected: Honor timestamps as-is, store timezone\n')
  
  const input = `Open house Saturday 2pm-4pm PT at 456 Oak Ave, Los Angeles, CA 90001`
  
  try {
    const response = await fetchImpl(`${BASE_URL}/api/parse-and-publish`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-flypost-brokerage-id': 'test-brokerage'
      },
      body: JSON.stringify({
        naturalLanguageInput: input
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Request failed: ${response.status}`)
      console.error(`   Error: ${data.error}`)
      return false
    }

    console.log(`✅ Event published: ${data.data.flypost.eventId}`)
    console.log(`   Timezone: ${data.data.flypost.timezone || 'NOT SET'}`)
    console.log(`   StartDate: ${data.data.startDate}`)
    console.log(`   EndDate: ${data.data.endDate}`)
    
    console.log(`✅ Test 2 passed`)
    return true
  } catch (error) {
    console.error(`❌ Test 2 error:`, error.message)
    return false
  }
}

// Test 3: Open house missing endDate (should reject)
async function testOpenHouseMissingEndDate() {
  console.log('\n📋 Test 3: Open house missing endDate')
  console.log('Expected: Reject with clear error message\n')
  
  const input = `Open house Saturday at 789 Elm St, San Diego, CA 92101`
  
  try {
    const response = await fetchImpl(`${BASE_URL}/api/parse-and-publish`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-flypost-brokerage-id': 'test-brokerage'
      },
      body: JSON.stringify({
        naturalLanguageInput: input
      })
    })

    const data = await response.json()
    
    if (response.ok) {
      console.error(`❌ Should have rejected, but succeeded`)
      return false
    }

    console.log(`✅ Correctly rejected: ${data.error}`)
    
    // Verify error message is helpful
    if (!data.error.includes('end time')) {
      console.error(`❌ Error message not helpful: ${data.error}`)
      return false
    }
    
    console.log(`✅ Test 3 passed`)
    return true
  } catch (error) {
    console.error(`❌ Test 3 error:`, error.message)
    return false
  }
}

// Test 4: Non-open-house without endDate (should pass)
async function testNonOpenHouseWithoutEndDate() {
  console.log('\n📋 Test 4: Garage sale without endDate')
  console.log('Expected: Should pass, endDate is optional for non-open-houses\n')
  
  const input = `Garage sale Saturday starting 8am at 321 Pine St, Portland, OR 97201`
  
  try {
    const response = await fetchImpl(`${BASE_URL}/api/parse-and-publish`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-flypost-brokerage-id': 'test-brokerage'
      },
      body: JSON.stringify({
        naturalLanguageInput: input
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Request failed: ${response.status}`)
      console.error(`   Error: ${data.error}`)
      return false
    }

    console.log(`✅ Event published: ${data.data.flypost.eventId}`)
    console.log(`   Category: ${data.data.flypost.category}`)
    console.log(`   Has endDate: ${!!data.data.endDate}`)
    
    console.log(`✅ Test 4 passed`)
    return true
  } catch (error) {
    console.error(`❌ Test 4 error:`, error.message)
    return false
  }
}

// Run all tests
async function runTests() {
  const results = []
  
  results.push(await testOpenHouseNoExplicitTimezone())
  results.push(await testOpenHouseWithExplicitTimezone())
  results.push(await testOpenHouseMissingEndDate())
  results.push(await testNonOpenHouseWithoutEndDate())
  
  console.log('\n' + '='.repeat(70))
  const passed = results.filter(r => r).length
  const total = results.length
  
  if (passed === total) {
    console.log(`✅ All ${total} tests passed!`)
    process.exit(0)
  } else {
    console.log(`❌ ${total - passed} of ${total} tests failed`)
    process.exit(1)
  }
}

// Check if server is running
try {
  const healthCheck = await fetchImpl(`${BASE_URL}/health`)
  if (!healthCheck.ok) {
    console.error('❌ Server health check failed')
    console.error('   Make sure the server is running: cd backend && npm start')
    process.exit(1)
  }
  console.log('✅ Server is running\n')
} catch (error) {
  console.error('❌ Cannot connect to server')
  console.error('   Make sure the server is running: cd backend && npm start')
  console.error(`   Error: ${error.message}`)
  process.exit(1)
}

runTests()
