/*
 * Test URL Extraction Utility
 * Validates deterministic URL extraction from natural language input
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { extractFirstUrl } from './src/utils/urlExtractor.js'

test('URL Extraction - Zillow URL from example input', () => {
  const input = `Open house

Tue, Jan 6
11:00 AM - 2:00 PM

810 Franklin St, Santa Monica, CA 90403

https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/`

  const result = extractFirstUrl(input)
  assert.strictEqual(
    result,
    'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    'Should extract Zillow URL'
  )
})

test('URL Extraction - First URL when multiple present', () => {
  const input = 'Check https://example.com or https://other.com'
  const result = extractFirstUrl(input)
  assert.strictEqual(result, 'https://example.com', 'Should extract first URL')
})

test('URL Extraction - No URL in text', () => {
  const input = 'Open house this Saturday at 123 Main St, no URL here'
  const result = extractFirstUrl(input)
  assert.strictEqual(result, undefined, 'Should return undefined when no URL')
})

test('URL Extraction - http URL should not be extracted', () => {
  const input = 'Visit http://example.com for details'
  const result = extractFirstUrl(input)
  assert.strictEqual(result, undefined, 'Should not extract http:// URLs')
})

test('URL Extraction - URL with whitespace', () => {
  const input = 'URL:  https://example.com/path  more text'
  const result = extractFirstUrl(input)
  assert.strictEqual(
    result,
    'https://example.com/path',
    'Should trim whitespace'
  )
})

test('URL Extraction - Very long URL capped at 1000 chars', () => {
  const longPath = 'a'.repeat(2000)
  const input = `Check https://example.com/${longPath}`
  const result = extractFirstUrl(input)
  assert.ok(result, 'Should extract URL')
  assert.strictEqual(result.length, 1000, 'Should cap at 1000 characters')
  assert.ok(result.startsWith('https://example.com/'), 'Should preserve prefix')
})

test('URL Extraction - Invalid input types', () => {
  assert.strictEqual(extractFirstUrl(null), undefined, 'null returns undefined')
  assert.strictEqual(
    extractFirstUrl(undefined),
    undefined,
    'undefined returns undefined'
  )
  assert.strictEqual(extractFirstUrl(123), undefined, 'number returns undefined')
  assert.strictEqual(extractFirstUrl({}), undefined, 'object returns undefined')
})

test('URL Extraction - Empty string', () => {
  assert.strictEqual(extractFirstUrl(''), undefined, 'empty string returns undefined')
})

test('URL Extraction - Just https://', () => {
  const input = 'Just https:// without rest'
  const result = extractFirstUrl(input)
  assert.strictEqual(result, undefined, 'Incomplete URL returns undefined')
})

test('URL Extraction - Real estate URL with query params', () => {
  const input =
    'Open house at https://www.redfin.com/CA/Santa-Monica/810-Franklin-St-90403/home/6850571?utm_source=share'
  const result = extractFirstUrl(input)
  assert.ok(
    result.startsWith('https://www.redfin.com/CA/Santa-Monica/'),
    'Should extract Redfin URL with query params'
  )
})

test('URL Extraction - Trailing punctuation removed', () => {
  const input1 = 'Check out https://example.com/listing.'
  const result1 = extractFirstUrl(input1)
  assert.strictEqual(
    result1,
    'https://example.com/listing',
    'Should remove trailing period'
  )

  const input2 = 'Visit https://example.com/listing, for details'
  const result2 = extractFirstUrl(input2)
  assert.strictEqual(
    result2,
    'https://example.com/listing',
    'Should remove trailing comma'
  )

  const input3 = 'See https://example.com/listing)'
  const result3 = extractFirstUrl(input3)
  assert.strictEqual(
    result3,
    'https://example.com/listing',
    'Should remove trailing parenthesis'
  )
})

console.log('✅ All URL extraction tests passed')
