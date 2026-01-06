/**
 * Firebase Cloud Functions for Flypost v4
 * 
 * Weekly Feedback Digest Function
 * Runs every Monday at 00:00 America/Los_Angeles timezone
 * Generates a digest of feedback from the prior week and stores it in Firestore
 * 
 * Collections used:
 * - feedback: Contains feedback documents with createdAt (ISO UTC string), eventId, attendanceId, answers
 * - attendance: Contains attendance documents with eventId, occurrenceId, checkInTime, buyerToken, presenceProof, createdAt
 * - events: Contains event documents (optional enrichment with address, listing URL)
 * - weeklyDigests: Output collection where digests are persisted as {YYYY-MM-DD} documents
 * 
 * Digest Schema:
 * {
 *   windowStartIso: string,        // Start of the week in UTC ISO format
 *   windowEndIso: string,          // End of the week in UTC ISO format
 *   generatedAtIso: string,        // When the digest was generated
 *   summaryMarkdown: string,       // Broker-facing Markdown summary (no PII)
 *   eventDigests: [{
 *     eventId: string,                 // Event identifier
 *     feedbackCount: number,           // Total feedback responses
 *     totalCheckIns: number,           // Total check-ins in weekly window (from attendance.createdAt)
 *     uniqueCheckInBuyers: number,     // Unique buyers who checked in (deduplicated by buyerToken)
 *     wantsSimilarCount: number,       // Number who want similar events
 *     occurrenceIds: string[],         // List of occurrence IDs (if multi-slot)
 *     feedbackRate: number,            // feedbackCount / totalCheckIns (0 if no check-ins)
 *     eventAddress: string?,           // Optional: event address if available
 *     listingUrl: string?              // Optional: external listing URL if available
 *   }]
 * }
 * 
 * Note: Events with check-ins but no feedback will appear with feedbackCount = 0
 * Sorted by totalCheckIns desc, then feedbackCount desc
 * 
 * Privacy: No PII is logged. buyerToken, answers text, and contact info are never logged.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { startOfWeek, addWeeks, format } from 'date-fns'

// Initialize Firebase Admin
initializeApp()

const db = getFirestore()

// Los Angeles timezone constant
const LA_TIMEZONE = 'America/Los_Angeles'

// Secret for HTTP trigger authentication
const DIGEST_TRIGGER_TOKEN = defineSecret('DIGEST_TRIGGER_TOKEN')

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings are equal
 * @private
 */
function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false
  }
  
  // If lengths differ, still compare to avoid leaking length info
  const aLen = a.length
  const bLen = b.length
  const maxLen = Math.max(aLen, bLen)
  
  let result = aLen === bLen ? 0 : 1
  
  for (let i = 0; i < maxLen; i++) {
    const aChar = i < aLen ? a.charCodeAt(i) : 0
    const bChar = i < bLen ? b.charCodeAt(i) : 0
    result |= aChar ^ bChar
  }
  
  return result === 0
}

/**
 * Calculate the weekly window boundaries for the prior week
 * Returns start and end times as UTC ISO strings
 * Week runs from Monday 00:00 LA to next Monday 00:00 LA
 * 
 * @param {Date} now - Current date/time (defaults to now)
 * @returns {{ windowStartIso: string, windowEndIso: string, docId: string }}
 */
function calculateWeeklyWindow(now = new Date()) {
  // Get current time in LA timezone
  const nowLA = toZonedTime(now, LA_TIMEZONE)
  
  // Get start of current week (Monday 00:00) in LA timezone
  const currentWeekStartLA = startOfWeek(nowLA, { weekStartsOn: 1 }) // 1 = Monday
  
  // Go back one week to get the prior week's start
  const priorWeekStartLA = addWeeks(currentWeekStartLA, -1)
  
  // Prior week end is the start of current week
  const priorWeekEndLA = currentWeekStartLA
  
  // Convert to UTC ISO strings
  const windowStartIso = fromZonedTime(priorWeekStartLA, LA_TIMEZONE).toISOString()
  const windowEndIso = fromZonedTime(priorWeekEndLA, LA_TIMEZONE).toISOString()
  
  // Generate document ID from the end date (Monday date in LA timezone)
  const docId = format(priorWeekEndLA, 'yyyy-MM-dd')
  
  return { windowStartIso, windowEndIso, docId }
}

/**
 * Query feedback within the weekly window
 * Uses string range filters on createdAt field
 * 
 * @param {string} windowStartIso - Start of window (ISO UTC string)
 * @param {string} windowEndIso - End of window (ISO UTC string)
 * @returns {Promise<Array>} - Array of feedback documents
 */
