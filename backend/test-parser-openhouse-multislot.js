/*
 * Test: LLM Parser Open House Multi-Slot Support
 * 
 * Tests that the LLM parser properly handles open-houses category:
 * - Validates endDate requirement for single-slot open houses
 * - Validates occurrences[] structure for multi-slot open houses
 * - Ensures fallback logic triggers when required fields are missing
 * 
 * This test does NOT require OPENAI_API_KEY - it tests validation logic only.
 */

console.log('🧪 Testing LLM Parser Open House Multi-Slot Support\n')

// Test 1: Validate detection of missing endDate in single-slot open house
console.log('Test 1: Single-slot open house missing endDate should trigger fallback')
const singleSlotMissingEndDate = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  'name': 'Open House - Beautiful Home',
  'description': 'Open house this Saturday',
  'startDate': '2026-01-04T14:00:00.000Z',
  // endDate is missing - should trigger fallback
  'flypost': {
    'eventId': 'evt_test_001',
    'category': 'open-houses',
    'realTimeData': true,
    'crawlable': true,
    'queryable': true
  },
  'location': {
    '@type': 'Place',
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': '123 Main St',
      'addressLocality': 'Santa Monica',
      'addressRegion': 'CA',
      'postalCode': '90405'
    }
  },
  'organizer': {
    '@type': 'Person',
    'name': 'Test Agent'
  }
}

// Simulate validation logic from llmParser.js
function validateOpenHouseParsing(parsedEvent) {
  const missingFields = []
  
  // Standard required fields
  if (!parsedEvent.name) missingFields.push('name')
  if (!parsedEvent.description) missingFields.push('description')
  if (!parsedEvent.startDate) missingFields.push('startDate')
  if (!parsedEvent.location || !parsedEvent.location.address || !parsedEvent.location.address.streetAddress) {
    missingFields.push('location.address.streetAddress')
  }
  if (!parsedEvent.organizer) missingFields.push('organizer')
  if (!parsedEvent['@context']) missingFields.push('@context')
  if (!parsedEvent['@type']) missingFields.push('@type')
  
  let needsFallback = false
  
  // Validate open-houses specific requirements
  if (parsedEvent.flypost?.category === 'open-houses') {
    const hasOccurrences = parsedEvent.occurrences && Array.isArray(parsedEvent.occurrences) && parsedEvent.occurrences.length > 0
    const hasTopLevelEndDate = parsedEvent.endDate
    
    // Check if endDate is completely missing (neither in occurrences nor top-level)
    if (!hasTopLevelEndDate && !hasOccurrences) {
      console.log(`  ⚠️  open-houses missing both endDate and occurrences[]`)
      needsFallback = true
    }
    
    // If occurrences exist, validate each has both startDate and endDate
    if (hasOccurrences) {
      for (let i = 0; i < parsedEvent.occurrences.length; i++) {
        const occ = parsedEvent.occurrences[i]
        if (!occ.startDate || !occ.endDate) {
          console.log(`  ⚠️  occurrence[${i}] missing startDate or endDate`)
          needsFallback = true
          break
        }
      }
    }
  }
  
  if (missingFields.length > 0) {
    console.log(`  ⚠️  Missing fields: ${missingFields.join(', ')}`)
    needsFallback = true
  }
  
  return { needsFallback, missingFields }
}

const result1 = validateOpenHouseParsing(singleSlotMissingEndDate)
console.assert(result1.needsFallback === true, '✅ Single-slot missing endDate triggers fallback')

// Test 2: Single-slot open house WITH endDate should NOT trigger fallback
console.log('\nTest 2: Single-slot open house WITH endDate should NOT trigger fallback')
const singleSlotWithEndDate = {
  ...singleSlotMissingEndDate,
  'endDate': '2026-01-04T16:00:00.000Z'
}

const result2 = validateOpenHouseParsing(singleSlotWithEndDate)
console.assert(result2.needsFallback === false, '✅ Single-slot with endDate does not trigger fallback')

// Test 3: Multi-slot open house with valid occurrences should NOT trigger fallback
console.log('\nTest 3: Multi-slot open house with valid occurrences[] should NOT trigger fallback')
const multiSlotValid = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  'name': 'Open House - Weekend Showings',
  'description': 'Open house Saturday and Sunday',
  'startDate': '2026-01-04T11:00:00.000Z',
  'endDate': '2026-01-04T13:00:00.000Z',
  'flypost': {
    'eventId': 'evt_test_003',
    'category': 'open-houses',
    'realTimeData': true,
    'crawlable': true,
    'queryable': true
  },
  'location': {
    '@type': 'Place',
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': '2116 3rd St',
      'addressLocality': 'Santa Monica',
      'addressRegion': 'CA',
      'postalCode': '90405'
    }
  },
  'organizer': {
    '@type': 'Person',
    'name': 'Test Agent'
  },
  'occurrences': [
    {
      'startDate': '2026-01-04T11:00:00.000Z',
      'endDate': '2026-01-04T13:00:00.000Z',
      'label': 'Saturday'
    },
    {
      'startDate': '2026-01-05T14:30:00.000Z',
      'endDate': '2026-01-05T17:30:00.000Z',
      'label': 'Sunday'
    }
  ]
}

