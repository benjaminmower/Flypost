/*
 * Test Price Enforcement on Publish
 * Validates that:
 * 1. Publish fails (400) when no price is present anywhere
 * 2. Publish succeeds when price in input text but LLM misses it (via deterministic extraction)
 * 3. Update carry-forward preserves existing price when update lacks price
 */

import { validateEventData } from './src/validation.js'
import { extractPriceFromText, hasValidListPrice } from './src/utils/priceExtractor.js'

console.log('🧪 Testing Price Enforcement Logic\n')

// Simulate the price enforcement check from server.js
function enforcePrice(event) {
  if (!hasValidListPrice(event)) {
    return {
      success: false,
      error: 'List price is required for published events',
      message: 'Please include the list price in your event description (e.g., "List Price: $1,250,000" or "$2.5 million").',
      hint: 'Supported formats: $1,250,000 | $1250000 | $2.5M | $2.5 million'
    }
  }
  return { success: true }
}

// Simulate the enrichment flow from server.js
function enrichPriceFromInput(parsedEvent, naturalLanguageInput) {
  if (!hasValidListPrice(parsedEvent)) {
    const extractedPrice = extractPriceFromText(naturalLanguageInput)
    if (extractedPrice) {
      console.log(`💰 Enriching with extracted price: ${extractedPrice.listPriceDisplay}`)
      
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
    }
  }
  return parsedEvent
}

// Simulate carry-forward logic from storage.js
function carryForwardPrice(newEvent, existingEvent) {
  const newHasPrice = hasValidListPrice(newEvent)
  const existingHasPrice = hasValidListPrice(existingEvent)
  
  if (!newHasPrice && existingHasPrice) {
    console.log(`💰 Carrying forward price: ${existingEvent.flypost.listPriceDisplay || existingEvent.flypost.listPrice}`)
    
    newEvent.flypost.listPrice = existingEvent.flypost.listPrice
    if (existingEvent.flypost.listPriceDisplay) {
      newEvent.flypost.listPriceDisplay = existingEvent.flypost.listPriceDisplay
    }
    if (existingEvent.flypost.listPriceCurrency) {
      newEvent.flypost.listPriceCurrency = existingEvent.flypost.listPriceCurrency
    }
    if (existingEvent.flypost.priceType) {
      newEvent.flypost.priceType = existingEvent.flypost.priceType
    }
    if (existingEvent.offers) {
      newEvent.offers = existingEvent.offers
    }
  }
  
  return newEvent
}

// Test 1: Enforcement - Reject when no price anywhere
console.log('Test 1: Reject publish when no price present')
const eventNoPrice = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_test_001',
    category: 'open-houses',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: new Date().toISOString()
  },
  name: 'Open House',
  description: 'Beautiful home with 3 bedrooms',
  startDate: new Date(Date.now() + 86400000).toISOString(),
  location: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main St',
      addressLocality: 'Santa Monica',
      addressRegion: 'CA',
      postalCode: '90405',
      addressCountry: 'US'
    }
  },
  organizer: {
    '@type': 'Person',
    name: 'Jane Smith'
  }
}

const enforcement1 = enforcePrice(eventNoPrice)
if (enforcement1.success) {
  console.error('❌ Should reject event without price')
  process.exit(1)
}
console.log('✅ Correctly rejects event without price')
console.log(`   Error: ${enforcement1.error}`)
console.log(`   Message: ${enforcement1.message}`)

// Test 2: Enrichment - Extract price from input when LLM misses it
console.log('\nTest 2: Extract and enrich price when LLM output lacks it')
const inputWithPrice = 'Open house this Saturday at 123 Main St, Santa Monica. Beautiful 3BR home listed at $1,250,000. Contact Jane Smith.'

// Simulate LLM output without price (as if LLM didn't extract it)
let parsedEventNoPrice = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_test_002',
    category: 'open-houses',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: new Date().toISOString()
  },
  name: 'Open House',
  description: inputWithPrice,
  startDate: new Date(Date.now() + 86400000).toISOString(),
  location: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main St',
      addressLocality: 'Santa Monica',
      addressRegion: 'CA',
      postalCode: '90405',
      addressCountry: 'US'
    }
  },
  organizer: {
    '@type': 'Person',
    name: 'Jane Smith'
  }
}

// Before enrichment, should fail enforcement
const beforeEnrichment = enforcePrice(parsedEventNoPrice)
if (beforeEnrichment.success) {
  console.error('❌ Should fail before enrichment')
  process.exit(1)
}
console.log('✅ Correctly fails enforcement before enrichment')

// Enrich with deterministic extraction
parsedEventNoPrice = enrichPriceFromInput(parsedEventNoPrice, inputWithPrice)

// After enrichment, should pass enforcement
const afterEnrichment = enforcePrice(parsedEventNoPrice)
if (!afterEnrichment.success) {
  console.error('❌ Should pass after enrichment')
  process.exit(1)
}
console.log('✅ Correctly passes enforcement after enrichment')
console.log(`   Enriched listPrice: ${parsedEventNoPrice.flypost.listPrice}`)
console.log(`   Enriched display: ${parsedEventNoPrice.flypost.listPriceDisplay}`)
console.log(`   Derived offers.price: ${parsedEventNoPrice.offers?.price}`)

// Test 3: Enrichment with million notation
console.log('\nTest 3: Extract and enrich price with million notation')
const inputWithMillionPrice = 'Luxury estate open house at 456 Ocean Blvd, Malibu. Priced at $2.5 million with stunning views.'

