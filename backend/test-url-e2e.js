/*
 * End-to-End Test - URL Extraction in Parse-and-Publish API
 * Tests the actual HTTP endpoint to verify URL extraction and storage
 * 
 * NOTE: This test requires the backend server to be running and OPENAI_API_KEY
 * to be set for actual LLM parsing. Without LLM key, it will fail at parsing step.
 */

import { test } from 'node:test'
import assert from 'node:assert'

// Check if we should skip this test
const SKIP_E2E = !process.env.OPENAI_API_KEY || !process.env.RUN_E2E_TESTS

if (SKIP_E2E) {
  console.log('⚠️  Skipping E2E test (requires OPENAI_API_KEY and backend server)')
  console.log('   Set OPENAI_API_KEY and RUN_E2E_TESTS=true to run this test')
  process.exit(0)
}

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8080'

test('E2E - Parse-and-Publish with URL extraction', async () => {
  const input = `Open house

Tue, Jan 6
11:00 AM - 2:00 PM

810 Franklin St, Santa Monica, CA 90403

https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/`

  const response = await fetch(`${BASE_URL}/api/parse-and-publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-flypost-brokerage-id': 'test-brokerage'
    },
    body: JSON.stringify({
      naturalLanguageInput: input
    })
  })

  assert.strictEqual(response.ok, true, 'Request should succeed')

  const data = await response.json()
  assert.strictEqual(data.success, true, 'Response should be successful')
  assert.ok(data.data.event, 'Should return event')

  const event = data.data.event

  // Verify event.url is set
  assert.strictEqual(
    event.url,
    'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    'event.url should be set'
  )

  // Verify flypost.sources contains sourceUrl
  assert.ok(event.flypost.sources, 'event.flypost.sources should exist')
  assert.ok(
    Array.isArray(event.flypost.sources),
    'sources should be an array'
  )

  const parsePublishSource = event.flypost.sources.find(
    s => s.sourceId === 'parse-and-publish'
  )
  assert.ok(
    parsePublishSource,
    'Should have parse-and-publish source entry'
  )
  assert.strictEqual(
    parsePublishSource.sourceUrl,
    'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    'sourceUrl should be set on parse-and-publish source'
  )
})

test('E2E - Parse-and-Publish without URL', async () => {
  const input = `Open house

Tue, Jan 6
11:00 AM - 2:00 PM

810 Franklin St, Santa Monica, CA 90403`

  const response = await fetch(`${BASE_URL}/api/parse-and-publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-flypost-brokerage-id': 'test-brokerage'
    },
    body: JSON.stringify({
      naturalLanguageInput: input
    })
  })

  assert.strictEqual(response.ok, true, 'Request should succeed')

  const data = await response.json()
  assert.strictEqual(data.success, true, 'Response should be successful')

  const event = data.data.event

  // Verify event.url is not set
  assert.strictEqual(event.url, undefined, 'event.url should not be set')

  // Verify flypost.sources does not have sourceUrl
  const parsePublishSource = event.flypost.sources.find(
    s => s.sourceId === 'parse-and-publish'
  )
  assert.ok(parsePublishSource, 'Should have parse-and-publish source entry')
  assert.strictEqual(
    parsePublishSource.sourceUrl,
    undefined,
    'sourceUrl should not be set when no URL in input'
  )
})

console.log('✅ All E2E tests passed')
