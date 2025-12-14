/*
 * Test Deterministic Price Extraction Utility
 * Validates the server-side price extraction from natural language
 */

import { extractPriceFromText, hasValidListPrice } from './src/utils/priceExtractor.js'

console.log('🧪 Testing Price Extraction Utility\n')

// Test 1: Extract from standard comma format
console.log('Test 1: Standard comma format ($1,250,000)')
const price1 = extractPriceFromText('Open house at 123 Main St, listed at $1,250,000')
if (!price1 || price1.listPrice !== 1250000) {
  console.error('❌ Failed to extract $1,250,000')
  console.error('   Got:', price1)
  process.exit(1)
}
if (price1.listPriceDisplay !== '$1,250,000') {
  console.error('❌ Display string incorrect')
  console.error('   Expected: $1,250,000, Got:', price1.listPriceDisplay)
  process.exit(1)
}
console.log('✅ Extracted: $1,250,000 → 1250000')
console.log(`   Display: "${price1.listPriceDisplay}"`)

// Test 2: Extract from format without commas
console.log('\nTest 2: Format without commas ($11975000)')
const price2 = extractPriceFromText('Beautiful property at $11975000 with views')
if (!price2 || price2.listPrice !== 11975000) {
  console.error('❌ Failed to extract $11975000')
  console.error('   Got:', price2)
  process.exit(1)
}
console.log('✅ Extracted: $11975000 → 11975000')

// Test 3: Extract from million notation (decimal)
console.log('\nTest 3: Million notation with decimal ($2.5 million)')
const price3 = extractPriceFromText('Listed at $2.5 million')
if (!price3 || price3.listPrice !== 2500000) {
  console.error('❌ Failed to extract $2.5 million')
  console.error('   Expected: 2500000, Got:', price3)
  process.exit(1)
}
console.log('✅ Extracted: $2.5 million → 2500000')

// Test 4: Extract from million notation (whole number)
console.log('\nTest 4: Million notation whole number ($12 million)')
const price4 = extractPriceFromText('Estate priced at $12 million')
if (!price4 || price4.listPrice !== 12000000) {
  console.error('❌ Failed to extract $12 million')
  console.error('   Expected: 12000000, Got:', price4)
  process.exit(1)
}
console.log('✅ Extracted: $12 million → 12000000')

// Test 5: Million notation variations (mil, M)
console.log('\nTest 5: Million notation variations')
const price5a = extractPriceFromText('Price: $3.2 mil')
if (!price5a || price5a.listPrice !== 3200000) {
  console.error('❌ Failed to extract $3.2 mil')
  process.exit(1)
}
console.log('✅ Extracted: $3.2 mil → 3200000')

const price5b = extractPriceFromText('Asking $1.8M for property')
if (!price5b || price5b.listPrice !== 1800000) {
  console.error('❌ Failed to extract $1.8M')
  process.exit(1)
}
console.log('✅ Extracted: $1.8M → 1800000')

// Test 6: No price in text
console.log('\nTest 6: Text without price')
const price6 = extractPriceFromText('Open house this Saturday at 123 Main St')
if (price6 !== null) {
  console.error('❌ Should return null when no price found')
  console.error('   Got:', price6)
  process.exit(1)
}
console.log('✅ Correctly returns null when no price found')

// Test 7: Invalid input types
console.log('\nTest 7: Invalid input types')
const price7a = extractPriceFromText(null)
const price7b = extractPriceFromText(undefined)
const price7c = extractPriceFromText(123)
if (price7a !== null || price7b !== null || price7c !== null) {
  console.error('❌ Should return null for invalid input types')
  process.exit(1)
}
console.log('✅ Handles invalid input types correctly')

// Test 8: Edge cases
console.log('\nTest 8: Edge cases')
const price8a = extractPriceFromText('Price $0')
if (price8a !== null) {
  console.error('❌ Should reject zero price')
  process.exit(1)
}
console.log('✅ Rejects zero price')

const price8b = extractPriceFromText('Only $500 for this item')
if (!price8b || price8b.listPrice !== 500) {
  console.error('❌ Should extract small prices')
  process.exit(1)
}
console.log('✅ Extracts small prices correctly')

// Test 9: Price with spaces
console.log('\nTest 9: Price with spaces')
const price9 = extractPriceFromText('Listed at $ 1,250,000')
if (!price9 || price9.listPrice !== 1250000) {
  console.error('❌ Should handle spaces after $')
  console.error('   Got:', price9)
  process.exit(1)
}
console.log('✅ Handles spaces after $ sign')

// Test 10: Multiple prices (should extract first)
console.log('\nTest 10: Multiple prices in text')
const price10 = extractPriceFromText('Price range $500,000 to $750,000')
if (!price10 || price10.listPrice !== 500000) {
  console.error('❌ Should extract first price')
  console.error('   Got:', price10)
  process.exit(1)
}
console.log('✅ Extracts first price when multiple present')

// Test 11: hasValidListPrice helper
console.log('\nTest 11: hasValidListPrice helper function')
const event11a = {
  flypost: {
    listPrice: 1250000
  }
}
if (!hasValidListPrice(event11a)) {
  console.error('❌ Should return true for valid price')
  process.exit(1)
}
console.log('✅ Returns true for valid price')

const event11b = {
  flypost: {
    listPrice: 0
  }
}
if (hasValidListPrice(event11b)) {
  console.error('❌ Should return false for zero price')
  process.exit(1)
}
console.log('✅ Returns false for zero price')

const event11c = {
  flypost: {}
}
if (hasValidListPrice(event11c)) {
  console.error('❌ Should return false when no price')
  process.exit(1)
}
console.log('✅ Returns false when no price field')

const event11d = {
  flypost: {
    listPrice: '1250000'
  }
}
if (hasValidListPrice(event11d)) {
  console.error('❌ Should return false for string price')
  process.exit(1)
}
console.log('✅ Returns false for non-numeric price')

console.log('\n' + '='.repeat(60))
console.log('✅ All price extraction utility tests passed!')
console.log('='.repeat(60))
console.log('\nSummary:')
console.log('- Extracts prices from various formats ($X,XXX,XXX, $XXXXXX)')
console.log('- Handles million notation ($X.X million/mil/M)')
console.log('- Returns structured price object with display string')
console.log('- Correctly rejects invalid inputs and zero prices')
console.log('- Helper function validates event has valid price')
