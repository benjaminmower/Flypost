/**
 * Hermetic tests for weekly digest with wouldBuy and legacy data handling
 * Run with: node --test test-digest-wouldBuy.js
 * 
 * No Firestore emulator, no network - just pure function testing
 */

import { test } from 'node:test'
import assert from 'node:assert'

const LA_TIMEZONE = 'America/Los_Angeles'

/**
 * Mock feedback stats calculation (duplicated from index.js for testing)
 */
function calculateFeedbackStats(feedbackDocs) {
  const feedbackStatsByEventId = new Map()
  
  for (const feedback of feedbackDocs) {
    const eventId = feedback.eventId
    
    if (!feedbackStatsByEventId.has(eventId)) {
      feedbackStatsByEventId.set(eventId, {
        feedbackCount: 0,
        wantsSimilarCount: 0,
        wouldBuyYesCount: 0,
        wouldBuyMaybeCount: 0,
        wouldBuyNoCount: 0
      })
    }
    
    const stats = feedbackStatsByEventId.get(eventId)
    stats.feedbackCount++
    
    // Legacy data handling: if wouldBuy is missing but wantsSimilar exists,
    // treat wantsSimilar as legacy wouldBuy intent
    const hasWouldBuy = feedback.answers?.wouldBuy !== null && feedback.answers?.wouldBuy !== undefined
    const hasWantsSimilar = feedback.answers?.wantsSimilar !== null && feedback.answers?.wantsSimilar !== undefined
    
    if (hasWouldBuy) {
      // New data: use wouldBuy field
      if (feedback.answers.wouldBuy === 'yes') {
        stats.wouldBuyYesCount++
      } else if (feedback.answers.wouldBuy === 'maybe') {
        stats.wouldBuyMaybeCount++
      } else if (feedback.answers.wouldBuy === 'no') {
        stats.wouldBuyNoCount++
      }
      
      // Also track wantsSimilar separately if present
      if (feedback.answers.wantsSimilar === true) {
        stats.wantsSimilarCount++
      }
    } else if (hasWantsSimilar) {
      // Legacy data: map wantsSimilar to wouldBuy
      // true => "yes", false => "no"
      if (feedback.answers.wantsSimilar === true) {
        stats.wouldBuyYesCount++
      } else if (feedback.answers.wantsSimilar === false) {
        stats.wouldBuyNoCount++
      }
      // Do NOT count legacy wantsSimilar in wantsSimilarCount
    }
  }
  
  return feedbackStatsByEventId
}

/**
 * Build Markdown summary (simplified from index.js for testing)
 */
function buildWeeklyDigestSummaryMarkdown({ windowStartIso, windowEndIso, eventDigests }) {
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
  let totalWouldBuyYes = 0
  let totalWouldBuyMaybe = 0
  let totalWouldBuyNo = 0
  
  for (const event of eventDigests) {
    totalCheckIns += event.totalCheckIns || 0
    totalFeedback += event.feedbackCount || 0
    totalWantsSimilar += event.wantsSimilarCount || 0
    totalWouldBuyYes += event.wouldBuyYesCount || 0
    totalWouldBuyMaybe += event.wouldBuyMaybeCount || 0
    totalWouldBuyNo += event.wouldBuyNoCount || 0
  }
  
  const lines = []
  lines.push('## Weekly Open House Digest (Mon–Mon)')
  lines.push('')
  lines.push(`**Week:** ${startDate} → ${endDate}`)
  lines.push(`**Totals:** ${totalCheckIns} verified check-ins • ${totalFeedback} feedback`)
  lines.push(`**Buy Intent:** ${totalWouldBuyYes} yes • ${totalWouldBuyMaybe} maybe • ${totalWouldBuyNo} no`)
  lines.push(`**Wants similar homes:** ${totalWantsSimilar}`)
  lines.push('')
  
  if (eventDigests.length === 0) {
    lines.push('_No events with check-ins this week._')
  } else {
    for (const event of eventDigests) {
      const heading = event.eventAddress || event.eventId
      lines.push(`### ${heading}`)
      lines.push('')
      
      if (event.listingUrl) {
        lines.push(`📍 ${event.listingUrl}`)
        lines.push('')
      }
      
      lines.push(`**Verified check-ins:** ${event.totalCheckIns} (unique buyers: ${event.uniqueCheckInBuyers})`)
      
      const feedbackPercent = event.totalCheckIns === 0 
        ? 0 
        : Math.floor((event.feedbackCount / event.totalCheckIns) * 100)
      lines.push(`**Feedback submitted:** ${event.feedbackCount} (${feedbackPercent}%)`)
      lines.push(`**Buy intent:** ${event.wouldBuyYesCount} yes • ${event.wouldBuyMaybeCount} maybe • ${event.wouldBuyNoCount} no`)
      lines.push(`**Wants similar:** ${event.wantsSimilarCount}`)
      lines.push('')
    }
  }
  
  return lines.join('\n')
}

