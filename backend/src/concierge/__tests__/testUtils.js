/**
 * Shared test utilities for concierge tests
 * 
 * NOTE: These are duplicated from chatHandler.js because direct imports
 * fail without installing backend dependencies (OpenAI, marked, etc.).
 * This allows tests to run with just Node.js without npm install.
 * 
 * In a production test setup with proper dependency management,
 * these should be imported from chatHandler.js instead.
 */

/**
 * Format event times in local timezone for display
 * 
 * @param {string} startISO - Start time in ISO 8601 format (UTC)
 * @param {string} endISO - End time in ISO 8601 format (UTC)
 * @param {string} timezone - IANA timezone string (e.g., "America/Los_Angeles")
 * @returns {string|null} Formatted time string (e.g., "11:00 AM – 2:00 PM PT") or null if invalid
 */
export function formatLocalTime(startISO, endISO, timezone) {
  if (!startISO || !endISO || !timezone) {
    return null
  }

  try {
    const startDate = new Date(startISO)
    const endDate = new Date(endISO)

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return null
    }

    // Format times in the local timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    })

    const startTimeLocal = formatter.format(startDate)
    const endTimeLocal = formatter.format(endDate)

    // Extract timezone abbreviation (e.g., "PT", "ET")
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: timezone
    })
    const tzParts = tzFormatter.formatToParts(startDate)
    const tzName = tzParts.find(part => part.type === 'timeZoneName')?.value || ''

    return `${startTimeLocal} – ${endTimeLocal} ${tzName}`.trim()
  } catch (error) {
    console.error('Error formatting local time:', error)
    return null
  }
}

/**
 * Enrich events with local time display strings
 * 
 * @param {Array} events - Array of event objects
 * @returns {Array} Events with when.displayLocal added
 */
export function enrichEventsWithLocalTime(events) {
  if (!events || !Array.isArray(events)) {
    return events
  }

  return events.map(event => {
    if (event.when && event.when.start && event.when.end && event.when.timezone) {
      const displayLocal = formatLocalTime(
        event.when.start,
        event.when.end,
        event.when.timezone
      )
      
      if (displayLocal) {
        return {
          ...event,
          when: {
            ...event.when,
            displayLocal
          }
        }
      }
    }
    return event
  })
}