async function queryFeedbackInWindow(windowStartIso, windowEndIso) {
  console.log(`Querying feedback between ${windowStartIso} and ${windowEndIso}`)
  
  const feedbackRef = db.collection('feedback')
  const snapshot = await feedbackRef
    .where('createdAt', '>=', windowStartIso)
    .where('createdAt', '<', windowEndIso)
    .get()
  
  const feedbackDocs = []
  snapshot.forEach(doc => {
    feedbackDocs.push({ id: doc.id, ...doc.data() })
  })
  
  console.log(`Found ${feedbackDocs.length} feedback documents`)
  return feedbackDocs
}

/**
 * Query attendance within the weekly window
 * Uses string range filters on createdAt field
 * 
 * @param {string} windowStartIso - Start of window (ISO UTC string)
 * @param {string} windowEndIso - End of window (ISO UTC string)
 * @returns {Promise<Array>} - Array of attendance documents
 */
async function queryAttendanceInWindow(windowStartIso, windowEndIso) {
  console.log(`Querying attendance between ${windowStartIso} and ${windowEndIso}`)
  
  const attendanceRef = db.collection('attendance')
  const snapshot = await attendanceRef
    .where('createdAt', '>=', windowStartIso)
    .where('createdAt', '<', windowEndIso)
    .get()
  
  const attendanceDocs = []
  snapshot.forEach(doc => {
    attendanceDocs.push({ id: doc.id, ...doc.data() })
  })
  
  console.log(`Found ${attendanceDocs.length} attendance documents`)
  return attendanceDocs
}

/**
 * Optionally fetch event documents for enrichment
 * Returns a map of eventId to event data
 * 
 * @param {string[]} eventIds - Array of event IDs
 * @returns {Promise<Map<string, object>>} - Map of eventId to event data
 */
async function batchQueryEvents(eventIds) {
  if (eventIds.length === 0) {
    return new Map()
  }
  
  const eventMap = new Map()
  const eventsRef = db.collection('events')
  
  // Fetch each event individually (more reliable than 'in' queries for events)
  const promises = eventIds.map(async (eventId) => {
    try {
      const doc = await eventsRef.doc(eventId).get()
      if (doc.exists) {
        eventMap.set(eventId, doc.data())
      }
    } catch (error) {
      // Log error but don't fail the entire digest
      console.error(`Failed to fetch event ${eventId}:`, error.message)
    }
  })
  
  await Promise.all(promises)
  
  console.log(`Fetched ${eventMap.size} event documents from ${eventIds.length} IDs`)
  return eventMap
}

/**
 * Aggregate feedback and attendance data by eventId
 * 
 * @param {Array} feedbackDocs - Array of feedback documents
 * @param {Array} attendanceDocs - Array of attendance documents from weekly window
 * @param {Map<string, object>} eventMap - Map of event data
 * @returns {Array} - Array of event digests
 */
function aggregateFeedbackAndAttendance(feedbackDocs, attendanceDocs, eventMap) {
  // Build attendance-based stats per eventId
  const attendanceStatsByEventId = new Map()
  
  for (const attendance of attendanceDocs) {
    const eventId = attendance.eventId
    
    if (!attendanceStatsByEventId.has(eventId)) {
      attendanceStatsByEventId.set(eventId, {
        totalCheckIns: 0,
        uniqueCheckInBuyers: new Set(),
        occurrenceIds: new Set()
      })
    }
    
    const stats = attendanceStatsByEventId.get(eventId)
    stats.totalCheckIns++
    
    // Track unique buyers (without logging PII)
    if (attendance.buyerToken) {
      stats.uniqueCheckInBuyers.add(attendance.buyerToken)
    }
    
    // Track occurrences (excluding null)
    if (attendance.occurrenceId) {
      stats.occurrenceIds.add(attendance.occurrenceId)
    }
  }
  
  // Build feedback-based stats per eventId
  const feedbackStatsByEventId = new Map()
  
  for (const feedback of feedbackDocs) {
    const eventId = feedback.eventId
    
    if (!feedbackStatsByEventId.has(eventId)) {
      feedbackStatsByEventId.set(eventId, {
        feedbackCount: 0,
        wantsSimilarCount: 0
      })
    }
    
    const stats = feedbackStatsByEventId.get(eventId)
    stats.feedbackCount++
    
    // Track wantsSimilar
    if (feedback.answers?.wantsSimilar === true) {
      stats.wantsSimilarCount++
    }
  }
  
  // Get UNION of all eventIds
  const allEventIds = new Set([
    ...attendanceStatsByEventId.keys(),
    ...feedbackStatsByEventId.keys()
  ])
  
  // Build final event digests
  const eventDigests = []
  for (const eventId of allEventIds) {
    const attendanceStats = attendanceStatsByEventId.get(eventId)
    const feedbackStats = feedbackStatsByEventId.get(eventId)
    
    const totalCheckIns = attendanceStats?.totalCheckIns || 0
    const feedbackCount = feedbackStats?.feedbackCount || 0
    
    const digest = {
      eventId,
      feedbackCount,
      totalCheckIns,
      uniqueCheckInBuyers: attendanceStats?.uniqueCheckInBuyers.size || 0,
      wantsSimilarCount: feedbackStats?.wantsSimilarCount || 0,
      occurrenceIds: attendanceStats ? Array.from(attendanceStats.occurrenceIds) : [],
      feedbackRate: totalCheckIns === 0 ? 0 : feedbackCount / totalCheckIns
    }
    
    // Enrich with event data if available
    const eventData = eventMap.get(eventId)
    if (eventData) {
      // Extract address
      if (eventData.location?.address) {
        const addr = eventData.location.address
        // Build a simple address string (no PII from organizer contact)
        const parts = [
          addr.streetAddress,
          addr.addressLocality || addr.city,
          addr.addressRegion || addr.state
        ].filter(Boolean)
        digest.eventAddress = parts.join(', ')
      }
      
      // Extract listing URL (from offers or other field)
      if (eventData.offers?.url) {
        digest.listingUrl = eventData.offers.url
      } else if (eventData.url) {
        digest.listingUrl = eventData.url
      }
    }
    
    eventDigests.push(digest)
  }
  
  // Sort by totalCheckIns desc, then feedbackCount desc
  eventDigests.sort((a, b) => {
    if (b.totalCheckIns !== a.totalCheckIns) {
      return b.totalCheckIns - a.totalCheckIns
    }
    return b.feedbackCount - a.feedbackCount
  })
  
  console.log(`Aggregated ${eventDigests.length} event digests`)
  return eventDigests
}

