/*
 * Integration Test - Price Enforcement End-to-End
 * Tests the complete flow through validation and enforcement
 * without requiring actual LLM (uses mock parsed events)
 */

import { validateEventData } from './src/validation.js'
import { extractPriceFromText, hasValidListPrice } from './src/utils/priceExtractor.js'

console.log('🧪 Price Enforcement Integration Test\n')

// Simulate complete ingestion flow for an event
function simulateIngestion(naturalLanguageInput, mockLLMOutput) {
  console.log(`📝 Input: "${naturalLanguageInput.substring(0, 80)}..."`)
  
  // Step 1: Parse with LLM (simulated)
  let parsedEvent = { ...mockLLMOutput }
  console.log(`   Step 1: LLM parsed event: ${parsedEvent.name}`)
  
  // Step 2: Deterministic price extraction & enrichment
  if (!hasValidListPrice(parsedEvent)) {
    const extractedPrice = extractPriceFromText(naturalLanguageInput)
    if (extractedPrice) {
      console.log(`   Step 2: 💰 Extracted price: ${extractedPrice.listPriceDisplay} → ${extractedPrice.listPrice}`)
      
      parsedEvent.flypost = {
        ...parsedEvent.flypost,
        listPrice: extractedPrice.listPrice,
        listPriceDisplay: extractedPrice.listPriceDisplay,
        listPriceCurrency: extractedPrice.listPriceCurrency,
        priceType: extractedPrice.priceType
      }
      
      parsedEvent.offers = {
        '@type': 'Offer',
        price: extractedPrice.listPrice,
        priceCurrency: extractedPrice.listPriceCurrency
      }
    } else {
      console.log(`   Step 2: ⚠️  No price extracted from text`)
    }
  } else {
    console.log(`   Step 2: ✅ LLM already extracted price: ${parsedEvent.flypost.listPrice}`)
  }
  
  // Step 3: Validate schema
  const validation = validateEventData(parsedEvent)
  if (!validation.success) {
    console.log(`   Step 3: ❌ Schema validation failed`)
    return { success: false, error: 'Schema validation failed', details: validation.errors }
  }
  console.log(`   Step 3: ✅ Schema validation passed`)
  
  const validatedEvent = validation.data
  
  // Step 4: Enforce price requirement
  if (!hasValidListPrice(validatedEvent)) {
    console.log(`   Step 4: ❌ Price enforcement failed`)
    return {
      success: false,
      error: 'List price is required for published events',
      message: 'Please include the list price in your event description (e.g., "List Price: $1,250,000" or "$2.5 million").'
    }
  }
  console.log(`   Step 4: ✅ Price enforcement passed`)
  
  // Step 5: Would store event here
  console.log(`   Step 5: ✅ Event ready for storage`)
  
  return { success: true, event: validatedEvent }
}

// Create mock LLM output (baseline event structure)
function createMockLLMOutput(name, description, hasPrice = false) {
  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    flypost: {
      eventId: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      category: 'open-houses',
      realTimeData: true,
      crawlable: true,
      queryable: true,
      submissionTimestamp: new Date().toISOString()
    },
    name: name,
    description: description,
    startDate: new Date(Date.now() + 86400000).toISOString(),
    location: {
      '@type': 'Place',
      name: '123 Main Street',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '123 Main Street',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90405',
        addressCountry: 'US'
      }
    },
    organizer: {
      '@type': 'Person',
      name: 'Jane Smith',
      email: 'jane@realty.com'
    }
  }
  
  if (hasPrice) {
    event.flypost.listPrice = 1250000
    event.flypost.listPriceDisplay = '$1,250,000'
    event.flypost.listPriceCurrency = 'USD'
    event.flypost.priceType = 'LIST_PRICE'
    event.offers = {
      '@type': 'Offer',
      price: 1250000,
      priceCurrency: 'USD'
    }
  }
  
  return event
}

console.log('Test 1: LLM extracts price successfully')
console.log('='.repeat(70))
const input1 = 'Open house this Saturday at 123 Main St, Santa Monica. Beautiful 3BR home listed at $1,250,000. Contact Jane Smith at jane@realty.com'
const mock1 = createMockLLMOutput('Open House - 123 Main St', input1, true) // LLM extracted price
const result1 = simulateIngestion(input1, mock1)
if (!result1.success) {
  console.error('❌ Test 1 failed: Expected success')
  process.exit(1)
}
console.log('✅ Test 1 PASSED: Event ingested with LLM-extracted price\n')

