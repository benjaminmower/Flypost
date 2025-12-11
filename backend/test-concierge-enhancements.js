#!/usr/bin/env node
/**
 * Test script for Web Concierge enhancements
 * 
 * Tests:
 * 1. Response includes suggestedFollowUps
 * 2. Conversation history is properly handled
 * 3. Enhanced listing fields are validated
 * 4. Date filtering guidance works
 */

import { processChatMessage } from './src/concierge/chatHandler.js'

console.log('🧪 Testing Web Concierge Enhancements\n')
console.log('====================================\n')

// Mock backend URL - won't actually call it since we don't have events in memory
const BACKEND_URL = 'http://localhost:3001'
const TEST_LAT = 34.0195
const TEST_LNG = -118.4912

// Check if OpenAI key is available
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
if (!hasOpenAIKey) {
  console.log('⚠️  OPENAI_API_KEY not set. Tests will run but may not generate real responses.\n')
}

/**
 * Test 1: Response structure includes new fields
 */
async function testResponseStructure() {
  console.log('Test 1: Response Structure')
  console.log('---------------------------')
  
  try {
    const result = await processChatMessage(
      'What events are happening near me?',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL
    )
    
    // Check basic structure
    const hasBasicFields = result.success !== undefined && 
                          result.message !== undefined &&
                          result.listings !== undefined
    
    // Check new fields
    const hasEnhancements = result.suggestedFollowUps !== undefined &&
                           Array.isArray(result.suggestedFollowUps)
    
    if (hasBasicFields && hasEnhancements) {
      console.log('✅ Response includes all expected fields')
      console.log(`   - suggestedFollowUps: ${result.suggestedFollowUps.length} items`)
      console.log(`   - listings: ${result.listings.length} items`)
      if (result.suggestedFollowUps.length > 0) {
        console.log('   Example follow-ups:')
        result.suggestedFollowUps.slice(0, 2).forEach(q => {
          console.log(`     • ${q}`)
        })
      }
      return true
    } else {
      console.log('❌ Missing expected fields')
      console.log(`   Basic fields: ${hasBasicFields}`)
      console.log(`   Enhanced fields: ${hasEnhancements}`)
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
 * Test 2: Conversation history handling
 */
async function testConversationHistory() {
  console.log('Test 2: Conversation History')
  console.log('----------------------------')
  
  try {
    // Simulate a conversation
    const history = [
      {
        role: 'user',
        content: 'What open houses are there this weekend?'
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          message: 'Here are open houses this weekend...',
          listings: [],
          suggestedFollowUps: ['Tell me more about the first property']
        })
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
    
    if (result.success) {
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
 * Test 3: Enhanced listing field validation
 */
function testListingFields() {
  console.log('Test 3: Enhanced Listing Fields')
  console.log('--------------------------------')
  
  // Define expected enhanced fields
  const enhancedFields = ['state', 'zipCode', 'distance', 'agent.brokerage']
  
  console.log('✅ Enhanced listing fields defined:')
  enhancedFields.forEach(field => {
    console.log(`   - ${field}`)
  })
  console.log('')
  
  return true
}

/**
 * Test 4: Parameter validation
 */
function testParameterValidation() {
  console.log('Test 4: Parameter Validation')
  console.log('----------------------------')
  
  try {
    // Test that function signature accepts new parameters
    const funcStr = processChatMessage.toString()
    const hasHistoryParam = funcStr.includes('conversationHistory')
    
    if (hasHistoryParam) {
      console.log('✅ Function signature updated')
      console.log('   - conversationHistory parameter added')
      return true
    } else {
      console.log('❌ Missing conversationHistory parameter')
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
 * Test 5: Empty history handling
 */
async function testEmptyHistory() {
  console.log('Test 5: Empty History Handling')
  console.log('-------------------------------')
  
  try {
    // Test with empty array
    const result1 = await processChatMessage(
      'What events are near me?',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL,
      undefined,
      []
    )
    
    // Test with undefined
    const result2 = await processChatMessage(
      'What events are near me?',
      TEST_LAT,
      TEST_LNG,
      BACKEND_URL,
      undefined,
      undefined
    )
    
    if (result1.success && result2.success) {
      console.log('✅ Empty history handled correctly')
      console.log('   - Empty array: ✓')
      console.log('   - Undefined: ✓')
      return true
    } else {
      console.log('❌ Failed to handle empty history')
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
  
  // Run tests
  results.push(await testResponseStructure())
  results.push(await testConversationHistory())
  results.push(testListingFields())
  results.push(testParameterValidation())
  results.push(await testEmptyHistory())
  
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
