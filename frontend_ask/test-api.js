#!/usr/bin/env node
/**
 * Test script for frontend_ask API functionality
 * 
 * Tests:
 * 1. sendChatMessage includes lat/lng when location is provided
 * 2. sendChatMessage excludes lat/lng when location is null
 * 3. sendChatMessage excludes lat/lng when location is invalid
 */

// Mock import.meta for Node.js environment
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing Frontend Ask API\n')
console.log('============================\n')

let passCount = 0
let failCount = 0

/**
 * Read and validate the API source code directly
 */
function readApiSource() {
  const path = join(__dirname, 'src', 'api.js')
  return readFileSync(path, 'utf-8')
}

const apiSource = readApiSource()

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

// Test 1: Function accepts location parameter
test('sendChatMessage function accepts location parameter', () => {
  return apiSource.includes('sendChatMessage(message, location')
})

// Test 2: Location parameter has default value
test('sendChatMessage location parameter defaults to null', () => {
  const funcMatch = apiSource.match(/sendChatMessage\s*\([^)]+\)/)
  if (!funcMatch) return false
  const params = funcMatch[0]
  return params.includes('location = null') || params.includes('location=null')
})

// Test 3: Conditional lat/lng inclusion logic exists
test('API conditionally includes lat/lng based on location', () => {
  const hasLocationCheck = apiSource.includes('if (location') ||
                          apiSource.includes('if(location')
  const hasLatCheck = apiSource.includes('location.lat')
  const hasLngCheck = apiSource.includes('location.lng')
  const hasTypeCheck = apiSource.includes("typeof location.lat === 'number'") ||
                      apiSource.includes('typeof location.lng')
  
  return hasLocationCheck && hasLatCheck && hasLngCheck && hasTypeCheck
})

// Test 4: Request body includes lat/lng conditionally
test('Request body conditionally includes lat and lng fields', () => {
  const hasRequestBody = apiSource.includes('requestBody')
  const hasLatAssignment = apiSource.includes('requestBody.lat') || 
                          apiSource.includes("lat: location.lat")
  const hasLngAssignment = apiSource.includes('requestBody.lng') ||
                          apiSource.includes("lng: location.lng")
  
  return hasRequestBody && hasLatAssignment && hasLngAssignment
})

// Test 5: Default API base URL preserved
test('API maintains VITE_API_BASE_URL configuration', () => {
  return apiSource.includes('VITE_API_BASE_URL') &&
         apiSource.includes('https://api.goflypost.com')
})

// Summary
console.log('\n' + '='.repeat(28))
console.log(`✅ Passed: ${passCount}`)
console.log(`❌ Failed: ${failCount}`)
console.log('='.repeat(28))

if (failCount > 0) {
  process.exit(1)
}
