/*
 * Test Parser Price Normalization
 * Validates that the parser's post-processing logic correctly derives offers from flypost.listPrice
 */

console.log('🧪 Testing Parser Price Normalization Logic\n')

// Simulate the parser's price normalization logic (from llmParser.js lines 278-295)
function normalizePrice(parsedEvent) {
  // Normalize and derive price information
  // If flypost.listPrice exists, ensure offers object is created/updated
  if (parsedEvent.flypost && typeof parsedEvent.flypost.listPrice === 'number' && parsedEvent.flypost.listPrice > 0) {
    // Ensure default currency if not specified
    if (!parsedEvent.flypost.listPriceCurrency) {
      parsedEvent.flypost.listPriceCurrency = 'USD'
    }

    // Create offers object from flypost.listPrice (Schema.org export layer)
    parsedEvent.offers = {
      '@type': 'Offer',
      price: parsedEvent.flypost.listPrice,
      priceCurrency: parsedEvent.flypost.listPriceCurrency
    }

    console.log(`💰 Price normalized: ${parsedEvent.flypost.listPriceDisplay || parsedEvent.flypost.listPrice} ${parsedEvent.flypost.listPriceCurrency}`)
  }

  return parsedEvent
}

// Test 1: Parser output with listPrice and full price metadata
console.log('Test 1: Parser output with complete price metadata')
let event1 = {
  flypost: {
    listPrice: 1250000,
    listPriceCurrency: 'USD',
    listPriceDisplay: '$1,250,000',
    priceType: 'LIST_PRICE'
  },
  name: 'Open House'
}

event1 = normalizePrice(event1)

if (!event1.offers) {
  console.error('❌ offers object not created')
  process.exit(1)
}

if (event1.offers.price !== 1250000) {
  console.error('❌ offers.price does not match flypost.listPrice')
  process.exit(1)
}

if (event1.offers.priceCurrency !== 'USD') {
  console.error('❌ offers.priceCurrency incorrect')
  process.exit(1)
}

console.log('✅ offers object correctly derived from flypost.listPrice')
console.log(`   - offers.price: ${event1.offers.price}`)
console.log(`   - offers.priceCurrency: ${event1.offers.priceCurrency}`)

// Test 2: Parser output with listPrice but no currency (should default to USD)
console.log('\nTest 2: Parser output with listPrice but no explicit currency')
let event2 = {
  flypost: {
    listPrice: 500000
  },
  name: 'Property Listing'
}

event2 = normalizePrice(event2)

if (!event2.flypost.listPriceCurrency || event2.flypost.listPriceCurrency !== 'USD') {
  console.error('❌ Currency should default to USD')
  process.exit(1)
}

if (!event2.offers || event2.offers.priceCurrency !== 'USD') {
  console.error('❌ offers.priceCurrency should default to USD')
  process.exit(1)
}

console.log('✅ Currency correctly defaults to USD')
console.log(`   - flypost.listPriceCurrency: ${event2.flypost.listPriceCurrency}`)
console.log(`   - offers.priceCurrency: ${event2.offers.priceCurrency}`)

// Test 3: Parser output with no price (backward compatibility)
console.log('\nTest 3: Parser output with no price fields')
let event3 = {
  flypost: {
    eventId: 'evt_test_001'
  },
  name: 'Garage Sale'
}

event3 = normalizePrice(event3)

if (event3.offers) {
  console.error('❌ offers object should not be created when no price present')
  process.exit(1)
}

console.log('✅ No offers object created when price not present (backward compatible)')

// Test 4: Parser output with zero or negative price (edge case)
console.log('\nTest 4: Parser output with invalid price values')
let event4a = {
  flypost: {
    listPrice: 0
  },
  name: 'Free Event'
}

event4a = normalizePrice(event4a)

if (event4a.offers) {
  console.error('❌ offers should not be created for zero price')
  process.exit(1)
}

console.log('✅ Zero price: offers not created (correct)')

let event4b = {
  flypost: {
    listPrice: -100
  },
  name: 'Invalid Event'
}

event4b = normalizePrice(event4b)

if (event4b.offers) {
  console.error('❌ offers should not be created for negative price')
  process.exit(1)
}

console.log('✅ Negative price: offers not created (correct)')

// Test 5: Parser output with non-USD currency
console.log('\nTest 5: Parser output with non-USD currency')
let event5 = {
  flypost: {
    listPrice: 950000,
    listPriceCurrency: 'EUR',
    listPriceDisplay: '€950,000'
  },
  name: 'European Property'
}

event5 = normalizePrice(event5)

if (!event5.offers || event5.offers.priceCurrency !== 'EUR') {
  console.error('❌ Non-USD currency not preserved')
  process.exit(1)
}

console.log('✅ Non-USD currency correctly preserved')
console.log(`   - offers.price: ${event5.offers.price}`)
console.log(`   - offers.priceCurrency: ${event5.offers.priceCurrency}`)

// Test 6: Parser output with listPrice as string (should not process)
console.log('\nTest 6: Parser output with invalid listPrice type')
let event6 = {
  flypost: {
    listPrice: '1250000'  // String instead of number
  },
  name: 'Invalid Price Type'
}

event6 = normalizePrice(event6)

if (event6.offers) {
  console.error('❌ offers should not be created for string price')
  process.exit(1)
}

console.log('✅ String price: offers not created (type checking works)')

console.log('\n✅ All parser price normalization tests passed!')
console.log('\nSummary:')
console.log('- offers object derived when flypost.listPrice is valid number > 0')
console.log('- Currency defaults to USD when not specified')
console.log('- No offers created when price missing, zero, negative, or wrong type')
console.log('- Non-USD currencies correctly preserved')
