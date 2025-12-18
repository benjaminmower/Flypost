#!/usr/bin/env node
/**
 * Test script for anti-hallucination prompt constraints
 * 
 * Tests:
 * 1. System prompt contains Location Clarification Rule constraints
 * 2. System prompt contains Anti-Hallucination Rules
 * 3. System prompt contains restrictions against fabricating events
 * 4. System prompt explicitly addresses zero-event scenarios
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing Anti-Hallucination Prompt Constraints\n')
console.log('=================================================\n')

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
 * Read chatHandler.js source
 */
function readChatHandler() {
  const path = join(__dirname, 'src', 'concierge', 'chatHandler.js')
  return readFileSync(path, 'utf-8')
}

const chatHandlerContent = readChatHandler()

// Test 1: Location Clarification Rule is strengthened
test('Location Clarification Rule prevents listing events without coords', () => {
  const hasRule = chatHandlerContent.includes('Location Clarification Rule')
  const preventsListing = chatHandlerContent.includes('NEVER') && 
                         chatHandlerContent.includes('list specific events') ||
                         chatHandlerContent.includes('NEVER** list')
  const noCoords = chatHandlerContent.includes('no coordinates')
  
  return hasRule && preventsListing && noCoords
})

// Test 2: Anti-Hallucination Rules section exists
test('System prompt contains Anti-Hallucination Rules section', () => {
  return chatHandlerContent.includes('Anti-Hallucination Rules') ||
         chatHandlerContent.includes('anti-hallucination') ||
         (chatHandlerContent.includes('zero events') && chatHandlerContent.includes('NEVER'))
})

// Test 3: Zero-event scenario is explicitly addressed
test('Prompt addresses zero-event scenario explicitly', () => {
  const hasZeroEvents = chatHandlerContent.includes('zero events') ||
                        chatHandlerContent.includes('0 events') ||
                        chatHandlerContent.includes('empty results')
  const hasMustState = chatHandlerContent.includes('MUST') && 
                       chatHandlerContent.includes("didn't find")
  
  return hasZeroEvents && hasMustState
})

// Test 4: Restrictions against fabricating events
test('Restrictions include fabricating/hallucinating events', () => {
  const hasFabricate = chatHandlerContent.includes('Fabricate') ||
                       chatHandlerContent.includes('fabricate')
  const hasHallucinate = chatHandlerContent.includes('Hallucinate') ||
                         chatHandlerContent.includes('hallucinate')
  const hasToolResults = chatHandlerContent.includes('tool results') ||
                         chatHandlerContent.includes('tool output')
  
  return (hasFabricate || hasHallucinate) && hasToolResults
})

// Test 5: Restrictions against old year mentions
test('Restrictions prevent mentioning past years like 2023', () => {
  const hasPastYears = chatHandlerContent.includes('2023') ||
                       chatHandlerContent.includes('2022') ||
                       chatHandlerContent.includes('past years')
  const hasRestriction = chatHandlerContent.includes('NEVER') &&
                        (chatHandlerContent.includes('unless in tool') ||
                         chatHandlerContent.includes('unless explicitly'))
  
  return hasPastYears && hasRestriction
})

// Test 6: Tool results are the only source constraint
test('Prompt enforces tool results as only source', () => {
  const hasOnlySource = chatHandlerContent.includes('ONLY') &&
                       (chatHandlerContent.includes('tool') || 
                        chatHandlerContent.includes('returned data'))
  const hasNeverAdd = chatHandlerContent.includes('NEVER') &&
                     (chatHandlerContent.includes('add events') ||
                      chatHandlerContent.includes('from memory') ||
                      chatHandlerContent.includes('from other sources'))
  
  return hasOnlySource && hasNeverAdd
})

// Test 7: Verify constraints in restrictions list
test('Restrictions list updated with new constraints', () => {
  const restrictionsIdx = chatHandlerContent.indexOf('## Restrictions')
  const toneIdx = chatHandlerContent.indexOf('## Tone')
  
  if (restrictionsIdx === -1 || toneIdx === -1 || restrictionsIdx >= toneIdx) {
    return false
  }
  
  const restrictionsSection = chatHandlerContent.substring(restrictionsIdx, toneIdx)
  
  const hasNoCoords = restrictionsSection.includes('no coordinates')
  const hasZeroResults = restrictionsSection.includes('zero results') ||
                         restrictionsSection.includes('tool returns zero')
  
  return hasNoCoords && hasZeroResults
})

// Summary
console.log('\n' + '='.repeat(49))
console.log(`✅ Passed: ${passCount}`)
console.log(`❌ Failed: ${failCount}`)
console.log('='.repeat(49))

if (failCount > 0) {
  process.exit(1)
}
