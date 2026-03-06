/*
 * Test: Feedback wouldBuy field validation and backward compatibility
 * 
 * Hermetic tests (no API keys, no network) using node:test
 * Run with: node --test test-feedback-wouldBuy.js
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { 
  storeAttendance, 
  storeFeedback,
  clearIntelligence
} from './src/intelligenceStorage.js'

// Helper: Normalize wouldBuy field (duplicated from server.js for testing)
function normalizeWouldBuy(value) {
  if (value === null || value === undefined) {
    return null
  }
  
  if (typeof value !== 'string') {
    return null
  }
  
  const normalized = value.toLowerCase().trim()
  
  if (normalized === 'yes' || normalized === 'maybe' || normalized === 'no') {
    return normalized
  }
  
  return null
}

test('normalizeWouldBuy: valid values are accepted', () => {
  assert.strictEqual(normalizeWouldBuy('yes'), 'yes')
  assert.strictEqual(normalizeWouldBuy('maybe'), 'maybe')
  assert.strictEqual(normalizeWouldBuy('no'), 'no')
})

test('normalizeWouldBuy: case insensitive', () => {
  assert.strictEqual(normalizeWouldBuy('YES'), 'yes')
  assert.strictEqual(normalizeWouldBuy('Maybe'), 'maybe')
  assert.strictEqual(normalizeWouldBuy('NO'), 'no')
  assert.strictEqual(normalizeWouldBuy('YeS'), 'yes')
})

test('normalizeWouldBuy: trims whitespace', () => {
  assert.strictEqual(normalizeWouldBuy('  yes  '), 'yes')
  assert.strictEqual(normalizeWouldBuy('\nmaybe\t'), 'maybe')
  assert.strictEqual(normalizeWouldBuy('  no'), 'no')
})

test('normalizeWouldBuy: invalid values become null', () => {
  assert.strictEqual(normalizeWouldBuy('invalid'), null)
  assert.strictEqual(normalizeWouldBuy('true'), null)
  assert.strictEqual(normalizeWouldBuy('false'), null)
  assert.strictEqual(normalizeWouldBuy(''), null)
  assert.strictEqual(normalizeWouldBuy('yess'), null)
})

test('normalizeWouldBuy: non-string types become null', () => {
  assert.strictEqual(normalizeWouldBuy(null), null)
  assert.strictEqual(normalizeWouldBuy(undefined), null)
  assert.strictEqual(normalizeWouldBuy(123), null)
  assert.strictEqual(normalizeWouldBuy(true), null)
  assert.strictEqual(normalizeWouldBuy({}), null)
  assert.strictEqual(normalizeWouldBuy([]), null)
})

test('storeFeedback: accepts wouldBuy field with valid values', async () => {
  clearIntelligence()
  
  const attendance = await storeAttendance({
    eventId: 'evt_test_123',
    buyerToken: 'buyer_abc',
    checkInTime: new Date().toISOString(),
    presenceProof: {
      method: 'geo_time',
      lat: 34.0522,
      lng: -118.2437,
      matchedBy: 'explicit'
    }
  })
  
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Great location',
      disliked: 'Small kitchen',
      wantsSimilar: true,
      wouldBuy: 'yes'
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.wouldBuy, 'yes')
  assert.strictEqual(feedback.answers.wantsSimilar, true)
})

test('storeFeedback: accepts wouldBuy "maybe"', async () => {
  clearIntelligence()
  
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
  
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: null,
      disliked: 'Too expensive',
      wantsSimilar: false,
      wouldBuy: 'maybe'
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.wouldBuy, 'maybe')
  assert.strictEqual(feedback.answers.wantsSimilar, false)
})

test('storeFeedback: accepts wouldBuy "no"', async () => {
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
  
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Nice yard',
      disliked: 'Wrong neighborhood',
      wantsSimilar: null,
      wouldBuy: 'no'
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.wouldBuy, 'no')
  assert.strictEqual(feedback.answers.wantsSimilar, null)
})

test('storeFeedback: backward compatibility - accepts only wantsSimilar', async () => {
  clearIntelligence()
  
  const attendance = await storeAttendance({
    eventId: 'evt_legacy_001',
    buyerToken: 'buyer_legacy',
    checkInTime: new Date().toISOString(),
    presenceProof: {
      method: 'geo_time',
      lat: 34.0522,
      lng: -118.2437,
      matchedBy: 'explicit'
    }
  })
  
  // Legacy feedback submission (no wouldBuy field)
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Great property',
      disliked: null,
      wantsSimilar: true
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.wantsSimilar, true)
  assert.strictEqual(feedback.answers.wouldBuy, undefined)
})

test('storeFeedback: accepts null wouldBuy', async () => {
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
  
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: 'Nice place',
      disliked: null,
      wantsSimilar: false,
      wouldBuy: null
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.wouldBuy, null)
  assert.strictEqual(feedback.answers.wantsSimilar, false)
})

test('storeFeedback: accepts both fields with mixed null values', async () => {
  clearIntelligence()
  
  const attendance = await storeAttendance({
    eventId: 'evt_mixed_001',
    buyerToken: 'buyer_mixed',
    checkInTime: new Date().toISOString(),
    presenceProof: {
      method: 'geo_time',
      lat: 34.0522,
      lng: -118.2437,
      matchedBy: 'explicit'
    }
  })
  
  const feedback = await storeFeedback({
    attendanceId: attendance.attendanceId,
    eventId: attendance.eventId,
    answers: {
      liked: null,
      disliked: null,
      wantsSimilar: null,
      wouldBuy: 'yes'
    },
    occurrenceId: null
  })
  
  assert.strictEqual(feedback.answers.wouldBuy, 'yes')
  assert.strictEqual(feedback.answers.wantsSimilar, null)
})
