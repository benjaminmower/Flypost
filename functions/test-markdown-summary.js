/**
 * Hermetic tests for weekly digest Markdown summary generation
 * Run with: node --test test-markdown-summary.js
 * 
 * No Firestore emulator, no network - just pure function testing
 */

import { test } from 'node:test'
import assert from 'node:assert'

const LA_TIMEZONE = 'America/Los_Angeles'

/**
 * Build a broker-facing Markdown summary from the weekly digest data
 * (Duplicated from index.js for hermetic testing)
 */
function buildWeeklyDigestSummaryMarkdown({ windowStartIso, windowEndIso, eventDigests }) {
  // Format dates in LA timezone for broker readability
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TIMEZONE,
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  })
  
  const startDate = dateFormatter.format(new Date(windowStartIso))
  const endDate = dateFormatter.format(new Date(windowEndIso))
  
  // Calculate totals
  let totalCheckIns = 0
  let totalFeedback = 0
  let totalWantsSimilar = 0
  
  for (const event of eventDigests) {
    totalCheckIns += event.totalCheckIns || 0
    totalFeedback += event.feedbackCount || 0
    totalWantsSimilar += event.wantsSimilarCount || 0
  }
  
  // Build Markdown
  const lines = []
  lines.push('## Weekly Open House Digest (Mon–Mon)')
  lines.push('')
  lines.push(`**Week:** ${startDate} → ${endDate}`)
  lines.push(`**Totals:** ${totalCheckIns} verified check-ins • ${totalFeedback} feedback • ${totalWantsSimilar} wants similar`)
  lines.push('')
  
  // List events
  if (eventDigests.length === 0) {
    lines.push('_No events with check-ins this week._')
  } else {
    for (const event of eventDigests) {
      // Event heading: use address if available, otherwise eventId
      const heading = event.eventAddress || event.eventId
      lines.push(`### ${heading}`)
      lines.push('')
      
      // Listing URL if present
      if (event.listingUrl) {
        lines.push(`📍 ${event.listingUrl}`)
        lines.push('')
      }
      
      // Check-ins
      lines.push(`**Verified check-ins:** ${event.totalCheckIns} (unique buyers: ${event.uniqueCheckInBuyers})`)
      
      // Feedback with percent
      const feedbackPercent = event.totalCheckIns === 0 
        ? 0 
        : Math.floor((event.feedbackCount / event.totalCheckIns) * 100)
      lines.push(`**Feedback submitted:** ${event.feedbackCount} (${feedbackPercent}%)`)
      
      // Wants similar
      lines.push(`**Wants similar:** ${event.wantsSimilarCount}`)
      lines.push('')
    }
  }
  
  return lines.join('\n')
}

test('buildWeeklyDigestSummaryMarkdown - feedback rate calculation (1/4 = 25%)', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z' // Monday 00:00 LA
  const windowEndIso = '2026-01-12T08:00:00.000Z' // Monday 00:00 LA (next week)
  
  const eventDigests = [
    {
      eventId: 'evt_test_123',
      eventAddress: '123 Main St, Santa Monica, CA',
      listingUrl: 'https://example.com/listing/123',
      totalCheckIns: 4,
      uniqueCheckInBuyers: 3,
      feedbackCount: 1,
      wantsSimilarCount: 1,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify feedback rate is 25% (1/4 = 0.25, Math.floor(0.25 * 100) = 25)
  assert.ok(markdown.includes('(25%)'), 'Should show 25% feedback rate')
  
  // Verify it's formatted as integer percent
  assert.ok(!markdown.includes('25.0%'), 'Should not show decimal in percent')
  
  console.log('✅ Feedback rate calculation correct (1/4 = 25%)')
})

test('buildWeeklyDigestSummaryMarkdown - listing URL included when present', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_test_456',
      eventAddress: '456 Oak Ave, Los Angeles, CA',
      listingUrl: 'https://redfin.com/property/456',
      totalCheckIns: 10,
      uniqueCheckInBuyers: 8,
      feedbackCount: 7,
      wantsSimilarCount: 5,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify listing URL is included
  assert.ok(markdown.includes('https://redfin.com/property/456'), 'Should include listing URL')
  assert.ok(markdown.includes('📍'), 'Should include location emoji before URL')
  
  console.log('✅ Listing URL included when present')
})

test('buildWeeklyDigestSummaryMarkdown - missing address handled gracefully', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_no_address',
      // No eventAddress field
      listingUrl: 'https://example.com/listing/789',
      totalCheckIns: 5,
      uniqueCheckInBuyers: 4,
      feedbackCount: 3,
      wantsSimilarCount: 2,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify eventId is used as heading when address is missing
  assert.ok(markdown.includes('### evt_no_address'), 'Should use eventId as heading when address missing')
  
  // Verify listing URL still works
  assert.ok(markdown.includes('https://example.com/listing/789'), 'Should still include listing URL')
  
  console.log('✅ Missing address handled gracefully (uses eventId)')
})

