#!/usr/bin/env node
/**
 * Test script for Web Concierge Global Public Supply implementation
 * 
 * Tests that the Web Concierge behaves as a public, unscoped discovery interface
 * with deterministic, server-enforced defaults and guardrails.
 * 
 * This test validates the code structure without requiring OpenAI API calls.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing Web Concierge Global Public Supply\n')
console.log('==============================================\n')

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
 * Read source files
 */
function readSourceFile(relativePath) {
  const path = join(__dirname, relativePath)
  return readFileSync(path, 'utf-8')
}

// ===== BROKERAGE SCOPING TESTS =====

test('routes.js: Does NOT extract brokerageId from request body in /chat endpoint', () => {
  const content = readSourceFile('src/concierge/routes.js')
  
  // Find the /chat endpoint handler - look for the destructuring after the comment
  const chatHandlerMatch = content.match(/router\.post\('\/chat',[\s\S]*?\/\/ Note: brokerageId is silently ignored[\s\S]*?const \{[^}]*\}/m)
  if (!chatHandlerMatch) return false
  
  const destructuring = chatHandlerMatch[0]
  
  // Should NOT include brokerageId in destructuring
  return !destructuring.match(/const \{[^}]*brokerageId[^}]*\}/)
})

test('routes.js: Does NOT validate brokerageId in /chat endpoint', () => {
  const content = readSourceFile('src/concierge/routes.js')
  
  // Find the section between /chat endpoint and processChatMessage call
  const chatSection = content.match(/router\.post\('\/chat',[\s\S]*?processChatMessage\(/m)
  if (!chatSection) return false
  
  // Should NOT have brokerageId validation
  return !chatSection[0].includes('Validate brokerageId')
})

test('routes.js: Does NOT log brokerageId in /chat endpoint', () => {
  const content = readSourceFile('src/concierge/routes.js')
  
  // Find the logging section in /chat endpoint
  const chatSection = content.match(/router\.post\('\/chat',[\s\S]*?console\.log\(`🤖 Concierge chat request:[^`]*`\)/m)
  if (!chatSection) return false
  
  // Should NOT include logBrokerageId variable or brokerageId in log
  const logSection = chatSection[0]
  return !logSection.includes('logBrokerageId') && !logSection.includes('brokerageId=')
})

test('routes.js: Does NOT pass brokerageId to processChatMessage in /chat endpoint', () => {
  const content = readSourceFile('src/concierge/routes.js')
  
  // Find the first processChatMessage call (in /chat endpoint, not /chat/stream)
  const sections = content.split(/router\.post\('\/chat/)
  if (sections.length < 2) return false
  
  // Get just the /chat endpoint section (not /chat/stream)
  const chatEndpoint = sections[1].split(/router\.post\(/)[0]
  
  const processChatMatch = chatEndpoint.match(/const result = await processChatMessage\([^)]*\)/s)
  if (!processChatMatch) return false
  
  // Should NOT include brokerageId in the call
  return !processChatMatch[0].includes('brokerageId')
})

test('routes.js: Does NOT extract brokerageId from request body in /chat/stream endpoint', () => {
  const content = readSourceFile('src/concierge/routes.js')
  
  // Find the /chat/stream endpoint handler
  const streamHandlerMatch = content.match(/router\.post\('\/chat\/stream',[\s\S]*?\/\/ Note: brokerageId is silently ignored[\s\S]*?const \{[^}]*\}/m)
  if (!streamHandlerMatch) return false
  
  const destructuring = streamHandlerMatch[0]
  
  // Should NOT include brokerageId in destructuring
  return !destructuring.match(/const \{[^}]*brokerageId[^}]*\}/)
})

test('routes.js: Does NOT pass brokerageId to processChatMessage in /chat/stream endpoint', () => {
  const content = readSourceFile('src/concierge/routes.js')
  
  // Find the processChatMessage call in /chat/stream endpoint - look for the streaming version with callback
  const streamSection = content.match(/router\.post\('\/chat\/stream',[\s\S]*?await processChatMessage\([^)]*\([^)]*\)[^)]*\)/s)
  if (!streamSection) return false
  
  // Should not include brokerageId parameter
  return !streamSection[0].includes('brokerageId,')
})

test('routes.js: Documents that brokerageId is silently ignored', () => {
  const content = readSourceFile('src/concierge/routes.js')
  
  // Check for documentation about brokerageId being ignored
  return content.includes('brokerageId is silently ignored') ||
         content.includes('global public discovery interface')
})

test('chatHandler.js: processChatMessage does NOT accept brokerageId parameter', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the function signature
  const functionMatch = content.match(/export async function processChatMessage\([^)]*\)/s)
  if (!functionMatch) return false
  
  // Should NOT include brokerageId in parameters
  return !functionMatch[0].includes('brokerageId')
})

test('chatHandler.js: executeGetEventsNear does NOT accept brokerageId parameter', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the function signature
  const functionMatch = content.match(/async function executeGetEventsNear\([^)]*\)/s)
  if (!functionMatch) return false
  
  // Should NOT include brokerageId in parameters (should only have args and backendUrl)
  return !functionMatch[0].includes('brokerageId')
})

test('chatHandler.js: executeGetEventsNear does NOT append brokerageId to API call', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find executeGetEventsNear function
  const functionMatch = content.match(/async function executeGetEventsNear[\s\S]*?const url =/s)
  if (!functionMatch) return false
  
  // Should NOT append brokerageId to params
  return !functionMatch[0].includes("params.append('brokerageId'")
})

test('chatHandler.js: Tool call does NOT pass brokerageId to executeGetEventsNear', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the tool call execution
  const toolCallMatch = content.match(/if \(functionName === 'getEventsNear'\) {[\s\S]*?result = await executeGetEventsNear\([^)]*\)/s)
  if (!toolCallMatch) return false
  
  // Should only pass functionArgs and backendUrl, NOT brokerageId
  const call = toolCallMatch[0]
  return !call.includes('brokerageId')
})

test('chatHandler.js: System prompt does NOT include brokerage-specific context', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should NOT have conditional brokerage context section
  return !content.includes('## Brokerage Context') && 
         !content.includes('if (brokerageId) {') &&
         !content.includes('Focus on events associated with this brokerage')
})

// ===== FIXED DISCOVERY WINDOW TESTS =====

test('chatHandler.js: executeGetEventsNear enforces fixed 7-day window', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find executeGetEventsNear function
  const functionMatch = content.match(/async function executeGetEventsNear[\s\S]*?const url =/s)
  if (!functionMatch) return false
  
  const functionBody = functionMatch[0]
  
  // Should calculate now and now+7days (using getTime() arithmetic)
  return functionBody.includes('new Date()') &&
         functionBody.includes('7 * 24 * 60 * 60 * 1000') &&
         functionBody.includes("params.append('start'") &&
         functionBody.includes("params.append('end'")
})

test('chatHandler.js: Fixed window uses server time (not client-provided)', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find executeGetEventsNear function
  const functionMatch = content.match(/async function executeGetEventsNear[\s\S]*?const url =/s)
  if (!functionMatch) return false
  
  const functionBody = functionMatch[0]
  
  // Window should be calculated from 'new Date()' (server time), not from args
  // Should NOT extract start/end from args
  return functionBody.includes('const now = new Date()') &&
         !functionBody.includes('args.start') &&
         !functionBody.includes('args.end')
})

test('chatHandler.js: Fixed window is exactly 7 days', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find executeGetEventsNear function
  const functionMatch = content.match(/async function executeGetEventsNear[\s\S]*?const url =/s)
  if (!functionMatch) return false
  
  const functionBody = functionMatch[0]
  
  // Should use 7 days specifically (in milliseconds: 7 * 24 * 60 * 60 * 1000)
  return functionBody.includes('7 * 24 * 60 * 60 * 1000')
})

// ===== LOCATION DISCIPLINE TESTS =====

test('chatHandler.js: System prompt instructs not to re-ask for location when coords present', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Location Clarification Rule section
  const locationSection = content.match(/## Location Clarification Rule[\s\S]*?##/s)
  if (!locationSection) return false
  
  const section = locationSection[0]
  
  // Should have guidance about not asking for location when coords are available
  return (section.includes('coordinates ARE available') ||
         (section.includes('DO NOT') && section.includes('ask for location')))
})

test('chatHandler.js: Restrictions include not asking for location when coords provided', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Restrictions section
  const restrictionsMatch = content.match(/## Restrictions[\s\S]*?## Tone/s)
  if (!restrictionsMatch) return false
  
  // Should have restriction against asking for location when coordinates provided
  return restrictionsMatch[0].includes('Ask for location when coordinates are already provided')
})

// ===== ADDRESSES + LINKS TESTS =====

test('chatHandler.js: System prompt mentions including externalListingUrl', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should have guidance about including externalListingUrl
  return content.includes('externalListingUrl')
})

test('chatHandler.js: Restrictions include guideline to include externalListingUrl', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Restrictions section
  const restrictionsMatch = content.match(/## Restrictions[\s\S]*?## Tone/s)
  if (!restrictionsMatch) return false
  
  // Should have positive guideline about including externalListingUrl
  return restrictionsMatch[0].includes('externalListingUrl')
})

test('chatHandler.js: System prompt has section about Addresses + Links', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should have a dedicated section about addresses and links
  return content.includes('## Addresses + Links') ||
         content.includes('## Addresses and Links')
})

// ===== WEB BROWSING / SCRAPING PROHIBITION TESTS =====

test('chatHandler.js: System prompt explicitly prohibits web browsing', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should have clear prohibition on web browsing
  return content.includes('Browse the web') ||
         content.includes('web search') ||
         content.includes('Web Browsing')
})

test('chatHandler.js: System prompt prohibits Google search', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should explicitly mention Google search prohibition
  return content.includes('Google search')
})

test('chatHandler.js: System prompt prohibits external site scraping', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should prohibit scraping external websites
  return content.includes('scrape') && content.includes('external')
})

test('chatHandler.js: System prompt provides rationale for browsing prohibition', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should explain why browsing is prohibited (deterministic, auditable)
  return content.includes('deterministic') || content.includes('auditable')
})

test('chatHandler.js: System prompt includes refusal template for browsing requests', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Should provide a template response for refusing browsing requests
  return content.includes('I can only search Flypost') ||
         content.includes('cannot browse')
})

test('chatHandler.js: Restrictions list includes prohibition on browsing/scraping', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Restrictions section
  const restrictionsMatch = content.match(/## Restrictions[\s\S]*?## Tone/s)
  if (!restrictionsMatch) return false
  
  // Should have explicit prohibition
  return restrictionsMatch[0].includes('Browse the web') ||
         restrictionsMatch[0].includes('Google search') ||
         restrictionsMatch[0].includes('scrape external')
})

// ===== TOOL DISCIPLINE / NO FABRICATION TESTS =====

test('chatHandler.js: Anti-Hallucination section emphasizes tool discipline', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Anti-Hallucination Rules section
  const antiHallucinationMatch = content.match(/## Anti-Hallucination Rules[\s\S]*?##/s)
  if (!antiHallucinationMatch) return false
  
  const section = antiHallucinationMatch[0]
  
  // Should have clear guidance about only using tool results
  return section.includes('ONLY') && section.includes('tool') &&
         (section.includes('returned data') || section.includes('tool results'))
})

test('chatHandler.js: Anti-Hallucination section addresses zero-event scenario', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Anti-Hallucination Rules section
  const antiHallucinationMatch = content.match(/## Anti-Hallucination Rules[\s\S]*?##/s)
  if (!antiHallucinationMatch) return false
  
  const section = antiHallucinationMatch[0]
  
  // Should have specific guidance for when no events are found
  return section.includes('zero events') || section.includes('empty results')
})

test('chatHandler.js: Anti-Hallucination section prohibits fabricating events', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Anti-Hallucination Rules section
  const antiHallucinationMatch = content.match(/## Anti-Hallucination Rules[\s\S]*?##/s)
  if (!antiHallucinationMatch) return false
  
  const section = antiHallucinationMatch[0]
  
  // Should explicitly prohibit fabrication
  return section.includes('NEVER') && (section.includes('fabricate') || section.includes('invent'))
})

test('chatHandler.js: Restrictions include no-fabrication requirement', () => {
  const content = readSourceFile('src/concierge/chatHandler.js')
  
  // Find the Restrictions section
  const restrictionsMatch = content.match(/## Restrictions[\s\S]*?## Tone/s)
  if (!restrictionsMatch) return false
  
  // Should prohibit fabrication/hallucination
  return restrictionsMatch[0].includes('Fabricate') || restrictionsMatch[0].includes('Hallucinate')
})

// Print summary
console.log('\n==============================================')
console.log('Test Summary')
console.log('==============================================')
console.log(`\nTotal: ${passCount + failCount}`)
console.log(`Passed: ${passCount}`)
console.log(`Failed: ${failCount}`)

if (failCount === 0) {
  console.log('\n✅ All global public supply tests passed!')
  process.exit(0)
} else {
  console.log(`\n❌ ${failCount} test(s) failed`)
  process.exit(1)
}
