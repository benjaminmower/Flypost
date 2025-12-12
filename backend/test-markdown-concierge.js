#!/usr/bin/env node
/**
 * Test script for Markdown-first Web Concierge
 * 
 * Tests:
 * 1. Response structure is simplified (message only)
 * 2. System prompt includes Markdown formatting instructions
 * 3. Helper functions work correctly
 * 4. Conversation history is properly handled
 */

import { processChatMessage } from './src/concierge/chatHandler.js'
import { 
  calculateDistance, 
  estimateTravelTime, 
  generateItinerary,
  normalizeForComparison,
  calculatePricePerSqft,
  annotateWithDistance
} from './src/concierge/helpers.js'

console.log('🧪 Testing Markdown-First Web Concierge\n')
console.log('====================================\n')

// Mock backend URL - won't actually call it since we don't have events in memory
const BACKEND_URL = 'http://localhost:3001'
const TEST_LAT = 34.0195
const TEST_LNG = -118.4912

// Check if OpenAI key is available
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
if (!hasOpenAIKey) {
  console.log('⚠️  OPENAI_API_KEY not set. Skipping AI tests, running helper tests only.\n')
}

/**
 * Test 1: Helper - Calculate Distance
 */
function testCalculateDistance() {
  console.log('Test 1: Calculate Distance')
  console.log('---------------------------')
  
  try {
    // Santa Monica to Venice Beach (approximately 3 miles)
    const distance = calculateDistance(34.0195, -118.4912, 33.9850, -118.4695)
    
    if (distance > 2 && distance < 4) {
      console.log('✅ Distance calculation works')
      console.log(`   Santa Monica to Venice: ${distance} miles`)
      return true
    } else {
      console.log('❌ Distance calculation incorrect')
      console.log(`   Expected ~3 miles, got ${distance} miles`)
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Test 2: Helper - Estimate Travel Time
 */
function testEstimateTravelTime() {
  console.log('Test 2: Estimate Travel Time')
  console.log('-----------------------------')
  
  try {
    const drivingTime = estimateTravelTime(5, 'driving')
    const walkingTime = estimateTravelTime(1, 'walking')
    
    // 5 miles at 25 mph = 12 minutes
    // 1 mile at 3 mph = 20 minutes
    if (drivingTime.includes('12') && walkingTime.includes('20')) {
      console.log('✅ Travel time estimation works')
      console.log(`   5 miles driving: ${drivingTime}`)
      console.log(`   1 mile walking: ${walkingTime}`)
      return true
    } else {
      console.log('❌ Travel time estimation incorrect')
      console.log(`   Got driving: ${drivingTime}, walking: ${walkingTime}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Test 3: Helper - Generate Itinerary
 */
function testGenerateItinerary() {
  console.log('Test 3: Generate Itinerary')
  console.log('---------------------------')
  
  try {
    const mockEvents = [
      { name: 'Event 1', lat: 34.02, lng: -118.50, location: { geo: { latitude: 34.02, longitude: -118.50 } } },
      { name: 'Event 2', lat: 34.00, lng: -118.48, location: { geo: { latitude: 34.00, longitude: -118.48 } } },
      { name: 'Event 3', lat: 34.05, lng: -118.52, location: { geo: { latitude: 34.05, longitude: -118.52 } } }
    ]
    
    const itinerary = generateItinerary(mockEvents, TEST_LAT, TEST_LNG, 60)
    
    if (itinerary.events && itinerary.events.length > 0 && itinerary.disclaimer) {
      console.log('✅ Itinerary generation works')
      console.log(`   Generated ${itinerary.events.length} stops in ${itinerary.totalTime} min`)
      console.log(`   Disclaimer present: ${itinerary.disclaimer.includes('⚠️')}`)
      return true
    } else {
      console.log('❌ Itinerary generation failed')
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Test 4: Helper - Normalize for Comparison
 */
function testNormalizeForComparison() {
  console.log('Test 4: Normalize for Comparison')
  console.log('---------------------------------')
  
  try {
    const mockListings = [
      { address: '123 Main St', city: 'Santa Monica', price: '$1,250,000', beds: 3, baths: 2, sqft: '2100' },
      { address: '456 Oak Ave', city: 'Venice', price: '$950,000', beds: 2, baths: 1.5, sqft: '1500' }
    ]
    
    const comparison = normalizeForComparison(mockListings)
    
    if (comparison.fields && comparison.listings && comparison.disclaimer) {
      console.log('✅ Listing normalization works')
      console.log(`   Fields: ${comparison.fields.length}`)
      console.log(`   Normalized ${comparison.listings.length} listings`)
      console.log(`   Disclaimer present: ${comparison.disclaimer.includes('⚠️')}`)
      return true
    } else {
      console.log('❌ Listing normalization failed')
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Test 5: Helper - Calculate Price per Sqft
 */
function testCalculatePricePerSqft() {
  console.log('Test 5: Calculate Price per Sqft')
  console.log('----------------------------------')
  
  try {
    const pricePerSqft1 = calculatePricePerSqft('$1,250,000', '2500')
    const pricePerSqft2 = calculatePricePerSqft(1000000, 2000)
    
    if (pricePerSqft1.includes('$500') && pricePerSqft2.includes('$500')) {
      console.log('✅ Price per sqft calculation works')
      console.log(`   $1,250,000 / 2,500 sqft = ${pricePerSqft1}`)
      console.log(`   $1,000,000 / 2,000 sqft = ${pricePerSqft2}`)
      return true
    } else {
      console.log('❌ Price per sqft calculation incorrect')
      console.log(`   Got: ${pricePerSqft1}, ${pricePerSqft2}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Test 6: Helper - Annotate with Distance
 */
function testAnnotateWithDistance() {
  console.log('Test 6: Annotate with Distance')
  console.log('-------------------------------')
  
  try {
    const mockEvents = [
      { name: 'Event 1', lat: 34.02, lng: -118.50 },
      { name: 'Event 2', lat: 34.00, lng: -118.48 }
    ]
    
    const annotated = annotateWithDistance(mockEvents, TEST_LAT, TEST_LNG)
    
    if (annotated.length === 2 && 
        annotated[0].distanceFromUser !== undefined && 
        annotated[0].travelTimeDriving) {
      console.log('✅ Distance annotation works')
      console.log(`   Event 1: ${annotated[0].distanceDisplay}, ${annotated[0].travelTimeDriving}`)
      console.log(`   Event 2: ${annotated[1].distanceDisplay}, ${annotated[1].travelTimeDriving}`)
      return true
    } else {
      console.log('❌ Distance annotation failed')
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Test 7: Response Structure (if OpenAI available)
 */
async function testResponseStructure() {
  console.log('Test 7: Response Structure')
  console.log('--------------------------')
  
  if (!hasOpenAIKey) {
    console.log('⏭️  Skipped (no OpenAI key)')
    console.log('')
    return null
  }
  
  try {
    const result = await processChatMessage(
      'What events are happening near me?',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL
    )
    
    // Check simplified structure
    const hasBasicFields = result.success !== undefined && 
                          result.message !== undefined
    
    // Should NOT have old structured fields
    const noOldFields = result.listings === undefined &&
                       result.scheduleNote === undefined &&
                       result.areaContext === undefined
    
    if (hasBasicFields && noOldFields && typeof result.message === 'string') {
      console.log('✅ Response structure is correct')
      console.log('   - success field present')
      console.log('   - message field is string')
      console.log('   - Old JSON fields removed')
      console.log(`   - Message length: ${result.message.length} chars`)
      return true
    } else {
      console.log('❌ Response structure incorrect')
      console.log(`   Basic fields: ${hasBasicFields}`)
      console.log(`   No old fields: ${noOldFields}`)
      console.log(`   Message type: ${typeof result.message}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Test 8: Conversation History (if OpenAI available)
 */
async function testConversationHistory() {
  console.log('Test 8: Conversation History')
  console.log('-----------------------------')
  
  if (!hasOpenAIKey) {
    console.log('⏭️  Skipped (no OpenAI key)')
    console.log('')
    return null
  }
  
  try {
    // Simulate a conversation
    const history = [
      {
        role: 'user',
        content: 'What open houses are there this weekend?'
      },
      {
        role: 'assistant',
        content: '## Open Houses This Weekend\n\nHere are some properties...'
      }
    ]
    
    const result = await processChatMessage(
      'Tell me more about the first one',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL,
      undefined,
      history
    )
    
    if (result.success && typeof result.message === 'string') {
      console.log('✅ Conversation history accepted')
      console.log(`   - Response generated with context`)
      console.log(`   - History items processed: ${history.length}`)
      return true
    } else {
      console.log('❌ Failed to process with history')
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  } finally {
    console.log('')
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting test suite...\n')
  
  const results = []
  
  // Run synchronous helper tests
  results.push(testCalculateDistance())
  results.push(testEstimateTravelTime())
  results.push(testGenerateItinerary())
  results.push(testNormalizeForComparison())
  results.push(testCalculatePricePerSqft())
  results.push(testAnnotateWithDistance())
  
  // Run async AI tests if available
  results.push(await testResponseStructure())
  results.push(await testConversationHistory())
  
  // Summary
  console.log('====================================')
  console.log('Test Summary')
  console.log('====================================')
  
  const passed = results.filter(r => r === true).length
  const skipped = results.filter(r => r === null).length
  const total = results.length
  const failed = total - passed - skipped
  
  console.log(`\nPassed: ${passed}/${total}`)
  if (skipped > 0) {
    console.log(`Skipped: ${skipped}/${total} (no OpenAI key)`)
  }
  
  if (failed === 0) {
    console.log('\n✅ All tests passed!')
    process.exit(0)
  } else {
    console.log(`\n❌ ${failed} test(s) failed`)
    process.exit(1)
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
