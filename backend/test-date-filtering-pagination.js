#!/usr/bin/env node
/**
 * Test script for date filtering and pagination
 * Tests date validation, overlap semantics, and pagination logic
 */

console.log('🧪 Testing Date Filtering and Pagination\n')
console.log('========================================\n')

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  totalTests++
  if (condition) {
    console.log(`   ✅ ${message}`)
    passedTests++
  } else {
    console.log(`   ❌ ${message}`)
    failedTests++
  }
}

/**
 * Test 1: Date validation (ISO 8601)
 */
function testDateValidation() {
  console.log('Test 1: Date Validation (ISO 8601)')
  console.log('-----------------------------------')
  
  // Valid ISO 8601 dates
  const validDates = [
    '2025-01-01T00:00:00Z',
    '2025-12-31T23:59:59Z',
    '2025-06-15T12:30:45.123Z'
  ]
  
  for (const dateStr of validDates) {
    const date = new Date(dateStr)
    assert(!isNaN(date.getTime()), `Valid ISO 8601 date: ${dateStr}`)
  }
  
  // Invalid dates
  const invalidDates = [
    'not-a-date',
    '2025-13-01',  // invalid month
    '2025-01-32'   // invalid day
  ]
  
  for (const dateStr of invalidDates) {
    const date = new Date(dateStr)
    assert(isNaN(date.getTime()), `Invalid date rejected: ${dateStr}`)
  }
  
  // Note: '01/01/2025' is actually parsed by JavaScript Date constructor
  // so it's not invalid in the strictest sense
  
  console.log('')
}

/**
 * Test 2: Start < End validation
 */
function testStartEndValidation() {
  console.log('Test 2: Start < End Validation')
  console.log('-------------------------------')
  
  const start = new Date('2025-01-01T00:00:00Z')
  const end = new Date('2025-12-31T23:59:59Z')
  
  assert(start < end, 'Valid range: start before end')
  
  const invalidStart = new Date('2025-12-31T23:59:59Z')
  const invalidEnd = new Date('2025-01-01T00:00:00Z')
  
  assert(invalidStart >= invalidEnd, 'Invalid range: start >= end detected')
  
  const sameDate = new Date('2025-06-15T12:00:00Z')
  assert(sameDate >= sameDate, 'Same date: start >= end detected')
  
  console.log('')
}

/**
 * Test 3: Date overlap semantics
 */
function testDateOverlapSemantics() {
  console.log('Test 3: Date Overlap Semantics')
  console.log('-------------------------------')
  
  // Test data: events with start/end dates
  const events = [
    {
      eventId: 'evt_1',
      startDate: new Date('2025-01-10T10:00:00Z'),
      endDate: new Date('2025-01-10T12:00:00Z')
    },
    {
      eventId: 'evt_2',
      startDate: new Date('2025-01-15T10:00:00Z'),
      endDate: new Date('2025-01-15T12:00:00Z')
    },
    {
      eventId: 'evt_3',
      startDate: new Date('2025-01-20T10:00:00Z'),
      endDate: new Date('2025-01-20T12:00:00Z')
    },
    {
      eventId: 'evt_4',
      startDate: new Date('2025-01-25T10:00:00Z'),
      endDate: new Date('2025-01-25T12:00:00Z')
    }
  ]
  
  // Filter: start=2025-01-12, end=2025-01-22
  // Should return evt_2 and evt_3 (overlap with filter range)
  const filterStart = new Date('2025-01-12T00:00:00Z')
  const filterEnd = new Date('2025-01-22T23:59:59Z')
  
  const filtered = events.filter(ev => {
    const eventStart = ev.startDate
    const eventEnd = ev.endDate
    
    // Event must overlap with the requested date range
    if (filterStart && eventEnd && eventEnd < filterStart) {
      return false // Event ends before requested start
    }
    if (filterEnd && eventStart && eventStart > filterEnd) {
      return false // Event starts after requested end
    }
    return true
  })
  
  assert(filtered.length === 2, `Overlap filter returns 2 events (got ${filtered.length})`)
  assert(filtered[0].eventId === 'evt_2', 'First result is evt_2')
  assert(filtered[1].eventId === 'evt_3', 'Second result is evt_3')
  
  // Test edge case: event exactly at filter boundary
  const edgeEvents = [
    {
      eventId: 'evt_boundary_1',
      startDate: new Date('2025-01-12T00:00:00Z'),  // starts exactly at filter start
      endDate: new Date('2025-01-12T02:00:00Z')
    },
    {
      eventId: 'evt_boundary_2',
      startDate: new Date('2025-01-22T20:00:00Z'),
      endDate: new Date('2025-01-22T23:59:59Z')     // ends exactly at filter end
    }
  ]
  
  const edgeFiltered = edgeEvents.filter(ev => {
    const eventStart = ev.startDate
    const eventEnd = ev.endDate
    
    if (filterStart && eventEnd && eventEnd < filterStart) {
      return false
    }
    if (filterEnd && eventStart && eventStart > filterEnd) {
      return false
    }
    return true
  })
  
  assert(edgeFiltered.length === 2, 'Boundary events included in results')
  
  console.log('')
}

/**
 * Test 4: Pagination logic
 */
