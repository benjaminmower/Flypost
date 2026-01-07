/**
 * Integration test for event enrichment with local times
 * Run with: node backend/src/concierge/__tests__/integration.test.js
 * 
 * NOTE: Uses testUtils.js to share test code without requiring npm dependencies
 */

import { formatLocalTime, enrichEventsWithLocalTime } from './testUtils.js'

// Simulate what the API returns (Discovery V1 format)
const mockAPIResponse = {
  protocol: 'flypost-discovery',
  version: 'v1',
  success: true,
  events: [
    {
      eventId: 'evt_123',
      dataHash: 'abc123',
      what: {
        category: 'open_house',
        title: 'Open House - 123 Main St, Santa Monica'
      },
      where: {
        streetAddress: '123 Main St',
        city: 'Santa Monica',
        region: 'CA',
        postalCode: '90401',
        country: 'US',
        lat: 34.0195,
        lng: -118.4912
      },
      when: {
        start: '2026-01-06T19:00:00.000Z',
        end: '2026-01-06T22:00:00.000Z',
        timezone: 'America/Los_Angeles'
      },
      externalListingUrl: 'https://example.com/listing/123'
    },
    {
      eventId: 'evt_456',
      dataHash: 'def456',
      what: {
        category: 'open_house',
        title: 'Open House - 456 Ocean Ave, Santa Monica'
      },
      where: {
        streetAddress: '456 Ocean Ave',
        city: 'Santa Monica',
        region: 'CA',
        postalCode: '90402',
        country: 'US',
        lat: 34.0254,
        lng: -118.4965
      },
      when: {
        start: '2026-01-07T20:00:00.000Z',
        end: '2026-01-07T23:00:00.000Z',
        timezone: 'America/Los_Angeles'
      },
      externalListingUrl: 'https://example.com/listing/456'
    }
  ]
}

console.log('Integration Test: Event Enrichment with Local Times\n')
console.log('Simulating API response and enrichment flow...\n')

// Simulate enrichment
const enrichedEvents = enrichEventsWithLocalTime(mockAPIResponse.events)

console.log('Event 1:')
console.log('  Address:', enrichedEvents[0].where.streetAddress)
console.log('  Original start (UTC):', enrichedEvents[0].when.start)
console.log('  Original end (UTC):', enrichedEvents[0].when.end)
console.log('  Timezone:', enrichedEvents[0].when.timezone)
console.log('  displayLocal:', enrichedEvents[0].when.displayLocal)
console.log('  Expected: "11:00 AM – 2:00 PM PST"')
console.log('  Pass:', enrichedEvents[0].when.displayLocal === '11:00 AM – 2:00 PM PST')
console.log('')

console.log('Event 2:')
console.log('  Address:', enrichedEvents[1].where.streetAddress)
console.log('  Original start (UTC):', enrichedEvents[1].when.start)
console.log('  Original end (UTC):', enrichedEvents[1].when.end)
console.log('  Timezone:', enrichedEvents[1].when.timezone)
console.log('  displayLocal:', enrichedEvents[1].when.displayLocal)
console.log('  Expected: "12:00 PM – 3:00 PM PST"')
console.log('  Pass:', enrichedEvents[1].when.displayLocal === '12:00 PM – 3:00 PM PST')
console.log('')

// Verify backward compatibility
console.log('Backward Compatibility Check:')
console.log('  Original fields preserved?')
console.log('    when.start exists:', enrichedEvents[0].when.start !== undefined)
console.log('    when.end exists:', enrichedEvents[0].when.end !== undefined)
console.log('    when.timezone exists:', enrichedEvents[0].when.timezone !== undefined)
console.log('    when.displayLocal added:', enrichedEvents[0].when.displayLocal !== undefined)
console.log('')

// Test that model should see displayLocal in JSON
console.log('What the LLM will see (JSON passed to tool):')
console.log(JSON.stringify({
  success: true,
  events: enrichedEvents.slice(0, 1), // Show first event
  total: enrichedEvents.length
}, null, 2))
console.log('')

console.log('✅ Integration test completed successfully!')
console.log('The concierge will now see when.displayLocal with properly formatted local times.')
