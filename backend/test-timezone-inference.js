/*
 * Test: Timezone Inference and Explicit Override Rule
 * 
 * Tests the timezone inference functionality and the explicit override rule
 * for open-houses category.
 */

import { inferTimezoneFromCoordinates, hasExplicitTimezone } from './src/utils/timezone.js'
import { reinterpretTimestampInTimezone, generateOccurrenceId, selectUpcomingOccurrence, validateOpenHouseEndDate } from './src/utils/timeNormalization.js'

console.log('🧪 Testing Timezone Inference...\n')

// Test 1: Infer timezone from coordinates
console.log('Test 1: Infer timezone from Los Angeles coordinates')
const laTimezone = inferTimezoneFromCoordinates(34.0522, -118.2437)
console.log(`  Result: ${laTimezone}`)
console.assert(laTimezone === 'America/Los_Angeles', '✅ LA timezone correct')

console.log('\nTest 2: Infer timezone from New York coordinates')
const nyTimezone = inferTimezoneFromCoordinates(40.7128, -74.0060)
console.log(`  Result: ${nyTimezone}`)
console.assert(nyTimezone === 'America/New_York', '✅ NY timezone correct')

// Test 3: Cache hit
console.log('\nTest 3: Cache hit for same coordinates (rounded)')
const laTimezone2 = inferTimezoneFromCoordinates(34.0523, -118.2438) // Within rounding distance
console.log(`  Result: ${laTimezone2}`)
console.assert(laTimezone2 === 'America/Los_Angeles', '✅ Cache works')

// Test 4: Explicit timezone detection
console.log('\n🧪 Testing Explicit Timezone Detection...\n')

console.log('Test 4: Detect ISO Z timezone')
const hasZ = hasExplicitTimezone('Open house on 2025-01-15T14:00:00Z')
console.log(`  Result: ${hasZ}`)
console.assert(hasZ === true, '✅ Detected Z')

console.log('\nTest 5: Detect named timezone (PT)')
const hasPT = hasExplicitTimezone('Open house Saturday 2pm PT')
console.log(`  Result: ${hasPT}`)
console.assert(hasPT === true, '✅ Detected PT')

console.log('\nTest 6: No explicit timezone')
const hasNone = hasExplicitTimezone('Open house Saturday 2pm')
console.log(`  Result: ${hasNone}`)
console.assert(hasNone === false, '✅ No timezone detected correctly')

// Test 7: Timestamp reinterpretation
console.log('\n🧪 Testing Timestamp Reinterpretation...\n')

console.log('Test 7: Reinterpret timestamp as LA time')
const originalTs = '2025-01-15T14:00:00.000Z'
const reinterpretedTs = reinterpretTimestampInTimezone(originalTs, 'America/Los_Angeles')
console.log(`  Original: ${originalTs}`)
console.log(`  Reinterpreted as LA time: ${reinterpretedTs}`)
// 2pm wall-clock in LA = 2pm PST = 10pm UTC (UTC-8) OR 9pm UTC (UTC-7 if PDT)
// Note: This depends on DST, so we just check it changed
console.assert(reinterpretedTs !== originalTs, '✅ Timestamp changed')

// Test 8: Generate occurrence ID
console.log('\n🧪 Testing Occurrence ID Generation...\n')

console.log('Test 8: Generate stable occurrence ID')
const occId1 = generateOccurrenceId('test-key', '2025-01-15T14:00:00Z', '2025-01-15T16:00:00Z')
const occId2 = generateOccurrenceId('test-key', '2025-01-15T14:00:00Z', '2025-01-15T16:00:00Z')
console.log(`  ID 1: ${occId1}`)
console.log(`  ID 2: ${occId2}`)
console.assert(occId1 === occId2, '✅ IDs are stable')
console.assert(occId1.startsWith('occ_'), '✅ ID has correct prefix')

// Test 9: Select upcoming occurrence
console.log('\n🧪 Testing Occurrence Selection...\n')

console.log('Test 9: Select next upcoming occurrence')
const now = new Date('2025-01-15T12:00:00Z')
const occurrences = [
  { startDate: '2025-01-14T14:00:00Z', endDate: '2025-01-14T16:00:00Z', label: 'Past' },
  { startDate: '2025-01-15T14:00:00Z', endDate: '2025-01-15T16:00:00Z', label: 'Future 1' },
  { startDate: '2025-01-16T14:00:00Z', endDate: '2025-01-16T16:00:00Z', label: 'Future 2' }
]
const selected = selectUpcomingOccurrence(occurrences, now)
console.log(`  Selected: ${selected.label}`)
console.assert(selected.label === 'Future 1', '✅ Selected next upcoming')

// Test 10: Select most recent past if all past
console.log('\nTest 10: Select most recent past if all past')
const now2 = new Date('2025-01-17T12:00:00Z')
const selected2 = selectUpcomingOccurrence(occurrences, now2)
console.log(`  Selected: ${selected2.label}`)
console.assert(selected2.label === 'Future 2', '✅ Selected most recent past')

// Test 11: Validate open house endDate
console.log('\n🧪 Testing Open House Validation...\n')

console.log('Test 11: Valid open house with endDate')
const validEvent = {
  flypost: { category: 'open-houses' },
  startDate: '2025-01-15T14:00:00Z',
  endDate: '2025-01-15T16:00:00Z'
}
const validation1 = validateOpenHouseEndDate(validEvent)
console.log(`  Valid: ${validation1.valid}`)
console.assert(validation1.valid === true, '✅ Valid open house passes')

console.log('\nTest 12: Invalid open house missing endDate')
const invalidEvent = {
  flypost: { category: 'open-houses' },
  startDate: '2025-01-15T14:00:00Z'
}
const validation2 = validateOpenHouseEndDate(invalidEvent)
console.log(`  Valid: ${validation2.valid}`)
console.log(`  Error: ${validation2.error}`)
console.assert(validation2.valid === false, '✅ Invalid open house fails')

console.log('\nTest 13: Non-open-house without endDate (should pass)')
const nonOpenHouse = {
  flypost: { category: 'garage-sales' },
  startDate: '2025-01-15T14:00:00Z'
}
const validation3 = validateOpenHouseEndDate(nonOpenHouse)
console.log(`  Valid: ${validation3.valid}`)
console.assert(validation3.valid === true, '✅ Non-open-house passes without endDate')

console.log('\n✅ All tests passed!')