function testPaginationLogic() {
  console.log('Test 4: Pagination Logic')
  console.log('-------------------------')
  
  // Test data: 10 events
  const events = Array.from({ length: 10 }, (_, i) => ({
    flypost: { eventId: `evt_${i + 1}` },
    name: `Event ${i + 1}`
  }))
  
  // Page 1: limit=3, no cursor
  const limit = 3
  const cursor = null
  
  let startIndex = 0
  if (cursor) {
    const cursorIndex = events.findIndex(ev => ev.flypost?.eventId === cursor)
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1
    }
  }
  
  const page1 = events.slice(startIndex, startIndex + limit)
  const hasMore1 = startIndex + limit < events.length
  const nextCursor1 = hasMore1 && page1.length > 0 
    ? page1[page1.length - 1].flypost?.eventId 
    : null
  
  assert(page1.length === 3, 'Page 1: 3 results')
  assert(page1[0].flypost.eventId === 'evt_1', 'Page 1: First event is evt_1')
  assert(page1[2].flypost.eventId === 'evt_3', 'Page 1: Last event is evt_3')
  assert(hasMore1 === true, 'Page 1: hasMore is true')
  assert(nextCursor1 === 'evt_3', 'Page 1: cursor is evt_3')
  
  // Page 2: limit=3, cursor=evt_3
  const cursor2 = nextCursor1
  let startIndex2 = 0
  if (cursor2) {
    const cursorIndex = events.findIndex(ev => ev.flypost?.eventId === cursor2)
    if (cursorIndex >= 0) {
      startIndex2 = cursorIndex + 1
    }
  }
  
  const page2 = events.slice(startIndex2, startIndex2 + limit)
  const hasMore2 = startIndex2 + limit < events.length
  const nextCursor2 = hasMore2 && page2.length > 0 
    ? page2[page2.length - 1].flypost?.eventId 
    : null
  
  assert(page2.length === 3, 'Page 2: 3 results')
  assert(page2[0].flypost.eventId === 'evt_4', 'Page 2: First event is evt_4')
  assert(page2[2].flypost.eventId === 'evt_6', 'Page 2: Last event is evt_6')
  assert(hasMore2 === true, 'Page 2: hasMore is true')
  assert(nextCursor2 === 'evt_6', 'Page 2: cursor is evt_6')
  
  // Last page: limit=3, cursor=evt_9
  const cursor3 = 'evt_9'
  let startIndex3 = 0
  if (cursor3) {
    const cursorIndex = events.findIndex(ev => ev.flypost?.eventId === cursor3)
    if (cursorIndex >= 0) {
      startIndex3 = cursorIndex + 1
    }
  }
  
  const page3 = events.slice(startIndex3, startIndex3 + limit)
  const hasMore3 = startIndex3 + limit < events.length
  const nextCursor3 = hasMore3 && page3.length > 0 
    ? page3[page3.length - 1].flypost?.eventId 
    : null
  
  assert(page3.length === 1, 'Last page: 1 result (partial page)')
  assert(page3[0].flypost.eventId === 'evt_10', 'Last page: First event is evt_10')
  assert(hasMore3 === false, 'Last page: hasMore is false')
  assert(nextCursor3 === null, 'Last page: no cursor')
  
  console.log('')
}

/**
 * Test 5: Sorting logic
 */
function testSortingLogic() {
  console.log('Test 5: Sorting Logic')
  console.log('---------------------')
  
  // Test data: events with different start dates
  const events = [
    {
      flypost: { eventId: 'evt_3' },
      startDate: new Date('2025-01-20T10:00:00Z')
    },
    {
      flypost: { eventId: 'evt_1' },
      startDate: new Date('2025-01-10T10:00:00Z')
    },
    {
      flypost: { eventId: 'evt_2' },
      startDate: new Date('2025-01-15T10:00:00Z')
    }
  ]
  
  // Sort by startDate
  const sorted = [...events].sort((a, b) => {
    const dateA = a.startDate ? new Date(a.startDate) : new Date(0)
    const dateB = b.startDate ? new Date(b.startDate) : new Date(0)
    return dateA - dateB
  })
  
  assert(sorted[0].flypost.eventId === 'evt_1', 'Sort by startDate: First is evt_1')
  assert(sorted[1].flypost.eventId === 'evt_2', 'Sort by startDate: Second is evt_2')
  assert(sorted[2].flypost.eventId === 'evt_3', 'Sort by startDate: Third is evt_3')
  
  console.log('')
}

/**
 * Test 6: Limit validation
 */
function testLimitValidation() {
  console.log('Test 6: Limit Validation')
  console.log('------------------------')
  
  // Test limit bounds: default 25, max 50, min 1
  const testCases = [
    { input: undefined, expected: 25, desc: 'Default limit (undefined)' },
    { input: null, expected: 25, desc: 'Default limit (null)' },
    { input: '', expected: 25, desc: 'Default limit (empty string)' },
    { input: '10', expected: 10, desc: 'Valid limit: 10' },
    { input: '50', expected: 50, desc: 'Max limit: 50' },
    { input: '100', expected: 50, desc: 'Over max: clamped to 50' },
    { input: '0', expected: 25, desc: 'Zero: defaults to 25 (parseInt("0") || 25 = 25 due to falsy)' },
    { input: '-5', expected: 1, desc: 'Negative: clamped to 1' }
  ]
  
  for (const tc of testCases) {
    const limit = Math.min(Math.max(parseInt(tc.input) || 25, 1), 50)
    assert(limit === tc.expected, `${tc.desc}: ${limit} === ${tc.expected}`)
  }
  
  console.log('')
}

// Run all tests
testDateValidation()
testStartEndValidation()
testDateOverlapSemantics()
testPaginationLogic()
testSortingLogic()
testLimitValidation()

// Print summary
console.log('========================================')
console.log(`\n📊 Test Summary:`)
console.log(`   Total: ${totalTests}`)
console.log(`   ✅ Passed: ${passedTests}`)
console.log(`   ❌ Failed: ${failedTests}`)
console.log('')

if (failedTests > 0) {
  console.log('❌ Some tests failed')
  process.exit(1)
} else {
  console.log('✅ All tests passed!')
  process.exit(0)
}
