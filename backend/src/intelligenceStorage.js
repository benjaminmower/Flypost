/*
 * Flypost v4 - Post-Visit Intelligence Storage
 * Manages Attendance and Feedback ledgers (In-Memory + Firestore)
 * 
 * This module implements the post-visit intelligence layer:
 * - Attendance: Records of presence at events (check-ins)
 * - Feedback: Sentiment and preference data linked to attendance
 */

import { 
  isFirestoreEnabled,
  getFirestoreClient,
  lockOccurrence
} from './firestoreClient.js'

// In-memory stores
let attendanceStore = new Map()
let feedbackStore = new Map()

/**
 * Generate a unique attendance ID
 * @returns {string} - Unique attendance identifier
 */
function generateAttendanceId() {
  return `att_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`
}

/**
 * Generate a unique feedback ID
 * @returns {string} - Unique feedback identifier
 */
function generateFeedbackId() {
  return `fbk_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`
}

/**
 * Store an attendance record
 * @param {object} attendanceData - Attendance record
 * @param {string} attendanceData.eventId - Event identifier
 * @param {string} attendanceData.buyerToken - Opaque buyer identifier
 * @param {string} attendanceData.checkInTime - ISO timestamp
 * @param {string} [attendanceData.dwellBand] - Optional dwell time band
 * @param {object} attendanceData.presenceProof - Evidence of presence
 * @returns {Promise<object>} - Stored attendance record
 */
export async function storeAttendance(attendanceData) {
  const attendanceId = generateAttendanceId()
  
  const attendance = {
    attendanceId,
    eventId: attendanceData.eventId,
    buyerToken: attendanceData.buyerToken,
    checkInTime: attendanceData.checkInTime || new Date().toISOString(),
    dwellBand: attendanceData.dwellBand || null,
    presenceProof: attendanceData.presenceProof,
    occurrenceId: attendanceData.occurrenceId || null,
    createdAt: new Date().toISOString()
  }
  
  // Store in memory
  attendanceStore.set(attendanceId, attendance)
  console.log(`📍 Stored attendance: ${attendanceId} for event ${attendance.eventId}`)
  
  // Lock occurrence if occurrenceId is present
  if (attendance.occurrenceId && isFirestoreEnabled()) {
    try {
      await lockOccurrence(attendance.eventId, attendance.occurrenceId)
    } catch (error) {
      console.error('⚠️ Failed to lock occurrence:', error.message)
      // Non-fatal - continue with attendance storage
    }
  }
  
  // Save to Firestore if enabled
  if (isFirestoreEnabled()) {
    try {
      const db = getFirestoreClient()
      const attendanceCollection = db.collection('attendance')
      await attendanceCollection.doc(attendanceId).set(attendance)
      console.log(`🔥 Saved attendance to Firestore: ${attendanceId}`)
    } catch (error) {
      console.error('⚠️ Firestore attendance save failed:', error.message)
      // Continue - in-memory record is still valid
    }
  }
  
  return attendance
}

/**
 * Store a feedback record
 * @param {object} feedbackData - Feedback record
 * @param {string} feedbackData.attendanceId - Linked attendance record
 * @param {string} feedbackData.eventId - Event identifier (denormalized)
 * @param {object} feedbackData.answers - Feedback answers
 * @param {string|null} [feedbackData.answers.liked] - What the buyer liked
 * @param {string|null} [feedbackData.answers.disliked] - What the buyer disliked
 * @param {boolean|null} [feedbackData.answers.wantsSimilar] - Whether they want similar homes
 * @param {string|null} [feedbackData.answers.wouldBuy] - Buy intent: "yes"|"maybe"|"no"
 * @param {string} [feedbackData.brokerageAffiliation] - Optional brokerage affiliation
 * @param {string} [feedbackData.occurrenceId] - Optional occurrence identifier
 * @returns {Promise<object>} - Stored feedback record
 */
export async function storeFeedback(feedbackData) {
  const feedbackId = generateFeedbackId()
  
  const feedback = {
    feedbackId,
    attendanceId: feedbackData.attendanceId,
    eventId: feedbackData.eventId,
    answers: {
      liked: feedbackData.answers.liked || null,
      disliked: feedbackData.answers.disliked || null,
      wantsSimilar: feedbackData.answers.hasOwnProperty('wantsSimilar') 
        ? feedbackData.answers.wantsSimilar 
        : false
    },
    brokerageAffiliation: feedbackData.brokerageAffiliation || null,
    occurrenceId: feedbackData.occurrenceId || null,
    createdAt: new Date().toISOString()
  }
  
  // Include wouldBuy if provided
  if (feedbackData.answers.hasOwnProperty('wouldBuy')) {
    feedback.answers.wouldBuy = feedbackData.answers.wouldBuy
  }
  
  // Store in memory
  feedbackStore.set(feedbackId, feedback)
  console.log(`💬 Stored feedback: ${feedbackId} for attendance ${feedback.attendanceId}`)
  
  // Save to Firestore if enabled
  if (isFirestoreEnabled()) {
    try {
      const db = getFirestoreClient()
      const feedbackCollection = db.collection('feedback')
      await feedbackCollection.doc(feedbackId).set(feedback)
      console.log(`🔥 Saved feedback to Firestore: ${feedbackId}`)
    } catch (error) {
      console.error('⚠️ Firestore feedback save failed:', error.message)
      // Continue - in-memory record is still valid
    }
  }
  
  return feedback
}

