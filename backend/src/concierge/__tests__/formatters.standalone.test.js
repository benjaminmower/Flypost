/**
 * Simple standalone test for formatLocalTime function
 * Run with: node backend/src/concierge/__tests__/formatters.standalone.test.js
 */

/**
 * Format event times in local timezone for display
 */
function formatLocalTime(startISO, endISO, timezone) {
  if (!startISO || !endISO || !timezone) {
    return null
  }

  try {
    const startDate = new Date(startISO)
    const endDate = new Date(endISO)

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return null
    }

    // Format times in the local timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    })

    const startTimeLocal = formatter.format(startDate)
    const endTimeLocal = formatter.format(endDate)

    // Extract timezone abbreviation (e.g., "PT", "ET")
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: timezone
    })
    const tzParts = tzFormatter.formatToParts(startDate)
    const tzName = tzParts.find(part => part.type === 'timeZoneName')?.value || ''

    return `${startTimeLocal} – ${endTimeLocal} ${tzName}`.trim()
  } catch (error) {
    console.error('Error formatting local time:', error)
    return null
  }
}

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