test('calculateFeedbackStats: new data with wouldBuy field', () => {
  const feedbackDocs = [
    {
      eventId: 'evt_001',
      answers: { wouldBuy: 'yes', wantsSimilar: true, liked: 'Great', disliked: null }
    },
    {
      eventId: 'evt_001',
      answers: { wouldBuy: 'maybe', wantsSimilar: false, liked: null, disliked: 'Too big' }
    },
    {
      eventId: 'evt_001',
      answers: { wouldBuy: 'no', wantsSimilar: null, liked: null, disliked: 'Too expensive' }
    }
  ]
  
  const stats = calculateFeedbackStats(feedbackDocs)
  const evt001Stats = stats.get('evt_001')
  
  assert.strictEqual(evt001Stats.feedbackCount, 3)
  assert.strictEqual(evt001Stats.wouldBuyYesCount, 1)
  assert.strictEqual(evt001Stats.wouldBuyMaybeCount, 1)
  assert.strictEqual(evt001Stats.wouldBuyNoCount, 1)
  assert.strictEqual(evt001Stats.wantsSimilarCount, 1) // Only one true
})

test('calculateFeedbackStats: legacy data with only wantsSimilar', () => {
  const feedbackDocs = [
    {
      eventId: 'evt_legacy_001',
      answers: { wantsSimilar: true, liked: 'Nice', disliked: null }
    },
    {
      eventId: 'evt_legacy_001',
      answers: { wantsSimilar: false, liked: null, disliked: 'Not for me' }
    },
    {
      eventId: 'evt_legacy_001',
      answers: { wantsSimilar: true, liked: 'Great location', disliked: 'Small rooms' }
    }
  ]
  
  const stats = calculateFeedbackStats(feedbackDocs)
  const legacyStats = stats.get('evt_legacy_001')
  
  assert.strictEqual(legacyStats.feedbackCount, 3)
  // Legacy wantsSimilar true => wouldBuy yes
  assert.strictEqual(legacyStats.wouldBuyYesCount, 2)
  assert.strictEqual(legacyStats.wouldBuyMaybeCount, 0)
  // Legacy wantsSimilar false => wouldBuy no
  assert.strictEqual(legacyStats.wouldBuyNoCount, 1)
  // Legacy wantsSimilar should NOT be counted in wantsSimilarCount
  assert.strictEqual(legacyStats.wantsSimilarCount, 0)
})

test('calculateFeedbackStats: mixed new and legacy data', () => {
  const feedbackDocs = [
    // New feedback with wouldBuy
    {
      eventId: 'evt_mixed',
      answers: { wouldBuy: 'yes', wantsSimilar: true, liked: 'Perfect', disliked: null }
    },
    // Legacy feedback with only wantsSimilar
    {
      eventId: 'evt_mixed',
      answers: { wantsSimilar: true, liked: 'Good', disliked: null }
    },
    // New feedback with wouldBuy
    {
      eventId: 'evt_mixed',
      answers: { wouldBuy: 'no', wantsSimilar: false, liked: null, disliked: 'Too far' }
    },
    // Legacy feedback with wantsSimilar false
    {
      eventId: 'evt_mixed',
      answers: { wantsSimilar: false, liked: null, disliked: 'Not interested' }
    }
  ]
  
  const stats = calculateFeedbackStats(feedbackDocs)
  const mixedStats = stats.get('evt_mixed')
  
  assert.strictEqual(mixedStats.feedbackCount, 4)
  // 1 new yes + 1 legacy yes = 2
  assert.strictEqual(mixedStats.wouldBuyYesCount, 2)
  assert.strictEqual(mixedStats.wouldBuyMaybeCount, 0)
  // 1 new no + 1 legacy no = 2
  assert.strictEqual(mixedStats.wouldBuyNoCount, 2)
  // Only 1 wantsSimilar from new data
  assert.strictEqual(mixedStats.wantsSimilarCount, 1)
})

