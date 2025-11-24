//v1
// Time helpers for Flypost v4 front-end

// Try to normalize a variety of timestamp shapes into epoch millis
function toEpochMillis(ts: any): number | null {
  if (!ts) return null

  // Date
  if (ts instanceof Date) {
    const ms = ts.getTime()
    return isNaN(ms) ? null : ms
  }

  // Firestore Timestamp (has toDate) or { seconds, nanoseconds }
  if (typeof ts?.toDate === 'function') {
    const d = ts.toDate()
    const ms = d?.getTime?.()
    return ms && !isNaN(ms) ? ms : null
  }
  if (typeof ts?.seconds === 'number') {
    const ms = ts.seconds * 1000 + (typeof ts.nanoseconds === 'number' ? Math.round(ts.nanoseconds / 1e6) : 0)
    return ms
  }

  // Number: ms or seconds
  if (typeof ts === 'number' && isFinite(ts)) {
    // Heuristic: treat large as ms, smaller as seconds
    return ts > 1e12 ? ts : ts > 1e9 ? ts * 1000 : ts
  }

  // String
  if (typeof ts === 'string' && ts.length) {
    const d = new Date(ts)
    const ms = d.getTime()
    if (!isNaN(ms)) return ms
  }

  return null
}

// Newest wins based on: submissionTimestamp -> storedAt -> firestore.updatedAt -> firestore.createdAt -> startDate
export function parseFreshness(evt: any): number {
  const candidates = [
    evt?.flypost?.submissionTimestamp,
    evt?.storedAt,
    evt?._firestoreMetadata?.updatedAt,
    evt?._firestoreMetadata?.createdAt,
    evt?.startDate
  ]

  for (const ts of candidates) {
    const ms = toEpochMillis(ts)
    if (ms) return ms
  }
  return 0
}

// Return YYYY-MM-DD for a given value, optionally in a specific IANA time zone (e.g., 'America/Los_Angeles')
// If no timeZone is provided, we try to preserve the ISO date prefix if the string starts with it,
// otherwise fall back to the environment's local date.
export function toLocalDateOnly(value?: string | Date, timeZone?: string): string | null {
  if (!value) return null

  // Fast path: if the input is ISO-like and begins with YYYY-MM-DD, preserve that (avoids env TZ skew)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const prefix = value.slice(0, 10)
    if (!timeZone) return prefix
    // If a timeZone is requested, we’ll compute that below
  }

  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return null

  if (timeZone) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = fmt.formatToParts(d)
    const y = parts.find(p => p.type === 'year')?.value
    const m = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    if (y && m && day) return `${y}-${m}-${day}`
  }

  // Fallback: environment local date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