/**
 * Build a broker-facing Markdown summary from the weekly digest data
 * 
 * @param {object} params - Parameters
 * @param {string} params.windowStartIso - Start of window in UTC ISO format
 * @param {string} params.windowEndIso - End of window in UTC ISO format
 * @param {Array} params.eventDigests - Array of event digests
 * @returns {string} - Markdown-formatted summary
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

/**
 * Persist the weekly digest to Firestore
 * 
 * @param {string} docId - Document ID (YYYY-MM-DD format)
 * @param {object} digest - Digest data
 * @returns {Promise<void>}
 */
async function persistDigest(docId, digest) {
  const digestRef = db.collection('weeklyDigests').doc(docId)
  await digestRef.set(digest)
  console.log(`Persisted digest to weeklyDigests/${docId}`)
}

/**
 * Shared digest generation logic (internal, not exported)
 * Used by both scheduled and HTTP-triggered functions
 * 
 * @param {object} options - Options object
 * @param {Date} options.now - Current date/time (defaults to now)
 * @returns {Promise<object>} - Digest result with metadata
 * @private
 */
async function runWeeklyFeedbackDigest({ now = new Date() } = {}) {
  const startTime = Date.now()
  console.log('=== Starting Weekly Feedback Digest Generation ===')
  
  try {
    // Calculate weekly window
    const { windowStartIso, windowEndIso, docId } = calculateWeeklyWindow(now)
    console.log(`Window: ${windowStartIso} to ${windowEndIso}`)
    console.log(`Document ID: ${docId}`)
    
    // Query feedback in window
    console.log('Step 1: Querying feedback...')
    const feedbackDocs = await queryFeedbackInWindow(windowStartIso, windowEndIso)
    console.log(`Step 1 complete: Found ${feedbackDocs.length} feedback documents (${Date.now() - startTime}ms elapsed)`)
    
    // Query attendance in window
    console.log('Step 2: Querying attendance...')
    const attendanceDocs = await queryAttendanceInWindow(windowStartIso, windowEndIso)
    console.log(`Step 2 complete: Found ${attendanceDocs.length} attendance documents (${Date.now() - startTime}ms elapsed)`)
    
    // If no feedback AND no attendance, create empty digest
    if (feedbackDocs.length === 0 && attendanceDocs.length === 0) {
      console.log('No feedback or attendance in this window. Creating empty digest.')
      const emptyDigest = {
        windowStartIso,
        windowEndIso,
        generatedAtIso: new Date().toISOString(),
        eventDigests: [],
        summaryMarkdown: buildWeeklyDigestSummaryMarkdown({
          windowStartIso,
          windowEndIso,
          eventDigests: []
        })
      }
      await persistDigest(docId, emptyDigest)
      console.log(`=== Digest generation complete (empty) - Total time: ${Date.now() - startTime}ms ===`)
      
      return {
        docId,
        windowStartIso,
        windowEndIso,
        eventCount: 0,
        feedbackCount: 0,
        executionTimeMs: Date.now() - startTime
      }
    }
    
    // Extract unique eventIds from both feedback and attendance
    const feedbackEventIds = [...new Set(feedbackDocs.map(f => f.eventId).filter(Boolean))]
    const attendanceEventIds = [...new Set(attendanceDocs.map(a => a.eventId).filter(Boolean))]
    const allEventIds = [...new Set([...feedbackEventIds, ...attendanceEventIds])]
    console.log(`Found ${allEventIds.length} unique event IDs (${feedbackEventIds.length} from feedback, ${attendanceEventIds.length} from attendance)`)
    
    // Batch query events for enrichment
    console.log('Step 3: Querying event documents...')
    const eventMap = await batchQueryEvents(allEventIds)
    console.log(`Step 3 complete: Fetched ${eventMap.size} event documents (${Date.now() - startTime}ms elapsed)`)
    
    // Aggregate feedback and attendance
    console.log('Step 4: Aggregating feedback and attendance...')
    const eventDigests = aggregateFeedbackAndAttendance(feedbackDocs, attendanceDocs, eventMap)
    console.log(`Step 4 complete: Aggregated ${eventDigests.length} event digests (${Date.now() - startTime}ms elapsed)`)
    
    // Build Markdown summary
    console.log('Step 5: Building Markdown summary...')
    const summaryMarkdown = buildWeeklyDigestSummaryMarkdown({
      windowStartIso,
      windowEndIso,
      eventDigests
    })
    console.log(`Step 5 complete: Generated Markdown summary (${Date.now() - startTime}ms elapsed)`)
    
    // Build final digest
    const digest = {
      windowStartIso,
      windowEndIso,
      generatedAtIso: new Date().toISOString(),
      eventDigests,
      summaryMarkdown
    }
    
    // Persist to Firestore
    console.log('Step 6: Persisting digest to Firestore...')
    await persistDigest(docId, digest)
    console.log(`Step 6 complete: Digest persisted (${Date.now() - startTime}ms elapsed)`)
    
    const totalTime = Date.now() - startTime
    console.log('=== Digest generation complete ===')
    console.log(`Total events: ${eventDigests.length}`)
    console.log(`Total feedback: ${feedbackDocs.length}`)
    console.log(`Total attendance: ${attendanceDocs.length}`)
    console.log(`Total execution time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`)
    
    // Warn if approaching timeout (540 seconds = 540000ms)
    if (totalTime > 400000) {
      console.warn(`⚠️ Function took ${(totalTime / 1000).toFixed(2)}s - approaching timeout limit of 540s`)
    }
    
    return {
      docId,
      windowStartIso,
      windowEndIso,
      eventCount: eventDigests.length,
      feedbackCount: feedbackDocs.length,
      executionTimeMs: totalTime,
      summaryMarkdown
    }
  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(`Error generating weekly digest after ${totalTime}ms:`, error)
    throw error
  }
}

