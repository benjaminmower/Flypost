/* v1
 * Time Normalization Utility for Flypost v4
 * 
 * Handles timestamp normalization with timezone-aware interpretation.
 * Implements the explicit override rule for open-houses category.
 */

import crypto from 'crypto'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { parseISO } from 'date-fns'
import { isoTimestampHasExplicitTz } from './timezone.js'

/**
 * Strip timezone info from ISO timestamp and reinterpret in a different timezone
 * 
 * This function takes a timestamp (which may have Z or an offset) and treats it
 * as a "wall clock" time in the target timezone, then converts to UTC.
 * 
 * Example: "2025-01-15T14:00:00Z" with targetTimezone "America/Los_Angeles"
 *   -> Interpret as 2:00 PM Pacific time -> Convert to UTC
 * 
 * @param {string} isoTimestamp - ISO 8601 timestamp (may include Z or offset)
 * @param {string} targetTimezone - IANA timezone (e.g., "America/Los_Angeles")
 * @returns {string} UTC ISO timestamp
 */
export function reinterpretTimestampInTimezone(isoTimestamp, targetTimezone) {
  if (!isoTimestamp || !targetTimezone) {
    return isoTimestamp
  }

  try {
    // Extract date/time components (ignore any timezone info)
    // Match: YYYY-MM-DDTHH:MM:SS with optional milliseconds and timezone
    const match = isoTimestamp.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([.]\d{1,9})?/)
    if (!match) {
      console.warn(`⚠️  Could not parse timestamp for reinterpretation: ${isoTimestamp}`)
      return isoTimestamp
    }

    const dateTimeStr = match[1]
    const millisStr = match[2] || '.000'
    const wallClockStr = dateTimeStr + millisStr

    // Parse as if this is wall-clock time (no timezone)
    const wallClockDate = parseISO(wallClockStr)
    
    // Interpret this wall-clock time as being in the target timezone
    // and convert to UTC using fromZonedTime (which treats input as local to timezone)
    const utcDate = fromZonedTime(wallClockDate, targetTimezone)
    
    // Return as ISO string
    return utcDate.toISOString()
    
  } catch (error) {
    console.error(`❌ Error reinterpreting timestamp in timezone:`, error.message)
    return isoTimestamp
  }
}

/**
 * Normalize timestamps for open-houses based on explicit timezone rule
 * 
 * @param {object} event - Parsed event object
 * @param {boolean} hasExplicitTz - Whether raw input had explicit timezone markers
 * @param {string} inferredTimezone - IANA timezone inferred from location
 * @returns {object} Event with normalized timestamps
 */
export function normalizeOpenHouseTimestamps(event, hasExplicitTz, inferredTimezone) {
  // If explicit timezone in input, honor timestamps as-is
  if (hasExplicitTz) {
    console.log('✅ Explicit timezone detected in input - honoring timestamps as-is')
    return event
  }

  // If no explicit timezone, reinterpret timestamps as local wall-clock time
  // BUT: only reinterpret timestamps that are timezone-ambiguous
  // If a timestamp already has Z or offset, skip reinterpretation
  if (!inferredTimezone) {
    console.warn('⚠️  No timezone inferred - cannot reinterpret timestamps')
    return event
  }

  console.log(`🕐 No explicit timezone in raw input - reinterpreting ambiguous timestamps as local time in ${inferredTimezone}`)
  
  // Reinterpret top-level timestamps (only if ambiguous)
  if (event.startDate) {
    if (isoTimestampHasExplicitTz(event.startDate)) {
      console.log(`  startDate: ${event.startDate} - has explicit TZ, skipping reinterpretation`)
    } else {
      const originalStart = event.startDate
      event.startDate = reinterpretTimestampInTimezone(event.startDate, inferredTimezone)
      console.log(`  startDate: ${originalStart} → ${event.startDate} (as ${inferredTimezone} local)`)
    }
  }
  
  if (event.endDate) {
    if (isoTimestampHasExplicitTz(event.endDate)) {
      console.log(`  endDate: ${event.endDate} - has explicit TZ, skipping reinterpretation`)
    } else {
      const originalEnd = event.endDate
      event.endDate = reinterpretTimestampInTimezone(event.endDate, inferredTimezone)
      console.log(`  endDate: ${originalEnd} → ${event.endDate} (as ${inferredTimezone} local)`)
    }
  }

  // Reinterpret occurrences timestamps if present (only if ambiguous)
  if (event.occurrences && Array.isArray(event.occurrences)) {
    for (const occ of event.occurrences) {
      if (occ.startDate) {
        if (isoTimestampHasExplicitTz(occ.startDate)) {
          console.log(`  occurrence startDate: ${occ.startDate} - has explicit TZ, skipping reinterpretation`)
        } else {
          const originalStart = occ.startDate
          occ.startDate = reinterpretTimestampInTimezone(occ.startDate, inferredTimezone)
          console.log(`  occurrence startDate: ${originalStart} → ${occ.startDate}`)
        }
      }
      if (occ.endDate) {
        if (isoTimestampHasExplicitTz(occ.endDate)) {
          console.log(`  occurrence endDate: ${occ.endDate} - has explicit TZ, skipping reinterpretation`)
        } else {
          const originalEnd = occ.endDate
          occ.endDate = reinterpretTimestampInTimezone(occ.endDate, inferredTimezone)
          console.log(`  occurrence endDate: ${originalEnd} → ${occ.endDate}`)
        }
      }
    }
  }

  return event
}

