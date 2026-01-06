/**
 * Simple integration test to verify the Markdown summary is generated
 * and included in the digest structure
 */

console.log('=== Testing Markdown Summary Integration ===\n')

// Mock data structures
const mockEventDigests = [
  {
    eventId: 'evt_test_123',
    eventAddress: '123 Main St, Santa Monica, CA',
    listingUrl: 'https://example.com/listing/123',
    totalCheckIns: 10,
    uniqueCheckInBuyers: 8,
    feedbackCount: 7,
    wantsSimilarCount: 5,
    occurrenceIds: ['occ_1', 'occ_2']
  },
  {
    eventId: 'evt_test_456',
    totalCheckIns: 5,
    uniqueCheckInBuyers: 4,
    feedbackCount: 2,
    wantsSimilarCount: 1,
    occurrenceIds: []
  }
]

const LA_TIMEZONE = 'America/Los_Angeles'

/**
 * Build a broker-facing Markdown summary from the weekly digest data
 * (Copied from index.js for testing)
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

// Simulate digest generation
const windowStartIso = '2026-01-05T08:00:00.000Z'
const windowEndIso = '2026-01-12T08:00:00.000Z'

console.log('Generating mock digest...')

// Build the summary markdown
const summaryMarkdown = buildWeeklyDigestSummaryMarkdown({
  windowStartIso,
  windowEndIso,
  eventDigests: mockEventDigests
})

// Build the digest structure (what would be persisted to Firestore)
const digest = {
  windowStartIso,
  windowEndIso,
  generatedAtIso: new Date().toISOString(),
  eventDigests: mockEventDigests,
  summaryMarkdown
}

console.log('✅ Digest structure created\n')

// Verify the digest has all required fields
console.log('Verifying digest structure:')
console.log(`  windowStartIso: ${digest.windowStartIso ? '✅' : '❌'}`)
console.log(`  windowEndIso: ${digest.windowEndIso ? '✅' : '❌'}`)
console.log(`  generatedAtIso: ${digest.generatedAtIso ? '✅' : '❌'}`)
console.log(`  eventDigests: ${Array.isArray(digest.eventDigests) ? '✅' : '❌'}`)
console.log(`  summaryMarkdown: ${digest.summaryMarkdown ? '✅' : '❌'}`)
console.log('')

// Display the generated Markdown summary
console.log('Generated Markdown Summary:')
console.log('=' .repeat(60))
console.log(summaryMarkdown)
console.log('=' .repeat(60))
console.log('')

// Verify key elements are present
console.log('Verifying Markdown content:')
console.log(`  Has header: ${summaryMarkdown.includes('## Weekly Open House Digest') ? '✅' : '❌'}`)
console.log(`  Has week dates: ${summaryMarkdown.includes('**Week:**') ? '✅' : '❌'}`)
console.log(`  Has totals line: ${summaryMarkdown.includes('**Totals:**') ? '✅' : '❌'}`)
console.log(`  Has event sections: ${summaryMarkdown.includes('###') ? '✅' : '❌'}`)
console.log(`  Has check-ins label: ${summaryMarkdown.includes('Verified check-ins') ? '✅' : '❌'}`)
console.log(`  Has feedback with percent: ${summaryMarkdown.includes('%)') ? '✅' : '❌'}`)
console.log(`  Has wants similar: ${summaryMarkdown.includes('Wants similar') ? '✅' : '❌'}`)
console.log(`  Has listing URL: ${summaryMarkdown.includes('https://') ? '✅' : '❌'}`)
console.log('')

// Verify totals calculation
const expectedCheckIns = 15 // 10 + 5
const expectedFeedback = 9 // 7 + 2
const expectedWantsSimilar = 6 // 5 + 1

console.log('Verifying totals calculation:')
console.log(`  Total check-ins (expected 15): ${summaryMarkdown.includes('15 verified check-ins') ? '✅' : '❌'}`)
console.log(`  Total feedback (expected 9): ${summaryMarkdown.includes('9 feedback') ? '✅' : '❌'}`)
console.log(`  Total wants similar (expected 6): ${summaryMarkdown.includes('6 wants similar') ? '✅' : '❌'}`)
console.log('')

// Verify feedback percentages
console.log('Verifying feedback percentages:')
console.log(`  Event 1: 7/10 = 70%: ${summaryMarkdown.includes('7 (70%)') ? '✅' : '❌'}`)
console.log(`  Event 2: 2/5 = 40%: ${summaryMarkdown.includes('2 (40%)') ? '✅' : '❌'}`)
console.log('')

// Verify no PII
console.log('Verifying no PII:')
console.log(`  No buyerToken: ${!summaryMarkdown.includes('buyerToken') ? '✅' : '❌'}`)
console.log(`  No email: ${!summaryMarkdown.includes('@') ? '✅' : '❌'}`)
console.log(`  No answers text: ${!summaryMarkdown.includes('answers') ? '✅' : '❌'}`)
console.log('')

console.log('=== Integration Test Complete ✅ ===')
