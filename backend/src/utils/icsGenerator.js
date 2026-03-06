/**
 * Escape special characters for ICS file format (RFC 5545)
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeIcsText(text) {
  if (!text) return ''
  return String(text)
    .replace(/\\/g, '\\\\')   // Backslashes
    .replace(/;/g, '\\;')     // Semicolons
    .replace(/,/g, '\\,')     // Commas
    .replace(/\n/g, '\\n')    // Newlines
}

/**
 * Generate RFC 5545 compliant .ics file content
 * @param {object} event - Event object
 * @returns {string} - ICS file content
 */
export function generateIcsFile(event) {
  const eventName = event.name || 'Event'
  const description = event.description || ''

  // Smart occurrence selection (same logic as share page)
  const occurrences = event.occurrences || []

  let selectedOccurrence = null
  const now = Date.now()

  if (occurrences.length > 0) {
    // 1. Prefer current occurrence
    selectedOccurrence = occurrences.find(occ => {
      const start = new Date(occ.startDate).getTime()
      const end = new Date(occ.endDate).getTime()
      return now >= start && now <= end
    })

    // 2. Else next upcoming occurrence
    if (!selectedOccurrence) {
      const upcoming = occurrences
        .filter(occ => new Date(occ.startDate).getTime() > now)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      selectedOccurrence = upcoming[0]
    }

    // 3. Else most recent past occurrence
    if (!selectedOccurrence) {
      const past = occurrences
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      selectedOccurrence = past[0]
    }
  }

  const startDate = selectedOccurrence ? selectedOccurrence.startDate : event.startDate
  const endDate = selectedOccurrence ? selectedOccurrence.endDate : event.endDate || startDate

  // Extract address
  const address = event.location?.address
  let location = ''
  if (address) {
    const parts = []
    if (address.streetAddress) parts.push(address.streetAddress)
    if (address.addressLocality) parts.push(address.addressLocality)
    if (address.addressRegion) parts.push(address.addressRegion)
    if (address.postalCode) parts.push(address.postalCode)
    location = parts.join(', ')
  }

  // Format dates for ICS (YYYYMMDDTHHmmssZ)
  const formatIcsDate = (dateStr) => {
    return new Date(dateStr).toISOString().replace(/-|:|\.\d+/g, '')
  }

  const dtstart = formatIcsDate(startDate)
  const dtend = formatIcsDate(endDate)
  const dtstamp = formatIcsDate(new Date().toISOString())

  // Generate unique ID
  const uid = `${event.flypost?.eventId || event.id}@goflypost.com`

  // Build ICS content (MUST use \r\n line endings per RFC 5545)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flypost//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcsText(eventName)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  return ics
}