/**
 * Generate a stable occurrence ID using SHA-1 hash
 * 
 * @param {string} canonicalKey - Event canonical key
 * @param {string} startDateUTC - Start date in UTC ISO format
 * @param {string} endDateUTC - End date in UTC ISO format
 * @returns {string} Stable occurrence ID (e.g., "occ_a1b2c3d4e5f6")
 */
export function generateOccurrenceId(canonicalKey, startDateUTC, endDateUTC) {
  const input = `${canonicalKey}|${startDateUTC}|${endDateUTC}`
  const hash = crypto.createHash('sha1').update(input).digest('hex')
  return `occ_${hash.substring(0, 16)}`
}

/**
 * Select the next upcoming occurrence, or most recent past if all are past
 * 
 * @param {Array} occurrences - Array of occurrence objects with startDate/endDate
 * @param {Date} now - Current server time (defaults to Date.now())
 * @returns {object|null} Selected occurrence or null if array is empty
 */
export function selectUpcomingOccurrence(occurrences, now = new Date()) {
  if (!occurrences || occurrences.length === 0) {
    return null
  }

  const nowMs = now.getTime()
  
  // Find the next upcoming occurrence (startDate in future)
  const upcoming = occurrences
    .filter(occ => {
      const start = new Date(occ.startDate)
      return start.getTime() > nowMs
    })
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
  
  if (upcoming.length > 0) {
    return upcoming[0]
  }

  // All occurrences are in the past - return the most recent
  const past = occurrences
    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
  
  return past[0]
}

/**
 * Validate that endDate is present for open-houses category
 * 
 * @param {object} event - Event object
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateOpenHouseEndDate(event) {
  if (event.flypost?.category !== 'open-houses') {
    return { valid: true }
  }

  // Check for endDate on occurrences or top-level
  if (event.occurrences && event.occurrences.length > 0) {
    // Validate each occurrence has endDate
    for (const occ of event.occurrences) {
      if (!occ.endDate) {
        return {
          valid: false,
          error: 'Each occurrence must have an endDate. Please include end times for all time slots (e.g., "11am-1pm, 2pm-4pm").'
        }
      }
    }
    return { valid: true }
  }

  // Check top-level endDate
  if (!event.endDate) {
    return {
      valid: false,
      error: 'Open houses require an end time. Please include an end time (e.g., "11am-1pm").'
    }
  }

  return { valid: true }
}

/**
 * Convert local intent (date + time) to UTC timestamp using timezone
 * 
 * @param {string} localDate - Local date in YYYY-MM-DD format (e.g., "2026-01-19")
 * @param {string} localTime - Local time in HH:mm format (e.g., "14:00")
 * @param {string} timezone - IANA timezone (e.g., "America/Los_Angeles")
 * @returns {string} UTC ISO timestamp
 */
export function localIntentToUTC(localDate, localTime, timezone) {
  if (!localDate || !localTime || !timezone) {
    throw new Error('localDate, localTime, and timezone are required')
  }

  // Validate formats
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error(`Invalid date format: ${localDate} (expected YYYY-MM-DD)`)
  }
  if (!/^\d{2}:\d{2}$/.test(localTime)) {
    throw new Error(`Invalid time format: ${localTime} (expected HH:mm)`)
  }

  try {
    // Combine date and time into local wall-clock string
    const wallClockStr = `${localDate}T${localTime}:00.000`
    
    // Parse as if this is wall-clock time (no timezone)
    const wallClockDate = parseISO(wallClockStr)
    
    if (isNaN(wallClockDate.getTime())) {
      throw new Error(`Invalid date/time combination: ${wallClockStr}`)
    }
    
    // Interpret this wall-clock time as being in the target timezone
    // and convert to UTC using fromZonedTime (which treats input as local to timezone)
    const utcDate = fromZonedTime(wallClockDate, timezone)
    
    // Return as ISO string
    return utcDate.toISOString()
    
  } catch (error) {
    throw new Error(`Failed to convert local intent to UTC: ${error.message}`)
  }
}

/**
 * Validate and convert open-house local intent to canonical UTC timestamps
 * 
 * For open-houses category, converts occurrences[].local.* to canonical UTC
 * timestamps in occurrences[].startDate and occurrences[].endDate.
 * 
 * @param {object} event - Event object with occurrences[].local intent
 * @param {string} timezone - IANA timezone for conversion
 * @returns {object} Event with canonical UTC timestamps
 * @throws {Error} If validation fails or conversion fails
 */
