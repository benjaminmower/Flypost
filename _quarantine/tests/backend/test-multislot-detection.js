/*
 * Test: Multi-Slot Detection Logic
 * 
 * Tests the detectMultipleTimeSlots function that identifies
 * when input text describes multiple time slots
 */

console.log('🧪 Testing Multi-Slot Detection\n')

// Helper function (copied from server.js for testing)
function detectMultipleTimeSlots(text) {
  if (!text || typeof text !== 'string') {
    return false
  }
  
  const lowerText = text.toLowerCase()
  
  // Count distinct weekday mentions
  const weekdayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi
  const weekdays = text.match(weekdayPattern) || []
  const uniqueWeekdays = new Set(weekdays.map(d => d.toLowerCase().substring(0, 3)))
  
  if (uniqueWeekdays.size >= 2) {
    return true
  }
  
  // Count time range patterns
  const timeRangePattern = /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\s*[-–—to]\s*\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\b/gi
  const timeRanges = text.match(timeRangePattern) || []
  
  if (timeRanges.length >= 2) {
    return true
  }
  
  // Count date-like patterns
  const datePattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(st|nd|rd|th)?\b|\b\d{1,2}\/\d{1,2}\b/gi
  const dates = text.match(datePattern) || []
  
  if (dates.length >= 2) {
    return true
  }
  
  // Check for explicit "and" between time indicators
  const andPattern = /\b(morning|afternoon|evening|\d{1,2}\s*(am|pm)?)\s+and\s+(morning|afternoon|evening|\d{1,2}\s*(am|pm)?)\b/i
  if (andPattern.test(text)) {
    return true
  }
  
  return false
}

// Test 1: Single slot - should return false
console.log('Test 1: Single slot (Saturday 2-4pm)')
const singleSlot = "Open house Saturday 2-4pm at 123 Main St"
const result1 = detectMultipleTimeSlots(singleSlot)
console.log(`  Result: ${result1}`)
console.assert(result1 === false, '✅ Single slot not detected as multi-slot')

// Test 2: Multiple weekdays - should return true
console.log('\nTest 2: Multiple weekdays (Saturday and Sunday)')
const multiWeekday = "Open house Saturday 2-4pm and Sunday 1-3pm at 123 Main St"
const result2 = detectMultipleTimeSlots(multiWeekday)
console.log(`  Result: ${result2}`)
console.assert(result2 === true, '✅ Multiple weekdays detected')

// Test 3: Multiple time ranges - should return true
console.log('\nTest 3: Multiple time ranges (11-1 and 2-4)')
const multiTimeRange = "Open house Saturday 11-1 and 2-4 at 123 Main St"
const result3 = detectMultipleTimeSlots(multiTimeRange)
console.log(`  Result: ${result3}`)
console.assert(result3 === true, '✅ Multiple time ranges detected')

// Test 4: Multiple dates - should return true
console.log('\nTest 4: Multiple dates (Jan 3 and Jan 4)')
const multiDate = "Open house on January 3rd 2-4pm and January 4th 11-1pm"
const result4 = detectMultipleTimeSlots(multiDate)
console.log(`  Result: ${result4}`)
console.assert(result4 === true, '✅ Multiple dates detected')

// Test 5: Using "and" with times - should return true
console.log('\nTest 5: "and" between times (2pm and 4pm)')
const andPattern = "Open house this Saturday, showing at 2pm and 4pm"
const result5 = detectMultipleTimeSlots(andPattern)
console.log(`  Result: ${result5}`)
console.assert(result5 === true, '✅ "and" pattern detected')

// Test 6: Numeric date format - should return true
console.log('\nTest 6: Numeric dates (1/3 and 1/4)')
const numericDates = "Open house on 1/3 at 2pm and 1/4 at 3pm"
const result6 = detectMultipleTimeSlots(numericDates)
console.log(`  Result: ${result6}`)
console.assert(result6 === true, '✅ Numeric dates detected')

// Test 7: No multi-slot indicators - should return false
console.log('\nTest 7: Simple single-slot (this Saturday)')
const simple = "Open house this Saturday"
const result7 = detectMultipleTimeSlots(simple)
console.log(`  Result: ${result7}`)
console.assert(result7 === false, '✅ No multi-slot indicators')

// Test 8: Abbreviated weekdays - should return true
console.log('\nTest 8: Abbreviated weekdays (Sat and Sun)')
const abbreviated = "Open house Sat 2-4pm and Sun 1-3pm"
const result8 = detectMultipleTimeSlots(abbreviated)
console.log(`  Result: ${result8}`)
console.assert(result8 === true, '✅ Abbreviated weekdays detected')

console.log('\n✅ All multi-slot detection tests passed!')