let parsedEventMillionPrice = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_test_003',
    category: 'open-houses',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: new Date().toISOString()
  },
  name: 'Luxury Estate Open House',
  description: inputWithMillionPrice,
  startDate: new Date(Date.now() + 86400000).toISOString(),
  location: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '456 Ocean Blvd',
      addressLocality: 'Malibu',
      addressRegion: 'CA',
      postalCode: '90265',
      addressCountry: 'US'
    }
  },
  organizer: {
    '@type': 'Person',
    name: 'Bob Jones'
  }
}

parsedEventMillionPrice = enrichPriceFromInput(parsedEventMillionPrice, inputWithMillionPrice)
const millionCheck = enforcePrice(parsedEventMillionPrice)
if (!millionCheck.success) {
  console.error('❌ Should pass with million notation')
  process.exit(1)
}
if (parsedEventMillionPrice.flypost.listPrice !== 2500000) {
  console.error('❌ Million notation not converted correctly')
  console.error(`   Expected: 2500000, Got: ${parsedEventMillionPrice.flypost.listPrice}`)
  process.exit(1)
}
console.log('✅ Million notation enriched correctly')
console.log(`   $2.5 million → ${parsedEventMillionPrice.flypost.listPrice}`)

// Test 4: Carry-forward on update
console.log('\nTest 4: Carry forward price on update when new submission lacks price')

// Existing event with price
const existingEvent = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_existing_001',
    category: 'open-houses',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: new Date(Date.now() - 86400000).toISOString(),
    canonicalKey: 'test-key-123',
    listPrice: 1250000,
    listPriceDisplay: '$1,250,000',
    listPriceCurrency: 'USD',
    priceType: 'LIST_PRICE'
  },
  name: 'Open House - 123 Main St',
  description: 'Beautiful home',
  startDate: new Date(Date.now() + 86400000).toISOString(),
  location: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main St',
      addressLocality: 'Santa Monica',
      addressRegion: 'CA',
      postalCode: '90405',
      addressCountry: 'US'
    }
  },
  organizer: {
    '@type': 'Person',
    name: 'Jane Smith'
  },
  offers: {
    '@type': 'Offer',
    price: 1250000,
    priceCurrency: 'USD'
  }
}

// New event submission without price (update scenario)
let updateEvent = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_update_001', // Will be replaced with existing eventId
    category: 'open-houses',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: new Date().toISOString(),
    canonicalKey: 'test-key-123'
  },
  name: 'Open House - 123 Main St (Updated Times)',
  description: 'Beautiful home - new open house times!',
  startDate: new Date(Date.now() + 172800000).toISOString(), // Different time
  location: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main St',
      addressLocality: 'Santa Monica',
      addressRegion: 'CA',
      postalCode: '90405',
      addressCountry: 'US'
    }
  },
  organizer: {
    '@type': 'Person',
    name: 'Jane Smith'
  }
}

// Before carry-forward, should fail enforcement
const beforeCarryForward = enforcePrice(updateEvent)
if (beforeCarryForward.success) {
  console.error('❌ Should fail before carry-forward')
  process.exit(1)
}
console.log('✅ Update event fails enforcement before carry-forward')

// Apply carry-forward logic
updateEvent = carryForwardPrice(updateEvent, existingEvent)

// After carry-forward, should pass enforcement
const afterCarryForward = enforcePrice(updateEvent)
if (!afterCarryForward.success) {
  console.error('❌ Should pass after carry-forward')
  process.exit(1)
}
console.log('✅ Update event passes enforcement after carry-forward')
console.log(`   Carried forward listPrice: ${updateEvent.flypost.listPrice}`)
console.log(`   Carried forward display: ${updateEvent.flypost.listPriceDisplay}`)
console.log(`   Carried forward offers: ${updateEvent.offers ? 'Yes' : 'No'}`)

if (updateEvent.flypost.listPrice !== 1250000) {
  console.error('❌ Price not carried forward correctly')
  process.exit(1)
}
console.log('✅ Price values match existing event')

// Test 5: Don't overwrite when new event has price
console.log('\nTest 5: Do not carry forward when new event has its own price')

let updateWithPrice = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  flypost: {
    eventId: 'evt_update_002',
    category: 'open-houses',
    realTimeData: true,
    crawlable: true,
    queryable: true,
    submissionTimestamp: new Date().toISOString(),
    canonicalKey: 'test-key-123',
    listPrice: 1350000, // New price
    listPriceDisplay: '$1,350,000',
    listPriceCurrency: 'USD',
    priceType: 'LIST_PRICE'
  },
  name: 'Open House - 123 Main St (Price Reduced!)',
  description: 'Price reduced!',
  startDate: new Date(Date.now() + 172800000).toISOString(),
  location: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main St',
      addressLocality: 'Santa Monica',
      addressRegion: 'CA',
      postalCode: '90405',
      addressCountry: 'US'
    }
  },
  organizer: {
    '@type': 'Person',
    name: 'Jane Smith'
  }
}

const newPriceBefore = updateWithPrice.flypost.listPrice

// Apply carry-forward logic (should not overwrite)
updateWithPrice = carryForwardPrice(updateWithPrice, existingEvent)

if (updateWithPrice.flypost.listPrice !== newPriceBefore) {
  console.error('❌ Should not overwrite when new event has price')
  console.error(`   Expected: ${newPriceBefore}, Got: ${updateWithPrice.flypost.listPrice}`)
  process.exit(1)
}
console.log('✅ Correctly preserves new price when present')
console.log(`   New price preserved: ${updateWithPrice.flypost.listPrice}`)

console.log('\n' + '='.repeat(60))
console.log('✅ All price enforcement tests passed!')
console.log('='.repeat(60))
console.log('\nSummary:')
console.log('- Rejects publish when no price present anywhere')
console.log('- Extracts and enriches price from input text when LLM misses it')
console.log('- Handles million notation correctly')
console.log('- Carries forward existing price on updates without price')
console.log('- Does not overwrite new price when present in update')
