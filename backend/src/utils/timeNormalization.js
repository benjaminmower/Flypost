/* v1
 * Time Normalization Utility for Flypost v4
 * 
 * Handles timestamp normalization with timezone-aware interpretation.
 * Implements the explicit override rule for open-houses category.
 */

import crypto from 'crypto'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { parseISO } from 'date-fns'

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
    const match = isoTimestamp.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([.]\d{3})?/)
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
  if (!inferredTimezone) {
    console.warn('⚠️  No timezone inferred - cannot reinterpret timestamps')
    return event
  }

  console.log(`🕐 No explicit timezone - reinterpreting timestamps as local time in ${inferredTimezone}`)
  
  // Reinterpret top-level timestamps
  if (event.startDate) {
    const originalStart = event.startDate
    event.startDate = reinterpretTimestampInTimezone(event.startDate, inferredTimezone)
    console.log(`  startDate: ${originalStart} → ${event.startDate} (as ${inferredTimezone} local)`)
  }
  
  if (event.endDate) {
    const originalEnd = event.endDate
    event.endDate = reinterpretTimestampInTimezone(event.endDate, inferredTimezone)
    console.log(`  endDate: ${originalEnd} → ${event.endDate} (as ${inferredTimezone} local)`)
  }

  // Reinterpret occurrences timestamps if present
  if (event.flypost?.occurrences && Array.isArray(event.flypost.occurrences)) {
    for (const occ of event.flypost.occurrences) {
      if (occ.startDate) {
        const originalStart = occ.startDate
        occ.startDate = reinterpretTimestampInTimezone(occ.startDate, inferredTimezone)
        console.log(`  occurrence startDate: ${originalStart} → ${occ.startDate}`)
      }
      if (occ.endDate) {
        const originalEnd = occ.endDate
        occ.endDate = reinterpretTimestampInTimezone(occ.endDate, inferredTimezone)
        console.log(`  occurrence endDate: ${originalEnd} → ${occ.endDate}`)
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
  if (event.flypost?.occurrences && event.flypost.occurrences.length > 0) {
    // Validate each occurrence has endDate
    for (const occ of event.flypost.occurrences) {
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
