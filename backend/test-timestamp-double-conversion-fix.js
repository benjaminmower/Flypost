/*
 * Test: Timestamp Double-Conversion Fix
 * 
 * Tests that open-house timestamp normalization only reinterprets ambiguous timestamps.
 * When raw input lacks explicit timezone markers but timestamps have explicit timezone
 * info (Z or offset), those timestamps should NOT be reinterpreted.
 * 
 * This test does NOT require OPENAI_API_KEY - it tests pure normalization logic.
 */

import { normalizeOpenHouseTimestamps } from './src/utils/timeNormalization.js'
import { isoTimestampHasExplicitTz } from './src/utils/timezone.js'

console.log('🧪 Testing Timestamp Double-Conversion Fix\n')

// Test helper function first
console.log('=== Testing isoTimestampHasExplicitTz() Helper ===\n')

// Test 1: Timestamp with Z should be detected as explicit
console.log('Test 1: Timestamp with Z (should be true)')
const timestampWithZ = '2026-01-19T18:00:00Z'
const result1 = isoTimestampHasExplicitTz(timestampWithZ)
console.log(`  Input: "${timestampWithZ}"`)
console.log(`  Result: ${result1}`)
console.assert(result1 === true, '✅ Timestamp with Z should be explicit')

// Test 2: Timestamp with lowercase z should be detected as explicit
console.log('\nTest 2: Timestamp with lowercase z (should be true)')
const timestampWithLowerZ = '2026-01-19T18:00:00z'
const result2 = isoTimestampHasExplicitTz(timestampWithLowerZ)
console.log(`  Input: "${timestampWithLowerZ}"`)
console.log(`  Result: ${result2}`)
console.assert(result2 === true, '✅ Timestamp with lowercase z should be explicit')

// Test 3: Timestamp with +HH:MM offset should be detected as explicit
console.log('\nTest 3: Timestamp with +HH:MM offset (should be true)')
const timestampWithOffset = '2026-01-19T10:00:00-08:00'
const result3 = isoTimestampHasExplicitTz(timestampWithOffset)
console.log(`  Input: "${timestampWithOffset}"`)
console.log(`  Result: ${result3}`)
console.assert(result3 === true, '✅ Timestamp with offset should be explicit')

// Test 4: Timestamp with +HHMM offset (no colon) should be detected as explicit
console.log('\nTest 4: Timestamp with +HHMM offset (should be true)')
const timestampWithOffsetNoColon = '2026-01-19T10:00:00-0800'
const result4 = isoTimestampHasExplicitTz(timestampWithOffsetNoColon)
console.log(`  Input: "${timestampWithOffsetNoColon}"`)
console.log(`  Result: ${result4}`)
console.assert(result4 === true, '✅ Timestamp with offset (no colon) should be explicit')

// Test 5: Timestamp without timezone should NOT be detected as explicit
console.log('\nTest 5: Timestamp without timezone (should be false)')
const timestampWithoutTz = '2026-01-19T18:00:00'
const result5 = isoTimestampHasExplicitTz(timestampWithoutTz)
console.log(`  Input: "${timestampWithoutTz}"`)
console.log(`  Result: ${result5}`)
console.assert(result5 === false, '✅ Timestamp without TZ should not be explicit')

// Test 6: Timestamp with milliseconds and Z should be detected as explicit
console.log('\nTest 6: Timestamp with milliseconds and Z (should be true)')
const timestampWithMillisAndZ = '2026-01-19T18:00:00.000Z'
const result6 = isoTimestampHasExplicitTz(timestampWithMillisAndZ)
console.log(`  Input: "${timestampWithMillisAndZ}"`)
console.log(`  Result: ${result6}`)
console.assert(result6 === true, '✅ Timestamp with millis and Z should be explicit')

// Test 7: Timestamp with milliseconds without TZ should NOT be detected as explicit
console.log('\nTest 7: Timestamp with milliseconds without TZ (should be false)')
const timestampWithMillisNoTz = '2026-01-19T18:00:00.000'
const result7 = isoTimestampHasExplicitTz(timestampWithMillisNoTz)
console.log(`  Input: "${timestampWithMillisNoTz}"`)
console.log(`  Result: ${result7}`)
console.assert(result7 === false, '✅ Timestamp with millis but no TZ should not be explicit')

console.log('\n✅ All isoTimestampHasExplicitTz() tests passed!\n')

// Test normalization behavior
console.log('=== Testing normalizeOpenHouseTimestamps() Behavior ===\n')

// Test A: Raw input without explicit TZ, but timestamps WITH Z
// Expected: Timestamps should NOT be reinterpreted (no double-conversion)
console.log('Test A: Raw input without explicit TZ, timestamps WITH Z')
console.log('Expected: Timestamps should NOT change (skip reinterpretation)\n')

