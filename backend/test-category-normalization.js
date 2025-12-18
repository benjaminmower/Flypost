#!/usr/bin/env node
/**
 * Test script for category normalization
 * Validates that category values are normalized to snake_case singular enum values
 */

import { normalizeCategory } from './src/utils/discoveryMapper.js'

console.log('🧪 Testing Category Normalization\n')
console.log('=================================\n')

/**
 * Test cases for category normalization
 */
const testCases = [
  // Open house variants
  { input: 'open-houses', expected: 'open_house', description: 'kebab-case plural to snake_case singular' },
  { input: 'open-house', expected: 'open_house', description: 'kebab-case singular' },
  { input: 'open house', expected: 'open_house', description: 'space-separated' },
  { input: 'open houses', expected: 'open_house', description: 'space-separated plural' },
  { input: 'openhouse', expected: 'open_house', description: 'no separator' },
  { input: 'openhouses', expected: 'open_house', description: 'no separator plural' },
  { input: 'open_house', expected: 'open_house', description: 'already normalized' },
  { input: 'OPEN-HOUSES', expected: 'open_house', description: 'uppercase' },
  
  // Garage sale variants
  { input: 'garage-sales', expected: 'garage_sale', description: 'kebab-case plural' },
  { input: 'garage-sale', expected: 'garage_sale', description: 'kebab-case singular' },
  { input: 'garage sale', expected: 'garage_sale', description: 'space-separated' },
  { input: 'garage sales', expected: 'garage_sale', description: 'space-separated plural' },
  { input: 'garage_sale', expected: 'garage_sale', description: 'already normalized' },
  
  // Yard sale variants
  { input: 'yard-sales', expected: 'yard_sale', description: 'kebab-case plural' },
  { input: 'yard-sale', expected: 'yard_sale', description: 'kebab-case singular' },
  { input: 'yard sale', expected: 'yard_sale', description: 'space-separated' },
  
  // Estate sale variants
  { input: 'estate-sales', expected: 'estate_sale', description: 'kebab-case plural' },
  { input: 'estate-sale', expected: 'estate_sale', description: 'kebab-case singular' },
  { input: 'estate sale', expected: 'estate_sale', description: 'space-separated' },
  
  // Moving sale variants
  { input: 'moving-sales', expected: 'moving_sale', description: 'kebab-case plural' },
  { input: 'moving-sale', expected: 'moving_sale', description: 'kebab-case singular' },
  { input: 'moving sale', expected: 'moving_sale', description: 'space-separated' },
  
  // Other
  { input: 'other', expected: 'other', description: 'other category' },
  { input: 'unknown-category', expected: 'other', description: 'unknown defaults to other' },
  { input: '', expected: 'other', description: 'empty string defaults to other' },
  { input: null, expected: 'other', description: 'null defaults to other' },
  { input: undefined, expected: 'other', description: 'undefined defaults to other' }
]

let passed = 0
let failed = 0

console.log('Running normalization tests:\n')

for (const testCase of testCases) {
  const result = normalizeCategory(testCase.input)
  const inputDisplay = testCase.input === null ? 'null' : 
                       testCase.input === undefined ? 'undefined' :
                       `"${testCase.input}"`
  
  if (result === testCase.expected) {
    console.log(`✅ ${inputDisplay} → "${result}" (${testCase.description})`)
    passed++
  } else {
    console.log(`❌ ${inputDisplay} → "${result}" (expected "${testCase.expected}") - ${testCase.description}`)
    failed++
  }
}

console.log(`\n=================================`)
console.log(`Summary: ${passed} passed, ${failed} failed out of ${testCases.length} tests`)

if (failed > 0) {
  process.exit(1)
}

console.log('\n✅ All category normalization tests passed!')