console.log('Test 2: LLM misses price, deterministic extraction saves it')
console.log('='.repeat(70))
const input2 = 'Open house this Saturday at 123 Main St, Santa Monica. Beautiful 3BR home listed at $1,250,000. Contact Jane Smith at jane@realty.com'
const mock2 = createMockLLMOutput('Open House - 123 Main St', input2, false) // LLM missed price
const result2 = simulateIngestion(input2, mock2)
if (!result2.success) {
  console.error('❌ Test 2 failed: Expected success with deterministic extraction')
  process.exit(1)
}
if (!result2.event.flypost.listPrice) {
  console.error('❌ Test 2 failed: Price should have been extracted')
  process.exit(1)
}
console.log('✅ Test 2 PASSED: Deterministic extraction filled missing price\n')

console.log('Test 3: Million notation extraction')
console.log('='.repeat(70))
const input3 = 'Luxury estate open house at 456 Ocean Blvd, Malibu. Priced at $2.5 million with stunning views.'
const mock3 = createMockLLMOutput('Luxury Estate Open House', input3, false)
const result3 = simulateIngestion(input3, mock3)
if (!result3.success) {
  console.error('❌ Test 3 failed: Expected success with million notation')
  process.exit(1)
}
if (result3.event.flypost.listPrice !== 2500000) {
  console.error(`❌ Test 3 failed: Expected 2500000, got ${result3.event.flypost.listPrice}`)
  process.exit(1)
}
console.log('✅ Test 3 PASSED: Million notation converted correctly\n')

console.log('Test 4: No price anywhere - rejection')
console.log('='.repeat(70))
const input4 = 'Open house this Saturday at 123 Main St, Santa Monica. Beautiful 3BR home. Contact Jane Smith.'
const mock4 = createMockLLMOutput('Open House - 123 Main St', input4, false)
const result4 = simulateIngestion(input4, mock4)
if (result4.success) {
  console.error('❌ Test 4 failed: Expected rejection when no price')
  process.exit(1)
}
if (!result4.error.includes('List price is required')) {
  console.error('❌ Test 4 failed: Wrong error message')
  console.error('   Got:', result4.error)
  process.exit(1)
}
console.log('✅ Test 4 PASSED: Correctly rejected event without price\n')

console.log('Test 5: Various price formats')
console.log('='.repeat(70))

// Test 5a: No commas
const input5a = 'Property at $11975000'
const mock5a = createMockLLMOutput('Property', input5a, false)
const result5a = simulateIngestion(input5a, mock5a)
if (!result5a.success || result5a.event.flypost.listPrice !== 11975000) {
  console.error('❌ Test 5a failed: Format without commas')
  process.exit(1)
}
console.log('✅ Test 5a PASSED: $11975000 → 11975000')

// Test 5b: Million with "mil"
const input5b = 'Listed at $3.2 mil'
const mock5b = createMockLLMOutput('Property', input5b, false)
const result5b = simulateIngestion(input5b, mock5b)
if (!result5b.success || result5b.event.flypost.listPrice !== 3200000) {
  console.error('❌ Test 5b failed: Million with "mil"')
  process.exit(1)
}
console.log('✅ Test 5b PASSED: $3.2 mil → 3200000')

// Test 5c: Million with "M"
const input5c = 'Asking $1.8M'
const mock5c = createMockLLMOutput('Property', input5c, false)
const result5c = simulateIngestion(input5c, mock5c)
if (!result5c.success || result5c.event.flypost.listPrice !== 1800000) {
  console.error('❌ Test 5c failed: Million with "M"')
  process.exit(1)
}
console.log('✅ Test 5c PASSED: $1.8M → 1800000\n')

console.log('Test 6: Verify offers object derivation')
console.log('='.repeat(70))
const input6 = 'Property listed at $850,000'
const mock6 = createMockLLMOutput('Property', input6, false)
const result6 = simulateIngestion(input6, mock6)
if (!result6.success) {
  console.error('❌ Test 6 failed: Expected success')
  process.exit(1)
}
if (!result6.event.offers || result6.event.offers.price !== 850000) {
  console.error('❌ Test 6 failed: offers object not derived correctly')
  console.error('   offers:', result6.event.offers)
  process.exit(1)
}
if (result6.event.offers['@type'] !== 'Offer') {
  console.error('❌ Test 6 failed: offers @type incorrect')
  process.exit(1)
}
console.log('✅ Test 6 PASSED: offers object correctly derived from extracted price\n')

console.log('=' .repeat(70))
console.log('✅ ALL INTEGRATION TESTS PASSED!')
console.log('=' .repeat(70))
console.log('\nSummary:')
console.log('- LLM-extracted prices are preserved')
console.log('- Deterministic extraction fills in when LLM misses price')
console.log('- Million notation correctly parsed')
console.log('- Events without price are correctly rejected')
console.log('- Various price formats supported')
console.log('- offers object correctly derived from extracted prices')
