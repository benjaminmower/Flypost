/*
 * Test Discovery Mapper URL Handling
 * Validates that event.url is correctly mapped to externalListingUrl in discovery responses
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { toDiscoveryEventV1 } from './src/utils/discoveryMapper.js'

test('Discovery Mapper - event.url maps to externalListingUrl', () => {
  const event = {
    '@type': 'Event',
    name: 'Test Open House',
    startDate: '2026-01-06T11:00:00-08:00',
    endDate: '2026-01-06T14:00:00-08:00',
    url: 'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    location: {
      '@type': 'Place',
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0195,
        longitude: -118.4912
      },
      address: {
        '@type': 'PostalAddress',
        streetAddress: '810 Franklin St',
        addressLocality: 'Santa Monica',
        addressRegion: 'CA',
        postalCode: '90403'
      }
    },
    flypost: {
      eventId: 'evt_test_123',
      category: 'open-houses'
    },
    hash: {
      value: 'abc123def456'
    }
  }

  const discoveryEvent = toDiscoveryEventV1(event)

  assert.ok(discoveryEvent, 'Should map to discovery event')
  assert.strictEqual(
    discoveryEvent.externalListingUrl,
    'https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/',
    'event.url should map to externalListingUrl'
  )
  // Verify that 'url' is NOT a direct field in discovery event
  assert.strictEqual(
    discoveryEvent.url,
    undefined,
    'url should not be a direct field in discovery response'
  )
})

test('Discovery Mapper - no URL results in null externalListingUrl', () => {
  const event = {
    '@type': 'Event',
    name: 'Test Open House',
    startDate: '2026-01-06T11:00:00-08:00',
    endDate: '2026-01-06T14:00:00-08:00',
    // No url field
    location: {
      '@type': 'Place',
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    flypost: {
      eventId: 'evt_test_456',
      category: 'open-houses'
    },
    hash: {
      value: 'xyz789'
    }
  }

  const discoveryEvent = toDiscoveryEventV1(event)

  assert.ok(discoveryEvent, 'Should map to discovery event')
  assert.strictEqual(
    discoveryEvent.externalListingUrl,
    null,
    'externalListingUrl should be null when no URL'
  )
})

test('Discovery Mapper - sourceUrl in flypost.sources maps to externalListingUrl', () => {
  const event = {
    '@type': 'Event',
    name: 'Test Open House',
    startDate: '2026-01-06T11:00:00-08:00',
    endDate: '2026-01-06T14:00:00-08:00',
    location: {
      '@type': 'Place',
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    flypost: {
      eventId: 'evt_test_789',
      category: 'open-houses',
      sourceUrl: 'https://example.com/listing'
    },
    hash: {
      value: 'def456'
    }
  }

  const discoveryEvent = toDiscoveryEventV1(event)

  assert.ok(discoveryEvent, 'Should map to discovery event')
  assert.strictEqual(
    discoveryEvent.externalListingUrl,
    'https://example.com/listing',
    'flypost.sourceUrl should map to externalListingUrl as fallback'
  )
})

test('Discovery Mapper - safe heroImageUrl maps to imageUrl', () => {
  const event = {
    '@type': 'Event',
    name: 'Test Garage Sale',
    startDate: '2026-01-06T11:00:00-08:00',
    endDate: '2026-01-06T14:00:00-08:00',
    location: {
      '@type': 'Place',
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    flypost: {
      eventId: 'evt_test_image',
      category: 'garage-sales',
      heroImageUrl: 'https://firebasestorage.googleapis.com/v0/b/project/o/flyers%2Ftest.jpg?alt=media'
    },
    hash: {
      value: 'abc123def456'
    }
  }

  const discoveryEvent = toDiscoveryEventV1(event)

  assert.ok(discoveryEvent, 'Should map to discovery event')
  assert.strictEqual(
    discoveryEvent.imageUrl,
    'https://firebasestorage.googleapis.com/v0/b/project/o/flyers%2Ftest.jpg?alt=media',
    'valid HTTPS heroImageUrl should map to imageUrl'
  )
})

test('Discovery Mapper - non-HTTPS heroImageUrl is omitted', () => {
  const event = {
    '@type': 'Event',
    name: 'Test Garage Sale',
    startDate: '2026-01-06T11:00:00-08:00',
    endDate: '2026-01-06T14:00:00-08:00',
    location: {
      '@type': 'Place',
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.0195,
        longitude: -118.4912
      }
    },
    flypost: {
      eventId: 'evt_test_bad_image',
      category: 'garage-sales',
      heroImageUrl: 'javascript:alert(1)'
    },
    hash: {
      value: 'abc123def456'
    }
  }

  const discoveryEvent = toDiscoveryEventV1(event)

  assert.ok(discoveryEvent, 'Should map to discovery event')
  assert.strictEqual(discoveryEvent.imageUrl, undefined, 'unsafe image URL should be omitted')
})

console.log('✅ All discovery mapper URL tests passed')