/**
 * Scheduled weekly digest generation function
 * Runs every Monday at 00:00 America/Los_Angeles
 */
export const generateWeeklyFeedbackDigest = onSchedule(
  {
    schedule: '0 0 * * 1', // Every Monday at 00:00
    timeZone: LA_TIMEZONE,
    memory: '512MiB',
    timeoutSeconds: 540 // 9 minutes
  },
  async (event) => {
    await runWeeklyFeedbackDigest()
  }
)

/**
 * HTTP-triggered weekly digest generation function
 * Allows manual execution of the digest generation
 * Requires X-Digest-Token header for authentication
 */
export const generateWeeklyFeedbackDigestHttp = onRequest(
  {
    secrets: [DIGEST_TRIGGER_TOKEN],
    memory: '512MiB',
    timeoutSeconds: 540 // 9 minutes
  },
  async (req, res) => {
    // Only allow POST method
    if (req.method !== 'POST') {
      res.status(405).json({
        ok: false,
        error: 'Method not allowed. Use POST.'
      })
      return
    }
    
    // Validate authentication token
    const providedToken = req.get('X-Digest-Token')
    const expectedToken = DIGEST_TRIGGER_TOKEN.value()
    
    // Use constant-time comparison to prevent timing attacks
    if (!providedToken || !constantTimeCompare(providedToken, expectedToken)) {
      console.warn('Unauthorized digest trigger attempt')
      res.status(401).json({
        ok: false,
        error: 'unauthorized'
      })
      return
    }
    
    // Run the digest generation
    try {
      const result = await runWeeklyFeedbackDigest()
      
      res.status(200).json({
        ok: true,
        docId: result.docId,
        windowStartIso: result.windowStartIso,
        windowEndIso: result.windowEndIso,
        eventCount: result.eventCount,
        feedbackCount: result.feedbackCount,
        executionTimeMs: result.executionTimeMs,
        executionTimeSec: (result.executionTimeMs / 1000).toFixed(2),
        summaryMarkdown: result.summaryMarkdown
      })
    } catch (error) {
      console.error('Error in HTTP-triggered digest generation:', error)
      res.status(500).json({
        ok: false,
        error: 'Internal server error',
        message: error.message
      })
    }
  }
)