export function convertOpenHouseLocalIntent(event, timezone) {
  // Only applies to open-houses category
  if (event.flypost?.category !== 'open-houses') {
    return event
  }

  // Validate timezone
  if (!timezone) {
    const error = new Error('TIMEZONE_INFERENCE_FAILED')
    error.code = 'TIMEZONE_INFERENCE_FAILED'
    error.message = 'Cannot infer timezone from geo coordinates'
    throw error
  }

  // Validate occurrences array exists
  if (!event.occurrences || !Array.isArray(event.occurrences) || event.occurrences.length === 0) {
    const error = new Error('INVALID_OPEN_HOUSE_LOCAL_INTENT')
    error.code = 'INVALID_OPEN_HOUSE_LOCAL_INTENT'
    error.message = 'Open houses require occurrences with local intent (local.date, local.startTime, local.endTime)'
    throw error
  }

  console.log(`🕐 Converting ${event.occurrences.length} open-house occurrences from local intent to UTC (timezone: ${timezone})`)

  // Process each occurrence
  for (let i = 0; i < event.occurrences.length; i++) {
    const occ = event.occurrences[i]
    
    // Validate local intent exists
    if (!occ.local || !occ.local.date || !occ.local.startTime || !occ.local.endTime) {
      const error = new Error('INVALID_OPEN_HOUSE_LOCAL_INTENT')
      error.code = 'INVALID_OPEN_HOUSE_LOCAL_INTENT'
      error.message = `Occurrence ${i + 1} missing local intent (local.date, local.startTime, local.endTime required)`
      throw error
    }

    const { date, startTime, endTime } = occ.local

    // Validate formats
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const error = new Error('INVALID_LOCAL_TIME_RANGE')
      error.code = 'INVALID_LOCAL_TIME_RANGE'
      error.message = `Occurrence ${i + 1} has invalid date format: ${date} (expected YYYY-MM-DD)`
      throw error
    }
    if (!/^\d{2}:\d{2}$/.test(startTime)) {
      const error = new Error('INVALID_LOCAL_TIME_RANGE')
      error.code = 'INVALID_LOCAL_TIME_RANGE'
      error.message = `Occurrence ${i + 1} has invalid startTime format: ${startTime} (expected HH:mm)`
      throw error
    }
    if (!/^\d{2}:\d{2}$/.test(endTime)) {
      const error = new Error('INVALID_LOCAL_TIME_RANGE')
      error.code = 'INVALID_LOCAL_TIME_RANGE'
      error.message = `Occurrence ${i + 1} has invalid endTime format: ${endTime} (expected HH:mm)`
      throw error
    }

    try {
      // Convert start time to UTC
      const startDateUTC = localIntentToUTC(date, startTime, timezone)
      
      // Handle cross-midnight: if endTime < startTime, end is next day
      let endDate = date
      const [startHour, startMin] = startTime.split(':').map(Number)
      const [endHour, endMin] = endTime.split(':').map(Number)
      
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      
      if (endMinutes < startMinutes) {
        // Cross-midnight: add one day to end date
        const dateParts = date.split('-').map(Number)
        const nextDay = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]))
        nextDay.setUTCDate(nextDay.getUTCDate() + 1)
        endDate = nextDay.toISOString().split('T')[0]
        console.log(`  🌙 Cross-midnight detected for occurrence ${i + 1}: endTime ${endTime} on ${endDate}`)
      }
      
      const endDateUTC = localIntentToUTC(endDate, endTime, timezone)
      
      // Overwrite startDate and endDate with canonical UTC
      occ.startDate = startDateUTC
      occ.endDate = endDateUTC
      
      console.log(`  ✅ Occurrence ${i + 1}: ${date} ${startTime}-${endTime} (${timezone}) → ${startDateUTC} - ${endDateUTC}`)
      
    } catch (error) {
      const err = new Error('INVALID_LOCAL_TIME_RANGE')
      err.code = 'INVALID_LOCAL_TIME_RANGE'
      err.message = `Occurrence ${i + 1} conversion failed: ${error.message}`
      throw err
    }
  }

  // Set top-level startDate/endDate to next upcoming occurrence
  const selectedOcc = selectUpcomingOccurrence(event.occurrences)
  if (selectedOcc) {
    event.startDate = selectedOcc.startDate
    event.endDate = selectedOcc.endDate
    console.log(`  📅 Set top-level dates to upcoming occurrence: ${selectedOcc.startDate} - ${selectedOcc.endDate}`)
  } else {
    // Fallback to first occurrence if all are past
    event.startDate = event.occurrences[0].startDate
    event.endDate = event.occurrences[0].endDate
    console.log(`  📅 Set top-level dates to first occurrence: ${event.startDate} - ${event.endDate}`)
  }

  // Mark event with time normalization version
  event.flypost = event.flypost || {}
  event.flypost.timeNormalizationVersion = 'local_intent_v1'
  
  console.log(`✅ Open-house local intent conversion complete (timeNormalizationVersion: local_intent_v1)`)

  return event
}
