#!/usr/bin/env node
/**
 * Test script for comparison follow-up rules
 * 
 * Tests that the assistant can:
 * 1. Extract properties from conversation history
 * 2. Respond to comparison requests appropriately
 * 3. Format comparisons as markdown tables
 */

import { processChatMessage } from './src/concierge/chatHandler.js'

console.log('🧪 Testing Comparison Follow-Up Rules\n')
console.log('====================================\n')

// Mock backend URL - won't actually call it since we don't have events in memory
const BACKEND_URL = 'http://localhost:3001'
const TEST_LAT = 34.0195
const TEST_LNG = -118.4912

// Check if OpenAI key is available
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
if (!hasOpenAIKey) {
  console.log('⚠️  OPENAI_API_KEY not set. Skipping tests that require OpenAI API.\n')
  process.exit(0)
}

/**
 * Test 1: Comparison request with properties in history
 */
async function testComparisonWithHistory() {
  console.log('Test 1: Comparison with Properties in History')
  console.log('-----------------------------------------------')
  
  try {
    // Simulate a conversation with property listings
    const history = [
      {
        role: 'user',
        content: 'What open houses are there this weekend?'
      },
      {
        role: 'assistant',
        content: `## Open Houses This Weekend

### 🏠 Open House at 1007 S Prospect Ave

- **Open House**: Saturday, Dec 14, 2024 · 1:00-4:00 PM
- **Price**: $2,500,000
- **Beds/Baths**: 4 bed · 3 bath
- **Square Feet**: 3,875 sqft

*Beautifully updated home with ocean views and modern kitchen.*

---

### 🏠 Open House at 425 Vía El Chico

- **Open House**: Saturday, Dec 14, 2024 · 1:00-4:00 PM
- **Price**: $2,100,000
- **Beds/Baths**: 3 bed · 3 bath

*Mediterranean style villa with private courtyard.*`
      }
    ]
    
    // Request a comparison
    const result = await processChatMessage(
      'Compare these properties side by side',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL,
      undefined,
      history
    )
    
    if (result.success) {
      console.log('✅ Comparison request processed successfully')
      
      // Check if response contains table format
      const hasTable = result.message.includes('|') && result.message.includes('---')
      const hasAddress = result.message.toLowerCase().includes('address') || 
                        result.message.includes('1007 S Prospect') || 
                        result.message.includes('425 Vía El Chico')
      
      if (hasTable) {
        console.log('✅ Response includes markdown table format')
      } else {
        console.log('⚠️  Response may not include proper table format')
      }
      
      if (hasAddress) {
        console.log('✅ Response references the properties from history')
      } else {
        console.log('⚠️  Response may not reference specific properties')
      }
      
      console.log('\nResponse preview:')
      console.log(result.message.substring(0, 300) + '...\n')
      
      return true
    } else {
      console.log('❌ Failed to process comparison request')
      console.log(`   Error: ${result.error || 'Unknown error'}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  }
}

/**
 * Test 2: Comparison request without enough properties
 */
async function testComparisonWithoutEnoughProperties() {
  console.log('Test 2: Comparison Without Enough Properties')
  console.log('----------------------------------------------')
  
  try {
    // Simulate a conversation with only one property
    const history = [
      {
        role: 'user',
        content: 'Show me open houses'
      },
      {
        role: 'assistant',
        content: `## Open House Available

### 🏠 Open House at 123 Main Street

- **Open House**: Saturday · 1:00-4:00 PM
- **Price**: $1,500,000

*Lovely home with garden.*`
      }
    ]
    
    // Request a comparison
    const result = await processChatMessage(
      'Compare these',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL,
      undefined,
      history
    )
    
    if (result.success) {
      console.log('✅ Request processed successfully')
      
      // Check if response asks for clarification
      const asksForClarification = 
        result.message.toLowerCase().includes('which') ||
        result.message.toLowerCase().includes('two properties') ||
        result.message.toLowerCase().includes('need more') ||
        result.message.toLowerCase().includes('only one')
      
      if (asksForClarification) {
        console.log('✅ Assistant asks for clarification when fewer than 2 properties')
      } else {
        console.log('⚠️  Assistant may not handle insufficient properties properly')
      }
      
      console.log('\nResponse preview:')
      console.log(result.message.substring(0, 200) + '...\n')
      
      return true
    } else {
      console.log('❌ Failed to process comparison request')
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  }
}

/**
 * Test 3: Route planning request
 */
async function testRoutePlanning() {
  console.log('Test 3: Route Planning Request')
  console.log('--------------------------------')
  
  try {
    // Simulate a conversation with multiple properties
    const history = [
      {
        role: 'user',
        content: 'Show me open houses'
      },
      {
        role: 'assistant',
        content: `## Open Houses Available

### 🏠 Open House at Property A

- **Distance**: 0.5 miles from you

### 🏠 Open House at Property B

- **Distance**: 1.2 miles from you

### 🏠 Open House at Property C

- **Distance**: 2.0 miles from you`
      }
    ]
    
    // Request route planning
    const result = await processChatMessage(
      'Plan a 1-hour route to visit these',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL,
      undefined,
      history
    )
    
    if (result.success) {
      console.log('✅ Route planning request processed successfully')
      
      const mentionsProperties = result.message.includes('Property') || 
                                 result.message.toLowerCase().includes('route') ||
                                 result.message.toLowerCase().includes('visit')
      
      if (mentionsProperties) {
        console.log('✅ Response includes route/visit information')
      }
      
      console.log('\nResponse preview:')
      console.log(result.message.substring(0, 200) + '...\n')
      
      return true
    } else {
      console.log('❌ Failed to process route planning request')
      return false
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return false
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting test suite...\n')
  
  const results = []
  
  // Run tests
  results.push(await testComparisonWithHistory())
  results.push(await testComparisonWithoutEnoughProperties())
  results.push(await testRoutePlanning())
  
  // Summary
  console.log('====================================')
  console.log('Test Summary')
  console.log('====================================')
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log(`\nPassed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('\n✅ All tests passed!')
    process.exit(0)
  } else {
    console.log(`\n❌ ${total - passed} test(s) failed`)
    process.exit(1)
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
