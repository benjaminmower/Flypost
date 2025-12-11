#!/usr/bin/env node
/**
 * Test script for Web Concierge structure enhancements
 * 
 * This test validates the code structure without requiring OpenAI API calls
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing Web Concierge Structure Enhancements\n')
console.log('================================================\n')

let passCount = 0
let failCount = 0

/**
 * Test helper
 */
function test(name, fn) {
  try {
    const result = fn()
    if (result) {
      console.log(`✅ ${name}`)
      passCount++
    } else {
      console.log(`❌ ${name}`)
      failCount++
    }
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`)
    failCount++
  }
}

/**
 * Read and parse file
 */
function readSourceFile(filename) {
  const path = join(__dirname, 'src', 'concierge', filename)
  return readFileSync(path, 'utf-8')
}

// Test 1: chatHandler.js has conversationHistory parameter
test('chatHandler.js: processChatMessage accepts conversationHistory', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('conversationHistory') && 
         content.includes('conversationHistory = []')
})

// Test 2: chatHandler.js returns suggestedFollowUps
test('chatHandler.js: Response includes suggestedFollowUps field', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('suggestedFollowUps:') &&
         content.includes('parsedResponse.suggestedFollowUps')
})

// Test 3: chatHandler.js has enhanced listing fields in system prompt
test('chatHandler.js: System prompt includes state field', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('"state"') && content.includes('State abbreviation')
})

test('chatHandler.js: System prompt includes zipCode field', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('"zipCode"') && content.includes('ZIP code')
})

test('chatHandler.js: System prompt includes distance field', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('"distance"') && content.includes('miles')
})

test('chatHandler.js: System prompt includes agent.brokerage field', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('agent.brokerage') || content.includes('"brokerage"')
})

// Test 4: chatHandler.js has date filtering guidance
test('chatHandler.js: Includes date filtering guidance', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('Date & Time Filtering') || 
         content.includes('this weekend') ||
         content.includes('Calculate specific dates')
})

// Test 5: chatHandler.js has follow-up conversation guidance
test('chatHandler.js: Includes follow-up conversation guidance', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('Follow-Up Conversations') || 
         content.includes('conversation history')
})

// Test 6: chatHandler.js handles conversation history in messages
test('chatHandler.js: Adds conversation history to messages', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('conversationHistory') &&
         content.includes('messages.push') &&
         content.includes('Array.isArray(conversationHistory)')
})

// Test 7: chatHandler.js limits history to control token usage
test('chatHandler.js: Limits conversation history length', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('slice(-10)') || content.includes('Limit history')
})

// Test 8: routes.js accepts conversationHistory parameter
test('routes.js: Validates conversationHistory parameter', () => {
  const content = readSourceFile('routes.js')
  return content.includes('conversationHistory') &&
         content.includes('Array.isArray(conversationHistory)')
})

// Test 9: routes.js returns suggestedFollowUps
test('routes.js: Response includes suggestedFollowUps', () => {
  const content = readSourceFile('routes.js')
  return content.includes('suggestedFollowUps:')
})

// Test 10: routes.js passes conversationHistory to processChatMessage
test('routes.js: Passes conversationHistory to handler', () => {
  const content = readSourceFile('routes.js')
  return content.includes('processChatMessage') &&
         content.includes('conversationHistory')
})

// Test 11: routes.js logs conversation history
test('routes.js: Logs conversation history in requests', () => {
  const content = readSourceFile('routes.js')
  return content.includes('history_msgs') || content.includes('logHistory')
})

// Test 12: routes.js has updated API documentation
test('routes.js: API documentation includes new parameters', () => {
  const content = readSourceFile('routes.js')
  return content.includes('conversationHistory') &&
         content.includes('suggestedFollowUps')
})

// Test 13: chatHandler.js requires suggestedFollowUps in restrictions
test('chatHandler.js: Restrictions require suggestedFollowUps', () => {
  const content = readSourceFile('chatHandler.js')
  return content.includes('ALWAYS include suggestedFollowUps') ||
         content.includes('include suggestedFollowUps')
})

// Test 14: chatHandler.js has suggestedFollowUps in location clarification
test('chatHandler.js: Location clarification includes suggestedFollowUps', () => {
  const content = readSourceFile('chatHandler.js')
  const lines = content.split('\n')
  let inLocationSection = false
  let foundFollowUps = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('Location Clarification')) {
      inLocationSection = true
      continue
    }
    if (inLocationSection) {
      if (line.includes('suggestedFollowUps')) {
        foundFollowUps = true
        break
      }
      // Check for next section header (## followed by space and text)
      if (line.trim().match(/^## [A-Z]/)) {
        break
      }
    }
  }
  
  return foundFollowUps
})

// Print summary
console.log('\n================================================')
console.log('Test Summary')
console.log('================================================')
console.log(`\nTotal: ${passCount + failCount}`)
console.log(`Passed: ${passCount}`)
console.log(`Failed: ${failCount}`)

if (failCount === 0) {
  console.log('\n✅ All structure tests passed!')
  process.exit(0)
} else {
  console.log(`\n❌ ${failCount} test(s) failed`)
  process.exit(1)
}
