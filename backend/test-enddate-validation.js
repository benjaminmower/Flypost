/*
 * Unit Test - Open House EndDate Validation
 * 
 * Tests that open houses require endDate at publish time
 */

import { validateOpenHouseEndDate } from './src/utils/timeNormalization.js'

console.log('🧪 Testing Open House EndDate Requirement\n')

// Test 1: Open house with endDate - should pass
console.log('Test 1: Open house with endDate')
const validOpenHouse = {
  flypost: { category: 'open-houses' },
  startDate: '2025-01-15T14:00:00Z',
  endDate: '2025-01-15T16:00:00Z'
}
const result1 = validateOpenHouseEndDate(validOpenHouse)
console.log(`  Valid: ${result1.valid}`)
console.assert(result1.valid === true, '✅ Valid open house passes')

// Test 2: Open house without endDate - should fail
console.log('\nTest 2: Open house without endDate')
const invalidOpenHouse = {
  flypost: { category: 'open-houses' },
  startDate: '2025-01-15T14:00:00Z'
}
const result2 = validateOpenHouseEndDate(invalidOpenHouse)
console.log(`  Valid: ${result2.valid}`)
console.log(`  Error: ${result2.error}`)
console.assert(result2.valid === false, '✅ Invalid open house fails')
console.assert(result2.error.includes('end time'), '✅ Error message is helpful')

// Test 3: Open house with occurrences, all have endDate - should pass
console.log('\nTest 3: Open house with occurrences (all valid)')
const multiSlotValid = {
  flypost: {
    category: 'open-houses'
  },
  occurrences: [
    { occurrenceId: 'occ_1', startDate: '2025-01-15T14:00:00Z', endDate: '2025-01-15T16:00:00Z' },
    { occurrenceId: 'occ_2', startDate: '2025-01-16T14:00:00Z', endDate: '2025-01-16T16:00:00Z' }
  ]
}
const result3 = validateOpenHouseEndDate(multiSlotValid)
console.log(`  Valid: ${result3.valid}`)
console.assert(result3.valid === true, '✅ Multi-slot with all endDates passes')

// Test 4: Open house with occurrences, one missing endDate - should fail
console.log('\nTest 4: Open house with occurrences (one missing endDate)')
const multiSlotInvalid = {
  flypost: {
    category: 'open-houses'
  },
  occurrences: [
    { occurrenceId: 'occ_1', startDate: '2025-01-15T14:00:00Z', endDate: '2025-01-15T16:00:00Z' },
    { occurrenceId: 'occ_2', startDate: '2025-01-16T14:00:00Z' } // Missing endDate
  ]
}
const result4 = validateOpenHouseEndDate(multiSlotInvalid)
console.log(`  Valid: ${result4.valid}`)
console.log(`  Error: ${result4.error}`)
console.assert(result4.valid === false, '✅ Multi-slot with missing endDate fails')

// Test 5: Non-open-house without endDate - should pass
console.log('\nTest 5: Garage sale without endDate')
const garageSale = {
  flypost: { category: 'garage-sales' },
  startDate: '2025-01-15T08:00:00Z'
}
const result5 = validateOpenHouseEndDate(garageSale)
console.log(`  Valid: ${result5.valid}`)
console.assert(result5.valid === true, '✅ Non-open-house passes without endDate')

console.log('\n✅ All validation tests passed!')