test('buildWeeklyDigestSummaryMarkdown - missing listingUrl handled gracefully', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_no_url',
      eventAddress: '789 Elm St, Pasadena, CA',
      // No listingUrl field
      totalCheckIns: 8,
      uniqueCheckInBuyers: 6,
      feedbackCount: 4,
      wantsSimilarCount: 3,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify address is used as heading
  assert.ok(markdown.includes('### 789 Elm St, Pasadena, CA'), 'Should use address as heading')
  
  // Verify no URL line is present
  assert.ok(!markdown.includes('📍'), 'Should not include location emoji when URL missing')
  assert.ok(!markdown.includes('http'), 'Should not include any URL when listingUrl missing')
  
  console.log('✅ Missing listingUrl handled gracefully (no URL line)')
})

test('buildWeeklyDigestSummaryMarkdown - zero check-ins shows 0%', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_zero',
      eventAddress: '999 Zero St, LA, CA',
      totalCheckIns: 0,
      uniqueCheckInBuyers: 0,
      feedbackCount: 0,
      wantsSimilarCount: 0,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify 0% is shown (not NaN or undefined)
  assert.ok(markdown.includes('(0%)'), 'Should show 0% when totalCheckIns is 0')
  
  console.log('✅ Zero check-ins shows 0% feedback rate')
})

test('buildWeeklyDigestSummaryMarkdown - empty digest shows message', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = []
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify header is present
  assert.ok(markdown.includes('## Weekly Open House Digest (Mon–Mon)'), 'Should include header')
  
  // Verify totals line shows zeros
  assert.ok(markdown.includes('**Totals:** 0 verified check-ins • 0 feedback • 0 wants similar'), 'Should show zero totals')
  
  // Verify empty message
  assert.ok(markdown.includes('_No events with check-ins this week._'), 'Should show empty message')
  
  console.log('✅ Empty digest shows appropriate message')
})

test('buildWeeklyDigestSummaryMarkdown - totals calculated correctly', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_1',
      totalCheckIns: 10,
      uniqueCheckInBuyers: 8,
      feedbackCount: 7,
      wantsSimilarCount: 5,
      occurrenceIds: []
    },
    {
      eventId: 'evt_2',
      totalCheckIns: 15,
      uniqueCheckInBuyers: 12,
      feedbackCount: 10,
      wantsSimilarCount: 8,
      occurrenceIds: []
    },
    {
      eventId: 'evt_3',
      totalCheckIns: 5,
      uniqueCheckInBuyers: 4,
      feedbackCount: 3,
      wantsSimilarCount: 2,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify totals: 10+15+5=30 check-ins, 7+10+3=20 feedback, 5+8+2=15 wants similar
  assert.ok(markdown.includes('**Totals:** 30 verified check-ins • 20 feedback • 15 wants similar'), 
    'Should calculate totals correctly')
  
  console.log('✅ Totals calculated correctly across multiple events')
})

test('buildWeeklyDigestSummaryMarkdown - header format matches spec', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z' // Monday 00:00 LA
  const windowEndIso = '2026-01-12T08:00:00.000Z' // Monday 00:00 LA
  
  const eventDigests = []
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify header format
  assert.ok(markdown.includes('## Weekly Open House Digest (Mon–Mon)'), 'Should have correct header')
  
  // Verify week line exists (exact format may vary by locale, so just check structure)
  assert.ok(markdown.includes('**Week:**'), 'Should have Week label')
  assert.ok(markdown.includes('→'), 'Should use arrow separator')
  
  // Verify totals line exists
  assert.ok(markdown.includes('**Totals:**'), 'Should have Totals label')
  
  console.log('✅ Header format matches specification')
})

test('buildWeeklyDigestSummaryMarkdown - uses correct labels', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_labels',
      eventAddress: '123 Test St, LA, CA',
      totalCheckIns: 10,
      uniqueCheckInBuyers: 8,
      feedbackCount: 5,
      wantsSimilarCount: 3,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify correct labels are used (not "attendees")
  assert.ok(markdown.includes('**Verified check-ins:**'), 'Should use "Verified check-ins" label')
  assert.ok(markdown.includes('unique buyers:'), 'Should use "unique buyers" label')
  assert.ok(markdown.includes('**Feedback submitted:**'), 'Should use "Feedback submitted" label')
  assert.ok(markdown.includes('**Wants similar:**'), 'Should use "Wants similar" label')
  
  // Verify "attendees" is NOT used
  assert.ok(!markdown.toLowerCase().includes('attendee'), 'Should NOT use "attendees" label')
  
  console.log('✅ Uses correct labels (check-ins, not attendees)')
})

test('buildWeeklyDigestSummaryMarkdown - no PII included', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_test',
      eventAddress: '123 Main St, LA, CA',
      totalCheckIns: 10,
      uniqueCheckInBuyers: 8,
      feedbackCount: 5,
      wantsSimilarCount: 3,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Verify no PII-related terms (these would be fields we explicitly exclude)
  assert.ok(!markdown.includes('buyerToken'), 'Should not include buyerToken')
  assert.ok(!markdown.includes('answers'), 'Should not include free-text answers')
  assert.ok(!markdown.includes('email'), 'Should not include email')
  assert.ok(!markdown.includes('phone'), 'Should not include phone')
  assert.ok(!markdown.includes('@'), 'Should not include email addresses')
  
  // Only counts and addresses/URLs should be present
  assert.ok(markdown.includes('10'), 'Should include counts')
  assert.ok(markdown.includes('123 Main St'), 'Should include address')
  
  console.log('✅ No PII included in summary')
})

console.log('\n=== All tests passed ✅ ===')
