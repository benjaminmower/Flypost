import express from 'express'
import rateLimit from 'express-rate-limit'
import { getEventsNear, getEventByIdAny } from '../storage.js'
import { isFirestoreEnabled } from '../firestoreClient.js'

const router = express.Router()

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Too many event submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const PRESENCE_RADIUS_KM = parseFloat(process.env.PRESENCE_RADIUS_KM || '0.1')

function logCheckInFailure(reason, { eventId, submittedLat, submittedLng, eventLat, eventLng, distanceMeters, eventStart, eventEnd, submittedTimestamp } = {}) {
  console.error(JSON.stringify({
    type: 'PRESENCE_CHECK_IN_FAILURE',
    reason,
    eventId: eventId ?? null,
    submitted: { lat: submittedLat ?? null, lng: submittedLng ?? null },
    expected: { lat: eventLat ?? null, lng: eventLng ?? null },
    distanceMeters: distanceMeters ?? null,
    activeWindow: { start: eventStart ?? null, end: eventEnd ?? null },
    submittedTimestamp: submittedTimestamp ?? null,
    serverTime: new Date().toISOString(),
  }))
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180)
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

router.post('/check-in', writeLimiter, async (req, res) => {
  try {
    const { eventId, lat, lng, buyerToken, method, timestamp } = req.body

    if (!buyerToken) {
      logCheckInFailure('MISSING_BUYER_TOKEN', { eventId, submittedTimestamp: timestamp })
      return res.status(400).json({
        success: false,
        error: 'buyerToken is required'
      })
    }

    const latNum = Number(lat)
    const lngNum = Number(lng)

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      logCheckInFailure('INVALID_COORDINATES', { eventId, submittedLat: latNum, submittedLng: lngNum, submittedTimestamp: timestamp })
      return res.status(400).json({
        success: false,
        error: 'lat and lng are required for presence verification'
      })
    }

    let targetEventId = eventId
    let matchedBy = 'explicit'
    let matchedEvent = null

    // If no eventId provided, find nearest event
    if (!targetEventId) {
      const useFirestore = isFirestoreEnabled()
      const nearbyEvents = await getEventsNear(
        latNum,
        lngNum,
        PRESENCE_RADIUS_KM,
        useFirestore
      )

      if (!nearbyEvents || nearbyEvents.length === 0) {
        logCheckInFailure('NO_NEARBY_EVENT', { submittedLat: latNum, submittedLng: lngNum, submittedTimestamp: timestamp })
        return res.status(404).json({
          success: false,
          error: 'No events found within proximity for check-in',
          hint: 'Make sure you are at the event location'
        })
      }

      matchedEvent = nearbyEvents[0]
      targetEventId = matchedEvent.flypost.eventId
      matchedBy = 'nearest'
      console.log(`📍 Matched nearest event: ${targetEventId}`)
    } else {
      const useFirestore = isFirestoreEnabled()
      try {
        matchedEvent = await getEventByIdAny(targetEventId, useFirestore)
        if (!matchedEvent) {
          logCheckInFailure('EVENT_NOT_FOUND', { eventId: targetEventId, submittedLat: latNum, submittedLng: lngNum, submittedTimestamp: timestamp })
          return res.status(404).json({
            success: false,
            error: 'Event not found',
            eventId: targetEventId
          })
        }
      } catch (error) {
        console.error('❌ Error fetching event for distance check:', error)
        logCheckInFailure('EVENT_FETCH_ERROR', { eventId: targetEventId, submittedLat: latNum, submittedLng: lngNum, submittedTimestamp: timestamp })
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch event for validation',
          details: error.message
        })
      }
    }

    // STRICT TIME GATING: Validate check-in is within event time window
    const now = new Date()

    let matchedOccurrenceId = null
    let eventStart, eventEnd

    if (matchedEvent.occurrences && matchedEvent.occurrences.length > 0) {
      console.log(`📅 Event has ${matchedEvent.occurrences.length} occurrences - checking for active window`)

      const activeOccurrences = matchedEvent.occurrences.filter(occ => {
        try {
          const occStart = new Date(occ.startDate)
          const occEnd = new Date(occ.endDate)

          if (isNaN(occStart.getTime()) || isNaN(occEnd.getTime())) {
            console.warn(`⚠️  Invalid occurrence dates for ${occ.occurrenceId}`)
            return false
          }

          return now >= occStart && now <= occEnd
        } catch (error) {
          console.warn(`⚠️  Error checking occurrence ${occ.occurrenceId}:`, error.message)
          return false
        }
      })

      if (activeOccurrences.length === 0) {
        console.log(`⏰ Check-in rejected: No active occurrence windows for event ${targetEventId}`)

        const upcomingOccurrences = matchedEvent.occurrences
          .filter(occ => {
            try {
              const occStart = new Date(occ.startDate)
              return occStart > now
            } catch {
              return false
            }
          })
          .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))

        const nextOcc = upcomingOccurrences[0]

        logCheckInFailure('EVENT_NOT_ACTIVE', {
          eventId: targetEventId,
          submittedLat: latNum,
          submittedLng: lngNum,
          eventStart: matchedEvent.occurrences.map(o => o.startDate).join(', '),
          eventEnd: matchedEvent.occurrences.map(o => o.endDate).join(', '),
          submittedTimestamp: timestamp,
        })
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_ACTIVE',
          message: nextOcc
            ? `This event is not currently active. Next occurrence starts at ${nextOcc.startDate}.`
            : 'This event has no active or upcoming occurrences.',
          occurrences: matchedEvent.occurrences.map(occ => ({
            startDate: occ.startDate,
            endDate: occ.endDate,
            label: occ.label
          }))
        })
      }

      const selectedOcc = activeOccurrences.sort((a, b) =>
        new Date(a.endDate) - new Date(b.endDate)
      )[0]

      matchedOccurrenceId = selectedOcc.occurrenceId
      eventStart = new Date(selectedOcc.startDate)
      eventEnd = new Date(selectedOcc.endDate)

      console.log(`✅ Matched active occurrence: ${matchedOccurrenceId} (${selectedOcc.startDate} - ${selectedOcc.endDate})`)

    } else {
      // Fallback to top-level startDate/endDate
      if (!matchedEvent.startDate) {
        console.error(`❌ Event ${targetEventId} missing startDate (cannot time-gate)`)
        logCheckInFailure('EVENT_NOT_TIME_GATABLE', { eventId: targetEventId, submittedLat: latNum, submittedLng: lngNum, submittedTimestamp: timestamp })
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_TIME_GATABLE',
          message: 'This event is missing startDate and cannot be checked into.'
        })
      }

      if (!matchedEvent.endDate) {
        console.error(`❌ Event ${targetEventId} missing endDate (cannot time-gate)`)
        logCheckInFailure('EVENT_NOT_TIME_GATABLE', { eventId: targetEventId, submittedLat: latNum, submittedLng: lngNum, submittedTimestamp: timestamp })
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_TIME_GATABLE',
          message: 'This event is missing endDate and cannot be checked into.'
        })
      }

      try {
        eventStart = new Date(matchedEvent.startDate)
        eventEnd = new Date(matchedEvent.endDate)

        if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) {
          throw new Error('Invalid date format')
        }
      } catch (error) {
        console.error(`❌ Failed to parse event times for ${targetEventId}:`, error.message)
        logCheckInFailure('INVALID_EVENT_TIME_DATA', { eventId: targetEventId, submittedLat: latNum, submittedLng: lngNum, submittedTimestamp: timestamp })
        return res.status(500).json({
          success: false,
          error: 'Invalid event time data',
          message: 'Event has malformed time information.'
        })
      }

      if (now < eventStart) {
        const minutesUntilStart = Math.round((eventStart - now) / 60000)
        console.log(`⏰ Check-in rejected: Event ${targetEventId} has not started yet (starts in ${minutesUntilStart} minutes)`)
        logCheckInFailure('EVENT_NOT_STARTED', {
          eventId: targetEventId,
          submittedLat: latNum,
          submittedLng: lngNum,
          eventStart: matchedEvent.startDate,
          eventEnd: matchedEvent.endDate,
          submittedTimestamp: timestamp,
        })
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_STARTED',
          message: 'This event has not started yet.',
          eventStart: matchedEvent.startDate,
          eventEnd: matchedEvent.endDate
        })
      }

      if (now > eventEnd) {
        const minutesSinceEnd = Math.round((now - eventEnd) / 60000)
        console.log(`⏰ Check-in rejected: Event ${targetEventId} has already ended (ended ${minutesSinceEnd} minutes ago)`)
        logCheckInFailure('EVENT_ALREADY_ENDED', {
          eventId: targetEventId,
          submittedLat: latNum,
          submittedLng: lngNum,
          eventStart: matchedEvent.startDate,
          eventEnd: matchedEvent.endDate,
          submittedTimestamp: timestamp,
        })
        return res.status(400).json({
          success: false,
          error: 'EVENT_ALREADY_ENDED',
          message: 'This event has already ended.',
          eventStart: matchedEvent.startDate,
          eventEnd: matchedEvent.endDate
        })
      }

      console.log(`✅ Time gate passed: Event ${targetEventId} is active (${eventStart.toISOString()} - ${eventEnd.toISOString()})`)
    }

    // STRICT DISTANCE CHECK: Validate proximity to event location
    let eventLat = null
    let eventLng = null

    if (
      matchedEvent.location?.geo?.latitude &&
      matchedEvent.location?.geo?.longitude
    ) {
      eventLat = matchedEvent.location.geo.latitude
      eventLng = matchedEvent.location.geo.longitude
    } else if (
      matchedEvent.flypost?.geo?.latitude &&
      matchedEvent.flypost?.geo?.longitude
    ) {
      eventLat = matchedEvent.flypost.geo.latitude
      eventLng = matchedEvent.flypost.geo.longitude
    }

    if (eventLat !== null && eventLng !== null) {
      const actualDistanceKm = distanceKm(latNum, lngNum, eventLat, eventLng)
      const actualDistanceMeters = Math.round(actualDistanceKm * 1000)
      const thresholdMeters = Math.round(PRESENCE_RADIUS_KM * 1000)

      console.log(
        `📏 Distance check: ${actualDistanceMeters}m (threshold: ${thresholdMeters}m) for event ${targetEventId}`
      )

      if (actualDistanceKm > PRESENCE_RADIUS_KM) {
        logCheckInFailure('TOO_FAR_FROM_EVENT', {
          eventId: targetEventId,
          submittedLat: latNum,
          submittedLng: lngNum,
          eventLat,
          eventLng,
          distanceMeters: actualDistanceMeters,
          eventStart: eventStart?.toISOString() ?? null,
          eventEnd: eventEnd?.toISOString() ?? null,
          submittedTimestamp: timestamp,
        })
        return res.status(404).json({
          success: false,
          error: 'No events found within proximity for check-in',
          hint: 'Move closer to the event location and try again'
        })
      }
    } else {
      console.warn(
        `⚠️  Event ${targetEventId} has no geo coordinates; skipping distance validation`
      )
    }

    // Create attendance record
    const { storeAttendance } = await import('../intelligenceStorage.js')

    const attendanceData = {
      eventId: targetEventId,
      buyerToken,
      checkInTime: timestamp || new Date().toISOString(),
      presenceProof: {
        method: method || 'geo_time',
        matchedBy
      }
    }

    if (matchedOccurrenceId) {
      attendanceData.occurrenceId = matchedOccurrenceId
      attendanceData.presenceProof.occurrenceId = matchedOccurrenceId
    }

    const attendance = await storeAttendance(attendanceData)

    const response = {
      success: true,
      attendance: {
        attendanceId: attendance.attendanceId,
        eventId: attendance.eventId,
        checkInTime: attendance.checkInTime,
        matchedBy
      }
    }

    if (matchedOccurrenceId) {
      response.attendance.occurrenceId = matchedOccurrenceId
    }

    const addressParts = [
      matchedEvent.location?.address?.streetAddress,
      matchedEvent.location?.address?.addressLocality,
      matchedEvent.location?.address?.addressRegion,
      matchedEvent.location?.address?.postalCode,
    ].filter(Boolean)

    response.event = {
      address: addressParts.length > 0 ? addressParts.join(', ') : undefined,
      ...(matchedEvent.name ? { name: matchedEvent.name } : {}),
      ...(matchedEvent.flypost?.heroImageUrl ? { heroImageUrl: matchedEvent.flypost.heroImageUrl } : {}),
    }

    res.json(response)
  } catch (error) {
    console.error('❌ Check-in error:', error)
    res.status(500).json({
      success: false,
      error: 'Check-in failed',
      details: error.message
    })
  }
})

export default router
