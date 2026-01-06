/**
 * Simple standalone test for formatLocalTime function
 * Run with: node backend/src/concierge/__tests__/formatters.standalone.test.js
 * 
 * NOTE: Uses testUtils.js to share test code without requiring npm dependencies
 */

import { formatLocalTime } from './testUtils.js'

// Test cases
console.log('Testing formatLocalTime function...\n')

// Test 1: LA timezone (PST in January)
console.log('Test 1: LA timezone (PST in January)')
const test1 = formatLocalTime(
  '2026-01-06T19:00:00.000Z',
  '2026-01-06T22:00:00.000Z',
  'America/Los_Angeles'
)
console.log('Result:', test1)
console.log('Expected: "11:00 AM – 2:00 PM PST"')
console.log('Pass:', test1.includes('11:00 AM') && test1.includes('2:00 PM') && test1.includes('PST'))
console.log('')

// Test 2: NY timezone (EST in January)
console.log('Test 2: NY timezone (EST in January)')
const test2 = formatLocalTime(
  '2026-01-06T19:00:00.000Z',
  '2026-01-06T22:00:00.000Z',
  'America/New_York'
)
console.log('Result:', test2)
console.log('Expected: "2:00 PM – 5:00 PM EST"')
console.log('Pass:', test2.includes('2:00 PM') && test2.includes('5:00 PM') && test2.includes('EST'))
console.log('')

// Test 3: LA timezone (PDT in June)
console.log('Test 3: LA timezone (PDT in June - daylight saving)')
const test3 = formatLocalTime(
  '2026-06-15T19:00:00.000Z',
  '2026-06-15T22:00:00.000Z',
  'America/Los_Angeles'
)
console.log('Result:', test3)
console.log('Expected: "12:00 PM – 3:00 PM PDT"')
console.log('Pass:', test3.includes('12:00 PM') && test3.includes('3:00 PM') && test3.includes('PDT'))
console.log('')

// Test 4: Invalid inputs
console.log('Test 4: Invalid inputs')
const test4a = formatLocalTime(null, null, null)
const test4b = formatLocalTime('invalid', 'invalid', 'America/Los_Angeles')
console.log('Result for null inputs:', test4a)
console.log('Result for invalid dates:', test4b)
console.log('Pass:', test4a === null && test4b === null)
console.log('')

console.log('All tests completed!')
