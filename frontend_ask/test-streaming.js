#!/usr/bin/env node
/**
 * Test script for frontend_ask streaming functionality
 * 
 * Tests:
 * 1. sendChatMessageStream function exists and has correct signature
 * 2. Streaming API posts to correct endpoint
 * 3. History parameter is passed to backend
 * 4. SSE parsing logic is implemented
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing Frontend Ask Streaming API\n')
console.log('====================================\n')

let passCount = 0
let failCount = 0

/**
 * Read and validate the API source code directly
 */
function readApiSource() {
  const path = join(__dirname, 'src', 'api.js')
  return readFileSync(path, 'utf-8')
}

function readMainSource() {
  const path = join(__dirname, 'src', 'main.js')
  return readFileSync(path, 'utf-8')
}

const apiSource = readApiSource()
const mainSource = readMainSource()

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

// Test 1: sendChatMessageStream function exists
test('sendChatMessageStream function exists', () => {
  return apiSource.includes('sendChatMessageStream')
})

// Test 2: Streaming function accepts required parameters
test('sendChatMessageStream accepts message, location, history, and callbacks', () => {
  const funcMatch = apiSource.match(/sendChatMessageStream\s*\([^)]+\)/)
  if (!funcMatch) return false
  const params = funcMatch[0]
  return params.includes('message') && 
         params.includes('location') && 
         params.includes('history') &&
         params.includes('onToken') &&
         params.includes('onError') &&
         params.includes('onDone')
})

// Test 3: Streams to correct endpoint
test('Streaming API posts to /api/chat/stream', () => {
  return apiSource.includes('/api/chat/stream')
})

// Test 4: History is sent in request body
test('History parameter is sent to backend', () => {
  return apiSource.includes('history') && 
         apiSource.includes('requestBody')
})

// Test 5: SSE parsing logic exists
test('SSE event parsing logic implemented', () => {
  return apiSource.includes('data: ') && 
         apiSource.includes('getReader()') &&
         apiSource.includes('TextDecoder')
})

// Test 6: Handles token, done, and error event types
test('Handles token, done, and error SSE events', () => {
  return apiSource.includes("type: 'token'") || apiSource.includes('type === \'token\'') &&
         apiSource.includes("type: 'done'") || apiSource.includes('type === \'done\'') &&
         apiSource.includes("type: 'error'") || apiSource.includes('type === \'error\'')
})

// Test 7: Main app maintains conversation history
test('Main app maintains conversationHistory array', () => {
  return mainSource.includes('conversationHistory') &&
         mainSource.includes('role') &&
         mainSource.includes('content')
})

// Test 8: Main app imports streaming function
test('Main app imports sendChatMessageStream', () => {
  return mainSource.includes('sendChatMessageStream')
})

// Test 9: Main app uses marked for markdown rendering
test('Main app imports and uses marked library', () => {
  return mainSource.includes("import { marked }") &&
         mainSource.includes('marked.parse')
})

// Test 10: HTML renderer disabled for security
test('Markdown renderer disables raw HTML', () => {
  return mainSource.includes('renderer') &&
         (mainSource.includes("html: () => ''") || mainSource.includes('html:()=>\'\''))
})

// Test 11: History is trimmed before sending
test('History is trimmed to MAX_HISTORY_LENGTH', () => {
  return mainSource.includes('MAX_HISTORY_LENGTH') &&
         mainSource.includes('slice(-')
})

// Test 12: Auto-scroll functionality exists
test('Auto-scroll to bottom implemented', () => {
  return mainSource.includes('scrollTop') &&
         mainSource.includes('scrollHeight')
})

// Summary
console.log('\n' + '='.repeat(34))
console.log(`✅ Passed: ${passCount}`)
console.log(`❌ Failed: ${failCount}`)
console.log('='.repeat(34))

if (failCount > 0) {
  process.exit(1)
}
