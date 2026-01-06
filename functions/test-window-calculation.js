/**
 * Test script for weekly digest window calculation
 * Run with: node test-window-calculation.js
 */

import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { startOfWeek, addWeeks, format } from 'date-fns'

const LA_TIMEZONE = 'America/Los_Angeles'

/**
 * Calculate the weekly window boundaries for the prior week
 * Same logic as in index.js
 */
function calculateWeeklyWindow(now = new Date()) {
  const nowLA = toZonedTime(now, LA_TIMEZONE)
  const currentWeekStartLA = startOfWeek(nowLA, { weekStartsOn: 1 })
  const priorWeekStartLA = addWeeks(currentWeekStartLA, -1)
  const priorWeekEndLA = currentWeekStartLA
  const windowStartIso = fromZonedTime(priorWeekStartLA, LA_TIMEZONE).toISOString()
  const windowEndIso = fromZonedTime(priorWeekEndLA, LA_TIMEZONE).toISOString()
  const docId = format(priorWeekEndLA, 'yyyy-MM-dd')
  
  return { windowStartIso, windowEndIso, docId }
}

console.log('=== Weekly Digest Window Calculation Test ===\n')

// Test with current date
console.log('Test 1: Current Date')
const result1 = calculateWeeklyWindow()
console.log(`  Now: ${new Date().toISOString()}`)
console.log(`  Window Start: ${result1.windowStartIso}`)
console.log(`  Window End: ${result1.windowEndIso}`)
console.log(`  Document ID: ${result1.docId}`)
console.log()

// Test with specific Monday (2026-01-05 at 00:00 LA time)
console.log('Test 2: Monday 2026-01-05 00:00 LA')
const testDate1 = fromZonedTime(new Date('2026-01-05T00:00:00'), LA_TIMEZONE)
const result2 = calculateWeeklyWindow(testDate1)
console.log(`  Test Date: ${testDate1.toISOString()}`)
console.log(`  Window Start: ${result2.windowStartIso}`)
console.log(`  Window End: ${result2.windowEndIso}`)
console.log(`  Document ID: ${result2.docId}`)
console.log(`  Expected Window: 2025-12-29 00:00 LA to 2026-01-05 00:00 LA`)
console.log()

// Test with mid-week date
console.log('Test 3: Wednesday 2026-01-07 12:00 LA')
const testDate2 = fromZonedTime(new Date('2026-01-07T12:00:00'), LA_TIMEZONE)
const result3 = calculateWeeklyWindow(testDate2)
console.log(`  Test Date: ${testDate2.toISOString()}`)
console.log(`  Window Start: ${result3.windowStartIso}`)
console.log(`  Window End: ${result3.windowEndIso}`)
console.log(`  Document ID: ${result3.docId}`)
console.log(`  Expected Window: 2025-12-29 00:00 LA to 2026-01-05 00:00 LA`)
console.log()

// Verify the window is exactly 7 days
const start = new Date(result1.windowStartIso)
const end = new Date(result1.windowEndIso)
const diffDays = (end - start) / (1000 * 60 * 60 * 24)
console.log(`Window Duration: ${diffDays} days (should be 7)`)
console.log()

// Verify it's Monday to Monday
const startLA = toZonedTime(start, LA_TIMEZONE)
const endLA = toZonedTime(end, LA_TIMEZONE)
console.log(`Start day: ${format(startLA, 'EEEE')} (should be Monday)`)
console.log(`End day: ${format(endLA, 'EEEE')} (should be Monday)`)
console.log(`Start time: ${format(startLA, 'HH:mm:ss')} (should be 00:00:00)`)
console.log(`End time: ${format(endLA, 'HH:mm:ss')} (should be 00:00:00)`)
