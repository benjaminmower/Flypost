#!/usr/bin/env node
/**
 * Test: Discovery V1 Response Parsing
 * 
 * Regression test to ensure executeGetEventsNear correctly parses
 * the Discovery V1 response format from /v1/events/near endpoint.
 * 
 * This test verifies the fix for the bug where the concierge was
 * incorrectly parsing data.data.events instead of data.events.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing Discovery V1 Response Parsing\n')
console.log('==========================================\n')

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
 * Read and parse chatHandler source
 */
function readChatHandler() {
  const path = join(__dirname, 'src', 'concierge', 'chatHandler.js')
  return readFileSync(path, 'utf-8')
}

// Test 1: Verify code correctly reads data.events (top-level)
test('executeGetEventsNear: Reads events from data.events (not data.data.events)', () => {
  const content = readChatHandler()
  
  // Find the executeGetEventsNear function
  const functionStart = content.indexOf('async function executeGetEventsNear')
  const functionEnd = content.indexOf('\n}\n', functionStart)
  const functionContent = content.substring(functionStart, functionEnd)
  
  // Should use data.events (top-level)
  const usesTopLevelEvents = functionContent.includes('data.events')
  
  // Should NOT use data.data.events (incorrect nested path)
  const usesNestedEvents = functionContent.includes('data.data?.events') || 
                           functionContent.includes('data.data.events')
  
  return usesTopLevelEvents && !usesNestedEvents
})

// Test 2: Verify code correctly reads total from data.meta.count
test('executeGetEventsNear: Reads total from data.meta.count (not data.data.total)', () => {
  const content = readChatHandler()
  
  // Find the executeGetEventsNear function
  const functionStart = content.indexOf('async function executeGetEventsNear')
  const functionEnd = content.indexOf('\n}\n', functionStart)
  const functionContent = content.substring(functionStart, functionEnd)
  
  // Should use data.meta?.count
  const usesMetaCount = functionContent.includes('data.meta?.count') ||
                        functionContent.includes('data.meta.count')
  
  // Should NOT use data.data.total (incorrect nested path)
  const usesNestedTotal = functionContent.includes('data.data?.total') || 
                          functionContent.includes('data.data.total')
  
  return usesMetaCount && !usesNestedTotal
})

// Test 3: Verify fallback to array length if meta.count not present
test('executeGetEventsNear: Falls back to data.events.length if meta.count missing', () => {
  const content = readChatHandler()
  
  // Find the executeGetEventsNear function
  const functionStart = content.indexOf('async function executeGetEventsNear')
  const functionEnd = content.indexOf('\n}\n', functionStart)
  const functionContent = content.substring(functionStart, functionEnd)
  
  // Should have fallback logic for array length
  const hasFallback = functionContent.includes('.length') &&
                      functionContent.includes('data.events')
  
  return hasFallback
})

// Test 4: Verify Discovery V1 response structure in comments or documentation
test('Code references Discovery V1 response structure', () => {
  const content = readChatHandler()
  
  // Should reference the correct response structure somewhere
  // (either in comments, error messages, or variable names)
  const referencesDiscovery = content.includes('Discovery V1') ||
                              content.includes('discovery') ||
                              content.includes('/v1/events/near')
  
  return referencesDiscovery
})

// Test 5: Verify that executeGetEventsNear handles success field
test('executeGetEventsNear: Returns success field in response', () => {
  const content = readChatHandler()
  
  // Find the executeGetEventsNear function
  const functionStart = content.indexOf('async function executeGetEventsNear')
  const functionEnd = content.indexOf('\n}\n', functionStart)
  const functionContent = content.substring(functionStart, functionEnd)
  
  // Should return success field
  const returnsSuccess = functionContent.includes('success: true') ||
                        functionContent.includes('success: false')
  
  return returnsSuccess
})

// Test 6: Verify that executeGetEventsNear handles empty results correctly
test('executeGetEventsNear: Handles empty events array with || []', () => {
  const content = readChatHandler()
  
  // Find the executeGetEventsNear function
  const functionStart = content.indexOf('async function executeGetEventsNear')
  const functionEnd = content.indexOf('\n}\n', functionStart)
  const functionContent = content.substring(functionStart, functionEnd)
  
  // Should have fallback to empty array
  const hasEmptyArrayFallback = functionContent.includes('|| []')
  
  return hasEmptyArrayFallback
})

// Test 7: Simulate Discovery V1 response parsing (code inspection)
test('executeGetEventsNear: Code structure matches Discovery V1 format', () => {
  const content = readChatHandler()
  
  // Find the executeGetEventsNear function
  const functionStart = content.indexOf('async function executeGetEventsNear')
  const functionEnd = content.indexOf('\n}\n', functionStart)
  const functionContent = content.substring(functionStart, functionEnd)
  
  // Key indicators that the code is parsing Discovery V1 correctly:
  // 1. Reads from data.events (not data.data.events)
  // 2. Reads from data.meta (not data.data)
  // 3. Has appropriate fallbacks
  
  const hasCorrectEventsParsing = functionContent.match(/data\.events(?!\s*\?\.\s*events)/g)
  const hasCorrectMetaParsing = functionContent.includes('data.meta')
  const noIncorrectNesting = !functionContent.includes('data.data')
  
  return hasCorrectEventsParsing && hasCorrectMetaParsing && noIncorrectNesting
})

// Print summary
console.log('\n==========================================')
console.log('Test Summary')
console.log('==========================================')
console.log(`\nTotal: ${passCount + failCount}`)
console.log(`Passed: ${passCount}`)
console.log(`Failed: ${failCount}`)

if (failCount === 0) {
  console.log('\n✅ All parsing tests passed!')
  console.log('\n📝 Discovery V1 Response Format:')
  console.log('   {')
  console.log('     "success": true,')
  console.log('     "schemaVersion": "discovery.v1",')
  console.log('     "events": [...],')
  console.log('     "meta": { "count": N, "radiusKm": K }')
  console.log('   }')
  process.exit(0)
} else {
  console.log(`\n❌ ${failCount} test(s) failed`)
  process.exit(1)
}
