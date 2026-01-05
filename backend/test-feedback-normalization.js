/*
 * Test: Feedback Loop LLM Readiness - occurrenceId and normalization
 * 
 * Hermetic tests (no API keys, no network) using node:test
 * Run with: node --test test-feedback-normalization.js
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { 
  storeAttendance, 
  storeFeedback,
  clearIntelligence
} from './src/intelligenceStorage.js'

// Helper: Normalize feedback text field (matches server.js implementation)
function normalizeFeedbackText(text) {
  if (typeof text !== 'string') {
    return null
  }
  
  const trimmed = text.trim()
  
  if (trimmed.length === 0) {
    return null
  }
  
  // Cap at 500 characters
  return trimmed.substring(0, 500)
}

test('occurrenceId is included in feedback when attendance has it', async () => {
  clearIntelligence()
  
  // Store attendance with occurrenceId
  const attendance = await storeAttendance({
    eventId: 'evt_test_123',
    buyerToken: 'buyer_abc',
    checkInTime: new Date().toISOString(),
    occurrenceId: 'occ_saturday_morning',
    presenceProof: {
      method: 'geo_time',
      lat: 34.0522,
      lng: -118.2437,
      matchedBy: 'explicit'
    }
  })
  
  assert.strictEqual(attendance.occurrenceId, 'occ_saturday_morning', 'Attendance should store occurrenceId')
  
  // Store feedback with occurrenceId from attendance
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Great location',
      disliked: 'Small kitchen',
      wantsSimilar: true
    },
    occurrenceId: attendance.occurrenceId || null
  })
  
  assert.strictEqual(feedback.occurrenceId, 'occ_saturday_morning', 'Feedback should include occurrenceId from attendance')
})

test('occurrenceId defaults to null when attendance lacks it', async () => {
  clearIntelligence()
  
  // Store attendance without occurrenceId
  const attendance = await storeAttendance({
    eventId: 'evt_test_456',
    buyerToken: 'buyer_xyz',
    checkInTime: new Date().toISOString(),
    presenceProof: {
      method: 'geo_time',
      lat: 34.0522,
      lng: -118.2437,
      matchedBy: 'explicit'
    }
  })
  
  assert.strictEqual(attendance.occurrenceId, null, 'Attendance without occurrenceId should default to null')
  
  // Store feedback without occurrenceId
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Nice property',
      disliked: null,
      wantsSimilar: false
    },
    occurrenceId: attendance.occurrenceId || null
  })
  
  assert.strictEqual(feedback.occurrenceId, null, 'Feedback should have null occurrenceId when attendance lacks it')
})

test('normalizeFeedbackText: trim whitespace', () => {
  assert.strictEqual(normalizeFeedbackText('  hello world  '), 'hello world')
  assert.strictEqual(normalizeFeedbackText('\n\ttest\n'), 'test')
  assert.strictEqual(normalizeFeedbackText('   multiple   spaces   '), 'multiple   spaces')
})

test('normalizeFeedbackText: empty or whitespace-only becomes null', () => {
  assert.strictEqual(normalizeFeedbackText(''), null)
  assert.strictEqual(normalizeFeedbackText('   '), null)
  assert.strictEqual(normalizeFeedbackText('\n\t  \n'), null)
  assert.strictEqual(normalizeFeedbackText('\r\n'), null)
})

test('normalizeFeedbackText: cap at 500 characters', () => {
  const longText = 'a'.repeat(600)
  const normalized = normalizeFeedbackText(longText)
  assert.strictEqual(normalized.length, 500)
  assert.strictEqual(normalized, 'a'.repeat(500))
})

test('normalizeFeedbackText: non-string input becomes null', () => {
  assert.strictEqual(normalizeFeedbackText(null), null)
  assert.strictEqual(normalizeFeedbackText(undefined), null)
  assert.strictEqual(normalizeFeedbackText(123), null)
  assert.strictEqual(normalizeFeedbackText({}), null)
  assert.strictEqual(normalizeFeedbackText([]), null)
})

test('storeFeedback accepts normalized string | null for liked and disliked', async () => {
  clearIntelligence()
  
  const attendance = await storeAttendance({
    eventId: 'evt_test_789',
    buyerToken: 'buyer_test',
    checkInTime: new Date().toISOString(),
    presenceProof: {
      method: 'geo_time',
      lat: 34.0522,
      lng: -118.2437,
      matchedBy: 'explicit'
    }
  })
  
  // Store feedback with normalized text fields
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Beautiful garden',
      disliked: null,  // null is valid
      wantsSimilar: true
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.liked, 'Beautiful garden')
  assert.strictEqual(feedback.answers.disliked, null)
  assert.strictEqual(feedback.answers.wantsSimilar, true)
})

test('storeFeedback handles both text fields as null', async () => {
  clearIntelligence()
  
  const attendance = await storeAttendance({
    eventId: 'evt_test_999',
    buyerToken: 'buyer_null',
    checkInTime: new Date().toISOString(),
    presenceProof: {
      method: 'geo_time',
      lat: 34.0522,
      lng: -118.2437,
      matchedBy: 'explicit'
    }
  })
  
  // Store feedback with both text fields as null
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: null,
      disliked: null,
      wantsSimilar: false
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.liked, null)
  assert.strictEqual(feedback.answers.disliked, null)
  assert.strictEqual(feedback.answers.wantsSimilar, false)
})
