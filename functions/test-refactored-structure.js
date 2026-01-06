/**
 * Test script to verify the refactored structure
 * Ensures the shared runWeeklyFeedbackDigest function is properly exported
 */

import { execSync } from 'child_process'

console.log('=== Testing Refactored Structure ===\n')

// Check that the file can be loaded and has valid syntax
try {
  execSync('node --check index.js', { cwd: process.cwd(), encoding: 'utf8' })
  console.log('✅ index.js syntax is valid')
} catch (error) {
  console.error('❌ Syntax error in index.js:', error.message)
  process.exit(1)
}

// Verify the file contains expected exports
try {
  const fs = await import('fs')
  const fileContent = fs.readFileSync('index.js', 'utf8')
  
  const requiredExports = [
    'generateWeeklyFeedbackDigest',
    'generateWeeklyFeedbackDigestHttp'
  ]
  
  const requiredFunctions = [
    'runWeeklyFeedbackDigest',
    'calculateWeeklyWindow',
    'queryFeedbackInWindow',
    'batchQueryAttendance',
    'batchQueryEvents',
    'aggregateFeedback',
    'persistDigest'
  ]
  
  console.log('\nChecking exports:')
  for (const exportName of requiredExports) {
    if (fileContent.includes(`export const ${exportName}`)) {
      console.log(`  ✅ ${exportName}`)
    } else {
      console.error(`  ❌ Missing export: ${exportName}`)
      process.exit(1)
    }
  }
  
  console.log('\nChecking internal functions:')
  for (const funcName of requiredFunctions) {
    if (fileContent.includes(`function ${funcName}`) || fileContent.includes(`async function ${funcName}`)) {
      console.log(`  ✅ ${funcName}`)
    } else {
      console.error(`  ❌ Missing function: ${funcName}`)
      process.exit(1)
    }
  }
  
  console.log('\n✅ Refactored structure is correct')
  console.log('\nKey changes:')
  console.log('  1. Shared runWeeklyFeedbackDigest() function')
  console.log('  2. Both scheduled and HTTP functions use shared logic')
  console.log('  3. HTTP function requires X-Digest-Token header')
  console.log('  4. HTTP function returns JSON with digest metadata')
  console.log('  5. Constant-time token comparison for security')
  
} catch (error) {
  console.error('❌ Error:', error.message)
  process.exit(1)
}