test('calculateFeedbackStats: new data with null/missing wantsSimilar', () => {
  const feedbackDocs = [
    {
      eventId: 'evt_002',
      answers: { wouldBuy: 'yes', wantsSimilar: null, liked: 'Great', disliked: null }
    },
    {
      eventId: 'evt_002',
      answers: { wouldBuy: 'maybe', liked: null, disliked: null } // wantsSimilar missing
    }
  ]
  
  const stats = calculateFeedbackStats(feedbackDocs)
  const evt002Stats = stats.get('evt_002')
  
  assert.strictEqual(evt002Stats.feedbackCount, 2)
  assert.strictEqual(evt002Stats.wouldBuyYesCount, 1)
  assert.strictEqual(evt002Stats.wouldBuyMaybeCount, 1)
  assert.strictEqual(evt002Stats.wouldBuyNoCount, 0)
  assert.strictEqual(evt002Stats.wantsSimilarCount, 0)
})

test('buildWeeklyDigestSummaryMarkdown: includes buy intent and wants similar', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_test_123',
      eventAddress: '123 Main St, Santa Monica, CA',
      listingUrl: 'https://example.com/listing/123',
      totalCheckIns: 10,
      uniqueCheckInBuyers: 8,
      feedbackCount: 5,
      wouldBuyYesCount: 2,
      wouldBuyMaybeCount: 1,
      wouldBuyNoCount: 2,
      wantsSimilarCount: 3,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Check totals include buy intent
  assert.ok(markdown.includes('**Buy Intent:** 2 yes • 1 maybe • 2 no'))
  assert.ok(markdown.includes('**Wants similar homes:** 3'))
  
  // Check per-event metrics
  assert.ok(markdown.includes('**Buy intent:** 2 yes • 1 maybe • 2 no'))
  assert.ok(markdown.includes('**Wants similar:** 3'))
  
  // Verify feedback rate
  assert.ok(markdown.includes('**Feedback submitted:** 5 (50%)'))
})

test('buildWeeklyDigestSummaryMarkdown: handles legacy data correctly', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_legacy',
      eventAddress: '456 Oak Ave, Venice, CA',
      totalCheckIns: 6,
      uniqueCheckInBuyers: 5,
      feedbackCount: 4,
      wouldBuyYesCount: 3,  // From legacy wantsSimilar:true
      wouldBuyMaybeCount: 0,
      wouldBuyNoCount: 1,   // From legacy wantsSimilar:false
      wantsSimilarCount: 0,  // Legacy doesn't count here
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Legacy data should show in buy intent
  assert.ok(markdown.includes('**Buy Intent:** 3 yes • 0 maybe • 1 no'))
  // wantsSimilar should be 0 for legacy
  assert.ok(markdown.includes('**Wants similar homes:** 0'))
})

test('buildWeeklyDigestSummaryMarkdown: mixed new and legacy events', () => {
  const windowStartIso = '2026-01-05T08:00:00.000Z'
  const windowEndIso = '2026-01-12T08:00:00.000Z'
  
  const eventDigests = [
    {
      eventId: 'evt_new',
      eventAddress: '789 Beach Blvd, Malibu, CA',
      totalCheckIns: 8,
      uniqueCheckInBuyers: 7,
      feedbackCount: 6,
      wouldBuyYesCount: 3,
      wouldBuyMaybeCount: 2,
      wouldBuyNoCount: 1,
      wantsSimilarCount: 4,  // New field usage
      occurrenceIds: []
    },
    {
      eventId: 'evt_legacy',
      eventAddress: '321 Hill St, Pasadena, CA',
      totalCheckIns: 5,
      uniqueCheckInBuyers: 4,
      feedbackCount: 3,
      wouldBuyYesCount: 2,  // Legacy mapped
      wouldBuyMaybeCount: 0,
      wouldBuyNoCount: 1,   // Legacy mapped
      wantsSimilarCount: 0,
      occurrenceIds: []
    }
  ]
  
  const markdown = buildWeeklyDigestSummaryMarkdown({
    windowStartIso,
    windowEndIso,
    eventDigests
  })
  
  // Totals aggregate both
  assert.ok(markdown.includes('**Totals:** 13 verified check-ins • 9 feedback'))
  assert.ok(markdown.includes('**Buy Intent:** 5 yes • 2 maybe • 2 no'))
  assert.ok(markdown.includes('**Wants similar homes:** 4'))
})