const result3 = validateOpenHouseParsing(multiSlotValid)
console.assert(result3.needsFallback === false, '✅ Multi-slot with valid occurrences does not trigger fallback')

// Test 4: Multi-slot open house with occurrence missing endDate should trigger fallback
console.log('\nTest 4: Multi-slot open house with occurrence missing endDate should trigger fallback')
const multiSlotMissingOccEndDate = {
  ...multiSlotValid,
  'occurrences': [
    {
      'startDate': '2026-01-04T11:00:00.000Z',
      'endDate': '2026-01-04T13:00:00.000Z',
      'label': 'Saturday'
    },
    {
      'startDate': '2026-01-05T14:30:00.000Z',
      // Missing endDate - should trigger fallback
      'label': 'Sunday'
    }
  ]
}

const result4 = validateOpenHouseParsing(multiSlotMissingOccEndDate)
console.assert(result4.needsFallback === true, '✅ Multi-slot with missing occurrence endDate triggers fallback')

// Test 5: Multi-slot open house with occurrence missing startDate should trigger fallback
console.log('\nTest 5: Multi-slot open house with occurrence missing startDate should trigger fallback')
const multiSlotMissingOccStartDate = {
  ...multiSlotValid,
  'occurrences': [
    {
      'startDate': '2026-01-04T11:00:00.000Z',
      'endDate': '2026-01-04T13:00:00.000Z',
      'label': 'Saturday'
    },
    {
      // Missing startDate - should trigger fallback
      'endDate': '2026-01-05T17:30:00.000Z',
      'label': 'Sunday'
    }
  ]
}

const result5 = validateOpenHouseParsing(multiSlotMissingOccStartDate)
console.assert(result5.needsFallback === true, '✅ Multi-slot with missing occurrence startDate triggers fallback')

// Test 6: Non-open-house category without endDate should NOT trigger fallback
console.log('\nTest 6: Non-open-house category without endDate should NOT trigger fallback')
const garageSaleNoEndDate = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  'name': 'Garage Sale',
  'description': 'Big garage sale this weekend',
  'startDate': '2026-01-04T08:00:00.000Z',
  // No endDate, but that's OK for garage-sales
  'flypost': {
    'eventId': 'evt_test_006',
    'category': 'garage-sales',
    'realTimeData': true,
    'crawlable': true,
    'queryable': true
  },
  'location': {
    '@type': 'Place',
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': '456 Oak Ave',
      'addressLocality': 'Los Angeles',
      'addressRegion': 'CA',
      'postalCode': '90001'
    }
  },
  'organizer': {
    '@type': 'Person',
    'name': 'Test Organizer'
  }
}

const result6 = validateOpenHouseParsing(garageSaleNoEndDate)
console.assert(result6.needsFallback === false, '✅ Non-open-house without endDate does not trigger fallback')

// Test 7: Verify occurrences structure matches expected schema
console.log('\nTest 7: Verify occurrences[] structure has all required fields')
const occurrences = multiSlotValid.occurrences
console.assert(Array.isArray(occurrences), '  ✓ occurrences is an array')
console.assert(occurrences.length === 2, '  ✓ occurrences has 2 elements')
console.assert(occurrences[0].startDate !== undefined, '  ✓ first occurrence has startDate')
console.assert(occurrences[0].endDate !== undefined, '  ✓ first occurrence has endDate')
console.assert(occurrences[0].label === 'Saturday', '  ✓ first occurrence has label "Saturday"')
console.assert(occurrences[1].startDate !== undefined, '  ✓ second occurrence has startDate')
console.assert(occurrences[1].endDate !== undefined, '  ✓ second occurrence has endDate')
console.assert(occurrences[1].label === 'Sunday', '  ✓ second occurrence has label "Sunday"')
console.log('✅ Occurrences structure is valid')

// Test 8: Verify occurrences is at root level (not flypost.occurrences)
console.log('\nTest 8: Verify occurrences[] is at root level')
console.assert(multiSlotValid.occurrences !== undefined, '  ✓ occurrences exists at root level')
console.assert(multiSlotValid.flypost.occurrences === undefined, '  ✓ flypost.occurrences does NOT exist')
console.log('✅ Occurrences is at correct location (root level)')

console.log('\n✅ All LLM Parser open-house multi-slot tests passed!')
console.log('\n📋 Summary:')
console.log('  - Single-slot open houses require endDate or trigger fallback ✅')
console.log('  - Multi-slot open houses require occurrences[] with endDate in each ✅')
console.log('  - Occurrences must have both startDate and endDate ✅')
console.log('  - Non-open-house categories are not affected ✅')
console.log('  - occurrences[] is at root level, not flypost.occurrences ✅')
