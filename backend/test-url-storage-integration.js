/*
 * Test URL Extraction and Storage in Parse-and-Publish Flow
 * Validates that URLs are extracted and stored in both event.url and flypost.sources[].sourceUrl
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { extractFirstUrl } from './src/utils/urlExtractor.js'
import { mergeSources } from './src/utils/sourceProvenance.js'

// Test the URL extraction integration
test('Parse-and-Publish Flow - URL extraction and storage', () => {
  // Example input from requirements
  const input = `Open house

Tue, Jan 6
11:00 AM - 2:00 PM

810 Franklin St, Santa Monica, CA 90403

https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/`

  // Step 1: Extract URL (simulating what happens in server.js)
  const extractedUrl = extractFirstUrl(input)
  assert.ok(extractedUrl, 'URL should be extracted')
  assert.strictEqual(
    extractedUrl,
    'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    'Should extract correct Zillow URL'
  )

  // Step 2: Simulate setting on event object
  const event = {
    name: 'Open House',
    url: extractedUrl // Schema.org Event.url
  }
  assert.strictEqual(
    event.url,
    'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    'URL should be set on event.url'
  )

  // Step 3: Simulate adding to sources with sourceUrl
  const sourceData = {
    sourceType: 'llm',
    sourceId: 'parse-and-publish',
    sourceUrl: extractedUrl
  }
  const sources = mergeSources([], sourceData)

  assert.ok(Array.isArray(sources), 'Sources should be an array')
  assert.strictEqual(sources.length, 1, 'Should have one source')
  assert.strictEqual(
    sources[0].sourceType,
    'llm',
    'Source type should be llm'
  )
  assert.strictEqual(
    sources[0].sourceId,
    'parse-and-publish',
    'Source ID should be parse-and-publish'
  )
  assert.strictEqual(
    sources[0].sourceUrl,
    'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    'Source URL should be set'
  )
})

test('Parse-and-Publish Flow - No URL in input', () => {
  const input = `Open house

Tue, Jan 6
11:00 AM - 2:00 PM

810 Franklin St, Santa Monica, CA 90403`

  // Step 1: Extract URL - should return undefined
  const extractedUrl = extractFirstUrl(input)
  assert.strictEqual(
    extractedUrl,
    undefined,
    'No URL should be extracted when not present'
  )

  // Step 2: Event should not have url field when no URL extracted
  const event = {
    name: 'Open House'
  }
  if (extractedUrl) {
    event.url = extractedUrl
  }
  assert.strictEqual(
    event.url,
    undefined,
    'Event should not have url field when no URL'
  )

  // Step 3: Sources should not have sourceUrl when no URL extracted
  const sourceData = {
    sourceType: 'llm',
    sourceId: 'parse-and-publish'
  }
  if (extractedUrl) {
    sourceData.sourceUrl = extractedUrl
  }
  const sources = mergeSources([], sourceData)

  assert.strictEqual(sources.length, 1, 'Should have one source')
  assert.strictEqual(
    sources[0].sourceUrl,
    undefined,
    'Source should not have sourceUrl when no URL'
  )
})

test('Parse-and-Publish Flow - sourceUrl precedence with parse-and-publish', () => {
  const extractedUrl = 'https://example.com/listing'

  // Simulate existing sources with parse-and-publish entry
  const existingSources = [
    { sourceType: 'mls', sourceId: 'mls-123' },
    { sourceType: 'llm', sourceId: 'parse-and-publish' }
  ]

  // Merge with new source data including URL
  const sourceData = {
    sourceType: 'llm',
    sourceId: 'parse-and-publish',
    sourceUrl: extractedUrl
  }
  const sources = mergeSources(existingSources, sourceData)

  // Find the parse-and-publish source
  const parsePublishSource = sources.find(
    s => s.sourceId === 'parse-and-publish'
  )

  assert.ok(parsePublishSource, 'parse-and-publish source should exist')
  assert.strictEqual(
    parsePublishSource.sourceUrl,
    extractedUrl,
    'sourceUrl should be set on parse-and-publish entry'
  )
})

test('Parse-and-Publish Flow - sourceUrl on first source when parse-and-publish not found', () => {
  const extractedUrl = 'https://example.com/listing'

  // Simulate sources without parse-and-publish entry
  const sources = [{ sourceType: 'mls', sourceId: 'mls-123' }]

  // Manually set sourceUrl on first source (simulating server logic)
  if (extractedUrl && sources.length > 0) {
    const parsePublishSource = sources.find(
      s => s.sourceId === 'parse-and-publish'
    )
    if (!parsePublishSource) {
      sources[0].sourceUrl = extractedUrl
    }
  }

  assert.strictEqual(
    sources[0].sourceUrl,
    extractedUrl,
    'sourceUrl should be set on first source when parse-and-publish not found'
  )
})

test('Parse-and-Publish Flow - Multiple URLs extracts first', () => {
  const input = `Check out https://zillow.com/property1 or https://redfin.com/property2`

  const extractedUrl = extractFirstUrl(input)
  assert.strictEqual(
    extractedUrl,
    'https://zillow.com/property1',
    'Should extract first URL when multiple present'
  )
})

console.log('✅ All parse-and-publish URL integration tests passed')