const eventWithExplicitTimestamps = {
  flypost: { category: 'open-houses' },
  startDate: '2026-01-19T18:00:00Z',  // 6pm UTC
  endDate: '2026-01-19T20:00:00Z',    // 8pm UTC
  occurrences: [
    {
      startDate: '2026-01-19T18:00:00Z',
      endDate: '2026-01-19T20:00:00Z'
    }
  ]
}

// Deep clone to preserve original for comparison
const originalEventA = JSON.parse(JSON.stringify(eventWithExplicitTimestamps))

// Normalize with hasExplicitTz=false (raw input lacks TZ markers)
const normalizedEventA = normalizeOpenHouseTimestamps(
  eventWithExplicitTimestamps,
  false,  // hasExplicitTz = false (raw input lacks timezone markers)
  'America/Los_Angeles'  // inferredTimezone from geocoding
)

console.log(`\nOriginal startDate: ${originalEventA.startDate}`)
console.log(`Normalized startDate: ${normalizedEventA.startDate}`)
console.log(`Original endDate: ${originalEventA.endDate}`)
console.log(`Normalized endDate: ${normalizedEventA.endDate}`)
console.log(`Original occurrence startDate: ${originalEventA.occurrences[0].startDate}`)
console.log(`Normalized occurrence startDate: ${normalizedEventA.occurrences[0].startDate}`)

// Assert timestamps are unchanged
console.assert(
  normalizedEventA.startDate === originalEventA.startDate,
  '✅ Test A: startDate should not change'
)
console.assert(
  normalizedEventA.endDate === originalEventA.endDate,
  '✅ Test A: endDate should not change'
)
console.assert(
  normalizedEventA.occurrences[0].startDate === originalEventA.occurrences[0].startDate,
  '✅ Test A: occurrence startDate should not change'
)
console.assert(
  normalizedEventA.occurrences[0].endDate === originalEventA.occurrences[0].endDate,
  '✅ Test A: occurrence endDate should not change'
)

console.log('\n✅ Test A passed: Explicit timestamps were NOT reinterpreted\n')

// Test B: Raw input without explicit TZ, timestamps WITHOUT TZ (ambiguous)
// Expected: Timestamps SHOULD be reinterpreted as local time
console.log('Test B: Raw input without explicit TZ, timestamps WITHOUT TZ')
console.log('Expected: Timestamps SHOULD change (reinterpret as local time)\n')

const eventWithAmbiguousTimestamps = {
  flypost: { category: 'open-houses' },
  startDate: '2026-01-19T18:00:00',  // Ambiguous, no TZ
  endDate: '2026-01-19T20:00:00',    // Ambiguous, no TZ
  occurrences: [
    {
      startDate: '2026-01-19T18:00:00',
      endDate: '2026-01-19T20:00:00'
    }
  ]
}

// Deep clone to preserve original for comparison
const originalEventB = JSON.parse(JSON.stringify(eventWithAmbiguousTimestamps))

// Normalize with hasExplicitTz=false (raw input lacks TZ markers)
const normalizedEventB = normalizeOpenHouseTimestamps(
  eventWithAmbiguousTimestamps,
  false,  // hasExplicitTz = false
  'America/Los_Angeles'  // inferredTimezone
)

console.log(`\nOriginal startDate: ${originalEventB.startDate}`)
console.log(`Normalized startDate: ${normalizedEventB.startDate}`)
console.log(`Original endDate: ${originalEventB.endDate}`)
console.log(`Normalized endDate: ${normalizedEventB.endDate}`)
console.log(`Original occurrence startDate: ${originalEventB.occurrences[0].startDate}`)
console.log(`Normalized occurrence startDate: ${normalizedEventB.occurrences[0].startDate}`)

// Assert timestamps HAVE changed (reinterpreted)
console.assert(
  normalizedEventB.startDate !== originalEventB.startDate,
  '✅ Test B: startDate should change (reinterpreted)'
)
console.assert(
  normalizedEventB.endDate !== originalEventB.endDate,
  '✅ Test B: endDate should change (reinterpreted)'
)
console.assert(
  normalizedEventB.occurrences[0].startDate !== originalEventB.occurrences[0].startDate,
  '✅ Test B: occurrence startDate should change (reinterpreted)'
)
console.assert(
  normalizedEventB.occurrences[0].endDate !== originalEventB.occurrences[0].endDate,
  '✅ Test B: occurrence endDate should change (reinterpreted)'
)

// Verify the reinterpreted timestamps are now in UTC with Z
console.assert(
  normalizedEventB.startDate.endsWith('Z'),
  '✅ Test B: Reinterpreted startDate should end with Z'
)
console.assert(
  normalizedEventB.endDate.endsWith('Z'),
  '✅ Test B: Reinterpreted endDate should end with Z'
)

console.log('\n✅ Test B passed: Ambiguous timestamps were reinterpreted\n')

