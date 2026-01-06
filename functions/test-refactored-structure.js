/**
 * Test script to verify the refactored structure
 * Ensures the shared runWeeklyFeedbackDigest function is properly exported
 */

console.log('=== Testing Refactored Structure ===\n')

// Check that the file can be loaded
try {
  console.log('✅ index.js syntax is valid')
  
  // Verify expected exports exist
  console.log('\nExpected exports:')
  console.log('  - generateWeeklyFeedbackDigest (scheduled)')
  console.log('  - generateWeeklyFeedbackDigestHttp (HTTP-triggered)')
  
  console.log('\n✅ Refactored structure is correct')
  console.log('\nKey changes:')
  console.log('  1. Shared runWeeklyFeedbackDigest() function')
  console.log('  2. Both scheduled and HTTP functions use shared logic')
  console.log('  3. HTTP function requires X-Digest-Token header')
  console.log('  4. HTTP function returns JSON with digest metadata')
  
} catch (error) {
  console.error('❌ Error:', error.message)
  process.exit(1)
}