/**
 * Find attendance records by eventId and buyerToken
 * @param {string} eventId - Event identifier
 * @param {string} buyerToken - Buyer token
 * @returns {Promise<Array>} - Matching attendance records
 */
export async function findAttendanceByEventAndBuyer(eventId, buyerToken) {
  let results = []
  
  // Check in-memory store
  for (const attendance of attendanceStore.values()) {
    if (attendance.eventId === eventId && attendance.buyerToken === buyerToken) {
      results.push(attendance)
    }
  }
  
  // Also query Firestore if enabled
  if (isFirestoreEnabled()) {
    try {
      const db = getFirestoreClient()
      const snapshot = await db.collection('attendance')
        .where('eventId', '==', eventId)
        .where('buyerToken', '==', buyerToken)
        .get()
      
      // Merge with in-memory results (dedupe by attendanceId)
      const existingIds = new Set(results.map(r => r.attendanceId))
      snapshot.forEach(doc => {
        const data = doc.data()
        if (!existingIds.has(data.attendanceId)) {
          results.push(data)
        }
      })
    } catch (error) {
      console.error('⚠️ Firestore attendance query failed:', error.message)
      // Continue with in-memory results
    }
  }
  
  return results
}

/**
 * Find attendance record by ID
 * @param {string} attendanceId - Attendance identifier
 * @returns {Promise<object|null>} - Attendance record or null
 */
export async function findAttendanceById(attendanceId) {
  // Check in-memory first
  if (attendanceStore.has(attendanceId)) {
    return attendanceStore.get(attendanceId)
  }
  
  // Query Firestore if enabled
  if (isFirestoreEnabled()) {
    try {
      const db = getFirestoreClient()
      const doc = await db.collection('attendance').doc(attendanceId).get()
      if (doc.exists) {
        return doc.data()
      }
    } catch (error) {
      console.error('⚠️ Firestore attendance lookup failed:', error.message)
    }
  }
  
  return null
}

/**
 * Get feedback records by brokerage affiliation
 * @param {string} brokerageId - Brokerage identifier
 * @returns {Promise<Array>} - Matching feedback records
 */
export async function getFeedbackByBrokerage(brokerageId) {
  let results = []
  
  // Check in-memory store
  for (const feedback of feedbackStore.values()) {
    if (feedback.brokerageAffiliation === brokerageId) {
      results.push(feedback)
    }
  }
  
  // Also query Firestore if enabled
  if (isFirestoreEnabled()) {
    try {
      const db = getFirestoreClient()
      const snapshot = await db.collection('feedback')
        .where('brokerageAffiliation', '==', brokerageId)
        .get()
      
      // Merge with in-memory results (dedupe by feedbackId)
      const existingIds = new Set(results.map(r => r.feedbackId))
      snapshot.forEach(doc => {
        const data = doc.data()
        if (!existingIds.has(data.feedbackId)) {
          results.push(data)
        }
      })
    } catch (error) {
      console.error('⚠️ Firestore feedback query failed:', error.message)
      // Continue with in-memory results
    }
  }
  
  return results
}

/**
 * Count attendance records by eventId
 * @param {string} eventId - Event identifier
 * @returns {Promise<number>} - Count of matching attendance records
 */
export async function countAttendanceByEvent(eventId) {
  if (isFirestoreEnabled()) {
    try {
      const db = getFirestoreClient()
      const snapshot = await db.collection('attendance')
        .where('eventId', '==', eventId)
        .count()
        .get()
      return snapshot.data().count
    } catch (error) {
      console.error('⚠️ Firestore attendance count failed:', error.message)
      // Fall back to in-memory count
    }
  }

  let count = 0
  for (const attendance of attendanceStore.values()) {
    if (attendance.eventId === eventId) count++
  }
  return count
}

/**
 * Count feedback records by eventId
 * @param {string} eventId - Event identifier
 * @returns {Promise<number>} - Count of matching feedback records
 */
export async function countFeedbackByEvent(eventId) {
  if (isFirestoreEnabled()) {
    try {
      const db = getFirestoreClient()
      const snapshot = await db.collection('feedback')
        .where('eventId', '==', eventId)
        .count()
        .get()
      return snapshot.data().count
    } catch (error) {
      console.error('⚠️ Firestore feedback count failed:', error.message)
      // Fall back to in-memory count
    }
  }

  let count = 0
  for (const feedback of feedbackStore.values()) {
    if (feedback.eventId === eventId) count++
  }
  return count
}

/**
 * Clear all attendance and feedback records (for testing)
 * @returns {object} - Count of cleared records
 */
export function clearIntelligence() {
  const attendanceCount = attendanceStore.size
  const feedbackCount = feedbackStore.size
  
  attendanceStore.clear()
  feedbackStore.clear()
  
  console.log(`🧹 Cleared ${attendanceCount} attendance and ${feedbackCount} feedback records`)
  
  return { attendanceCleared: attendanceCount, feedbackCleared: feedbackCount }
}

/**
 * Get storage statistics
 * @returns {object} - Statistics
 */
export function getIntelligenceStats() {
  return {
    attendanceRecords: attendanceStore.size,
    feedbackRecords: feedbackStore.size
  }
}
