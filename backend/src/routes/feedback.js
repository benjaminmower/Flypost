import express from 'express'
import rateLimit from 'express-rate-limit'

const router = express.Router()

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Too many event submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const FEEDBACK_RECENCY_THRESHOLD_HOURS = parseFloat(process.env.FEEDBACK_RECENCY_THRESHOLD_HOURS || '4')
const FEEDBACK_RECENCY_THRESHOLD_MS = FEEDBACK_RECENCY_THRESHOLD_HOURS * 60 * 60 * 1000

function normalizeFeedbackText(text) {
  if (typeof text !== 'string') {
    return null
  }

  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return null
  }

  return trimmed.substring(0, 500)
}

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

router.post('/submit', writeLimiter, async (req, res) => {
  try {
    const { attendanceId, eventId, buyerToken, answers, brokerageAffiliation } = req.body

    if (!answers) {
      return res.status(400).json({
        success: false,
        error: 'answers object is required'
      })
    }

    const {
      findAttendanceById,
      findAttendanceByEventAndBuyer,
      storeFeedback
    } = await import('../intelligenceStorage.js')

    let attendance = null

    if (attendanceId) {
      attendance = await findAttendanceById(attendanceId)
    } else if (eventId && buyerToken) {
      const records = await findAttendanceByEventAndBuyer(eventId, buyerToken)
      if (records.length > 0) {
        attendance = records.sort((a, b) =>
          new Date(b.checkInTime) - new Date(a.checkInTime)
        )[0]
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either attendanceId or (eventId + buyerToken) is required'
      })
    }

    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: 'No attendance record found',
        hint: 'You must check in at the event before submitting feedback'
      })
    }

    // Enforce presence gate: attendance must be recent
    const checkInTime = new Date(attendance.checkInTime)
    const now = new Date()
    const timeSinceCheckIn = now - checkInTime

    if (timeSinceCheckIn > FEEDBACK_RECENCY_THRESHOLD_MS) {
      return res.status(403).json({
        success: false,
        error: `Attendance record is too old (must be within ${FEEDBACK_RECENCY_THRESHOLD_HOURS} hours)`,
        checkInTime: attendance.checkInTime,
        hoursAgo: Math.round(timeSinceCheckIn / (60 * 60 * 1000))
      })
    }

    const normalizedDifferent = normalizeFeedbackText(answers.different)
    const normalizedWouldBuy = normalizeWouldBuy(answers.wouldBuy)

    const feedback = await storeFeedback({
      attendanceId: attendance.attendanceId,
      eventId: attendance.eventId,
      answers: {
        different: normalizedDifferent,
        wouldBuy: normalizedWouldBuy
      },
      brokerageAffiliation: brokerageAffiliation || null,
      occurrenceId: attendance.occurrenceId || null
    })

    res.json({
      success: true,
      feedback: {
        feedbackId: feedback.feedbackId,
        eventId: feedback.eventId,
        createdAt: feedback.createdAt,
        occurrenceId: feedback.occurrenceId
      }
    })
  } catch (error) {
    console.error('❌ Feedback submission error:', error)
    res.status(500).json({
      success: false,
      error: 'Feedback submission failed',
      details: error.message
    })
  }
})

export default router
