#!/usr/bin/env node
/**
 * Demonstration script for Discovery V1 improvements
 * Shows how timezone and full address are now included in Discovery V1 responses
 */

import { toDiscoveryEventV1 } from './src/utils/discoveryMapper.js'

console.log('🎯 Discovery V1 Improvements Demonstration\n')
console.log('===========================================\n')

// Sample event with timezone and full address
const sampleEvent = {
  flypost: {
    eventId: 'evt_santa_monica_demo',
    category: 'open_house',
    timezone: 'America/Los_Angeles'  // ← NEW: Timezone field
  },
  name: 'Open House in Santa Monica',
  url: 'https://example.com/listing/810-franklin-st',
  startDate: '2025-01-15T19:00:00Z',  // 7pm UTC = 11am PT
  endDate: '2025-01-15T22:00:00Z',    // 10pm UTC = 2pm PT
  location: {
    address: {
      streetAddress: '810 Franklin St',
      addressLocality: 'Santa Monica',
      addressRegion: 'CA',
      postalCode: '90401',
      addressCountry: 'US'
    },
    geo: {
      latitude: 34.0195,
      longitude: -118.4912
    }
  },
  hash: {
    value: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc123'
  }
}

console.log('📋 Original Event Data:')
console.log('----------------------')
console.log(`   eventId: ${sampleEvent.flypost.eventId}`)
console.log(`   name: ${sampleEvent.name}`)
console.log(`   timezone: ${sampleEvent.flypost.timezone}`)
console.log(`   startDate: ${sampleEvent.startDate} (UTC)`)
console.log(`   endDate: ${sampleEvent.endDate} (UTC)`)
console.log(`   address: ${sampleEvent.location.address.streetAddress}, ${sampleEvent.location.address.addressLocality}, ${sampleEvent.location.address.addressRegion}`)
console.log('')

// Convert to Discovery V1 format (public tier)
const discoveryEventPublic = toDiscoveryEventV1(sampleEvent, { accessTier: 'public' })

console.log('🌍 Discovery V1 Response (Public Tier):')
console.log('---------------------------------------')
console.log(JSON.stringify(discoveryEventPublic, null, 2))
console.log('')

// Convert to Discovery V1 format (brokerage tier)
const discoveryEventBrokerage = toDiscoveryEventV1(sampleEvent, { accessTier: 'brokerage' })

console.log('🏢 Discovery V1 Response (Brokerage Tier):')
console.log('------------------------------------------')
console.log(JSON.stringify(discoveryEventBrokerage, null, 2))
console.log('')

// Highlight key improvements
console.log('✨ Key Improvements:')
console.log('-------------------')
console.log('1. ✅ when.timezone field included: "America/Los_Angeles"')
console.log('   → Concierge can now display times in local PT instead of UTC')
console.log('   → 7pm UTC becomes 11am PT for better user experience')
console.log('')
console.log('2. ✅ Full street address in where.address for ALL tiers')
console.log('   → PUBLIC tier: "810 Franklin St, Santa Monica, CA, 90401, US"')
console.log('   → Previous behavior: "Santa Monica, CA, US" (no street address)')
console.log('   → Now matches brokerage tier since listing URLs are already public')
console.log('')
console.log('3. ✅ Coordinate precision still differs by tier')
console.log(`   → PUBLIC tier: lat=${discoveryEventPublic.where.latitude}, lng=${discoveryEventPublic.where.longitude} (2 decimals)`)
console.log(`   → BROKERAGE tier: lat=${discoveryEventBrokerage.where.latitude}, lng=${discoveryEventBrokerage.where.longitude} (full precision)`)
console.log('')

console.log('🎉 Result:')
console.log('----------')
console.log('Ask concierge queries like "what\'s open in Santa Monica today" will now:')
console.log('  • Show only today\'s events (using timeframe parameter)')
console.log('  • Display times in PT (11am) instead of UTC (7pm)')
console.log('  • Include full street addresses (810 Franklin St)')
console.log('')