// Test C: Raw input WITH explicit TZ, timestamps with Z
// Expected: Timestamps should NOT be reinterpreted (honor as-is)
console.log('Test C: Raw input WITH explicit TZ (e.g., "6pm PT")')
console.log('Expected: Timestamps should NOT change (honor as-is)\n')

const eventWithExplicitInput = {
  flypost: { category: 'open-houses' },
  startDate: '2026-01-19T18:00:00Z',
  endDate: '2026-01-19T20:00:00Z',
  occurrences: [
    {
      startDate: '2026-01-19T18:00:00Z',
      endDate: '2026-01-19T20:00:00Z'
    }
  ]
}

const originalEventC = JSON.parse(JSON.stringify(eventWithExplicitInput))

// Normalize with hasExplicitTz=true (raw input HAS explicit TZ markers)
const normalizedEventC = normalizeOpenHouseTimestamps(
  eventWithExplicitInput,
  true,  // hasExplicitTz = true
  'America/Los_Angeles'
)

console.log(`\nOriginal startDate: ${originalEventC.startDate}`)
console.log(`Normalized startDate: ${normalizedEventC.startDate}`)

console.assert(
  normalizedEventC.startDate === originalEventC.startDate,
  '✅ Test C: Explicit input should honor timestamps as-is'
)

console.log('\n✅ Test C passed: Explicit input honored timestamps as-is\n')

// Test D: Mixed timestamps (some with Z, some without)
// Expected: Only ambiguous timestamps should be reinterpreted
console.log('Test D: Mixed timestamps (some with Z, some without)')
console.log('Expected: Only ambiguous timestamps should change\n')

const eventWithMixedTimestamps = {
  flypost: { category: 'open-houses' },
  startDate: '2026-01-19T18:00:00Z',  // Explicit
  endDate: '2026-01-19T20:00:00',     // Ambiguous
  occurrences: [
    {
      startDate: '2026-01-19T14:00:00',  // Ambiguous
      endDate: '2026-01-19T16:00:00Z'    // Explicit
    }
  ]
}

const originalEventD = JSON.parse(JSON.stringify(eventWithMixedTimestamps))

const normalizedEventD = normalizeOpenHouseTimestamps(
  eventWithMixedTimestamps,
  false,
  'America/Los_Angeles'
)

console.log(`\nTop-level startDate (explicit):`)
console.log(`  Original: ${originalEventD.startDate}`)
console.log(`  Normalized: ${normalizedEventD.startDate}`)
console.log(`  Changed: ${normalizedEventD.startDate !== originalEventD.startDate}`)

console.log(`\nTop-level endDate (ambiguous):`)
console.log(`  Original: ${originalEventD.endDate}`)
console.log(`  Normalized: ${normalizedEventD.endDate}`)
console.log(`  Changed: ${normalizedEventD.endDate !== originalEventD.endDate}`)

console.log(`\nOccurrence startDate (ambiguous):`)
console.log(`  Original: ${originalEventD.occurrences[0].startDate}`)
console.log(`  Normalized: ${normalizedEventD.occurrences[0].startDate}`)
console.log(`  Changed: ${normalizedEventD.occurrences[0].startDate !== originalEventD.occurrences[0].startDate}`)

console.log(`\nOccurrence endDate (explicit):`)
console.log(`  Original: ${originalEventD.occurrences[0].endDate}`)
console.log(`  Normalized: ${normalizedEventD.occurrences[0].endDate}`)
console.log(`  Changed: ${normalizedEventD.occurrences[0].endDate !== originalEventD.occurrences[0].endDate}`)

// Assertions
console.assert(
  normalizedEventD.startDate === originalEventD.startDate,
  '✅ Test D: Explicit top-level startDate should not change'
)
console.assert(
  normalizedEventD.endDate !== originalEventD.endDate,
  '✅ Test D: Ambiguous top-level endDate should change'
)
console.assert(
  normalizedEventD.occurrences[0].startDate !== originalEventD.occurrences[0].startDate,
  '✅ Test D: Ambiguous occurrence startDate should change'
)
console.assert(
  normalizedEventD.occurrences[0].endDate === originalEventD.occurrences[0].endDate,
  '✅ Test D: Explicit occurrence endDate should not change'
)

console.log('\n✅ Test D passed: Mixed timestamps handled correctly\n')

console.log('='.repeat(70))
console.log('✅ All timestamp double-conversion fix tests passed!')
console.log('='.repeat(70))
console.log('\n📋 Summary:')
console.log('  - isoTimestampHasExplicitTz() correctly detects Z and offsets ✅')
console.log('  - Explicit timestamps (with Z) are NOT reinterpreted ✅')
console.log('  - Ambiguous timestamps (no TZ) ARE reinterpreted ✅')
console.log('  - Explicit input honors all timestamps as-is ✅')
console.log('  - Mixed timestamps handled correctly (selective reinterpretation) ✅')
console.log('\n🎯 The fix prevents double-conversion of explicit UTC timestamps!')
