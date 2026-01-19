/*
 * Demonstration: Timestamp Double-Conversion Fix
 *
 * This file demonstrates the before/after behavior of the timestamp
 * double-conversion fix for open-house events.
 */

import { normalizeOpenHouseTimestamps } from './src/utils/timeNormalization.js'

console.log('📊 Demonstration: Timestamp Double-Conversion Fix')
console.log('='.repeat(70))
console.log('')

// Scenario from the problem statement:
// Raw input: "open house 6pm - 8pm\n241 Ruth Ave Venice 90291\nwww.example.com"
// No explicit timezone markers in raw input (no PT/PST/etc)
// Geocoding infers: America/Los_Angeles
// LLM provides timestamps with explicit Z

console.log('🎯 Scenario: Real-world open house publishing')
console.log('   Raw input: "open house 6pm - 8pm"')
console.log('   Address: "241 Ruth Ave Venice 90291"')
console.log('   Timezone inferred from geocoding: America/Los_Angeles')
console.log('   LLM output timestamps: explicit Z (UTC)')
console.log('')

// Simulate what the LLM might return
const llmOutput = {
  flypost: { category: 'open-houses' },
  startDate: '2026-01-25T18:00:00Z',  // 6pm UTC (already correct)
  endDate: '2026-01-25T20:00:00Z',    // 8pm UTC (already correct)
  occurrences: [
    {
      startDate: '2026-01-25T18:00:00Z',
      endDate: '2026-01-25T20:00:00Z'
    }
  ]
}

console.log('📥 LLM Output (with explicit Z):')
console.log('   startDate:', llmOutput.startDate)
console.log('   endDate:', llmOutput.endDate)
console.log('')

// Clone for processing
const processedEvent = JSON.parse(JSON.stringify(llmOutput))

// Process with our fix
const hasExplicitTz = false  // No PT/PST in raw input
const inferredTimezone = 'America/Los_Angeles'

console.log('⚙️  Processing with normalizeOpenHouseTimestamps():')
console.log('   hasExplicitTz (in raw input):', hasExplicitTz)
console.log('   inferredTimezone:', inferredTimezone)
console.log('')

normalizeOpenHouseTimestamps(processedEvent, hasExplicitTz, inferredTimezone)

console.log('')
console.log('📤 After Normalization:')
console.log('   startDate:', processedEvent.startDate)
console.log('   endDate:', processedEvent.endDate)
console.log('')

// Compare
const unchanged = processedEvent.startDate === llmOutput.startDate &&
                  processedEvent.endDate === llmOutput.endDate

console.log('='.repeat(70))
console.log('')
if (unchanged) {
  console.log('✅ SUCCESS: Timestamps preserved (no double-conversion)')
  console.log('   The fix correctly detected explicit Z and skipped reinterpretation')
  console.log('')
  console.log('📅 Timeline:')
  console.log('   Original: 6pm-8pm UTC (2026-01-25T18:00:00Z)')
  console.log('   After Fix: 6pm-8pm UTC (unchanged)')
  console.log('   Correct interpretation: Event is at 6pm UTC')
  console.log('')
  console.log('🎉 Result: Event appears at correct time, presence gating works!')
} else {
  console.log('❌ PROBLEM: Timestamps were changed (double-conversion occurred)')
  console.log('   Before:', llmOutput.startDate)
  console.log('   After:', processedEvent.startDate)
  console.log('')
  console.log('   This would cause EVENT_NOT_ACTIVE errors!')
}

console.log('')
console.log('='.repeat(70))
console.log('')

// Demonstrate the old behavior (what would happen without the fix)
console.log('📉 What would happen WITHOUT the fix:')
console.log('   1. LLM outputs: 2026-01-25T18:00:00Z (6pm UTC)')
console.log('   2. Backend sees no TZ marker in raw input')
console.log('   3. Backend strips Z and reinterprets as 6pm Pacific')
console.log('   4. Converts to UTC: 2026-01-26T02:00:00Z (2am next day UTC)')
console.log('   5. Event appears 8 hours later than intended!')
console.log('   6. Presence check-in fails: EVENT_NOT_ACTIVE')
console.log('')

console.log('✅ With the fix:')
console.log('   1. LLM outputs: 2026-01-25T18:00:00Z (6pm UTC)')
console.log('   2. Backend sees no TZ marker in raw input')
console.log('   3. Backend detects Z in timestamp → has explicit TZ')
console.log('   4. Skips reinterpretation, preserves original')
console.log('   5. Event appears at correct time!')
console.log('   6. Presence check-in succeeds ✅')
console.log('')

console.log('='.repeat(70))
console.log('🎯 Key Insight:')
console.log('   Only reinterpret timestamps when BOTH conditions are true:')
console.log('   1. Raw input lacks explicit timezone markers (no PT/PST/etc)')
console.log('   2. Timestamp string is ambiguous (no Z or ±offset)')
console.log('')
console.log('   This prevents double-conversion while maintaining backward')
console.log('   compatibility for truly ambiguous timestamps.')
console.log('='.repeat(70))
