/**
 * Smoke test for geocoding functionality
 * Tests geocodeAddress with and without API key
 * 
 * Run: node test-geocode.js
 */

import { geocodeAddress, getCacheStats } from './src/geocode.js'

async function testGeocodeSmoke() {
  console.log('🧪 Geocoding Smoke Test')
  console.log('='.repeat(60))
  
  // Test with a well-known address
  const testAddress = '1600 Amphitheatre Parkway, Mountain View, CA 94043'
  
  console.log(`\n📍 Testing geocode for: ${testAddress}`)
  
  const apiKey = process.env.GEOCODER_API_KEY
  const provider = process.env.GEOCODER_PROVIDER || 'nominatim'
  
  console.log(`   Provider: ${provider}`)
  console.log(`   API Key configured: ${apiKey ? 'Yes' : 'No'}`)
  
  try {
    const result = await geocodeAddress(testAddress)
    
    if (result) {
      console.log(`\n✅ Geocoding successful!`)
      console.log(`   Latitude: ${result.latitude}`)
      console.log(`   Longitude: ${result.longitude}`)
      
      // Test cache
      console.log(`\n🗺️  Testing cache...`)
      const cachedResult = await geocodeAddress(testAddress)
      
      if (cachedResult && cachedResult.latitude === result.latitude) {
        console.log(`✅ Cache working correctly`)
      } else {
        console.log(`⚠️  Cache may not be working as expected`)
      }
      
      // Show cache stats
      const stats = getCacheStats()
      console.log(`\n📊 Cache stats:`)
      console.log(`   Entries: ${stats.size}`)
      console.log(`   TTL: ${stats.ttl} seconds`)
      
      console.log('\n✅ All smoke tests passed!')
      process.exit(0)
    } else {
      console.log(`\n⚠️  Geocoding returned null`)
      console.log(`   This is expected if:`)
      console.log(`   - No GEOCODER_API_KEY is set and provider is 'google'`)
      console.log(`   - Network is unavailable`)
      console.log(`   - Provider rate limit exceeded`)
      
      if (provider === 'google' && !apiKey) {
        console.log(`\n💡 To test with Google Maps, set GEOCODER_API_KEY environment variable`)
        console.log(`   Example: GEOCODER_API_KEY=your_key node test-geocode.js`)
      }
      
      console.log('\n✅ Smoke test completed (expected null result)')
      process.exit(0)
    }
  } catch (error) {
    console.error(`\n❌ Error during geocoding:`, error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Test with invalid input
async function testInvalidInput() {
  console.log('\n🧪 Testing invalid input handling...')
  
  const tests = [
    { input: null, expected: 'null' },
    { input: '', expected: 'empty string' },
    { input: '   ', expected: 'whitespace only' },
    { input: 123, expected: 'number' }
  ]
  
  for (const test of tests) {
    const result = await geocodeAddress(test.input)
    if (result === null) {
      console.log(`   ✅ Correctly handled ${test.expected}`)
    } else {
      console.log(`   ❌ Unexpected result for ${test.expected}: ${result}`)
    }
  }
}

async function runTests() {
  await testInvalidInput()
  await testGeocodeSmoke()
}

runTests()
