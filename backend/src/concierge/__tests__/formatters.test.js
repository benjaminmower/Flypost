/**
 * Tests for time formatting helpers in chatHandler.js
 * 
 * These tests ensure that UTC timestamps are correctly converted
 * to local timezone display strings for the concierge.
 */

import { describe, it, expect } from 'vitest'
import { formatLocalTime, enrichEventsWithLocalTime } from '../chatHandler.js'

describe('formatLocalTime', () => {
  it('should format UTC time to LA local time', () => {
    // 2026-01-06T19:00:00.000Z in UTC = 11:00 AM in LA (PST)
    const startISO = '2026-01-06T19:00:00.000Z'
    const endISO = '2026-01-06T22:00:00.000Z'
    const timezone = 'America/Los_Angeles'

    const result = formatLocalTime(startISO, endISO, timezone)

    expect(result).toBeTruthy()
    expect(result).toContain('11:00 AM')
    expect(result).toContain('2:00 PM')
    expect(result).toContain('PST') // Should show PST for January dates
  })

  it('should format UTC time to NY local time', () => {
    const startISO = '2026-01-06T19:00:00.000Z'
    const endISO = '2026-01-06T22:00:00.000Z'
    const timezone = 'America/New_York'

    const result = formatLocalTime(startISO, endISO, timezone)

    expect(result).toBeTruthy()
    expect(result).toContain('2:00 PM')
    expect(result).toContain('5:00 PM')
    expect(result).toContain('EST') // Should show EST for January dates
  })

  it('should handle invalid inputs gracefully', () => {
    expect(formatLocalTime(null, null, null)).toBeNull()
    expect(formatLocalTime('', '', '')).toBeNull()
    expect(formatLocalTime('invalid', 'invalid', 'America/Los_Angeles')).toBeNull()
  })

  it('should handle missing timezone', () => {
    const startISO = '2026-01-06T19:00:00.000Z'
    const endISO = '2026-01-06T22:00:00.000Z'

    expect(formatLocalTime(startISO, endISO, null)).toBeNull()
    expect(formatLocalTime(startISO, endISO, '')).toBeNull()
  })

  it('should handle daylight saving time correctly', () => {
    // June date - should be PDT not PST
    const startISO = '2026-06-15T19:00:00.000Z'
    const endISO = '2026-06-15T22:00:00.000Z'
    const timezone = 'America/Los_Angeles'

    const result = formatLocalTime(startISO, endISO, timezone)

    expect(result).toBeTruthy()
    expect(result).toContain('12:00 PM')
    expect(result).toContain('3:00 PM')
    expect(result).toContain('PDT') // Should show PDT for June dates
  })
})

describe('enrichEventsWithLocalTime', () => {
  it('should add displayLocal to events with timezone', () => {
    const events = [
      {
        eventId: 'test123',
        when: {
          start: '2026-01-06T19:00:00.000Z',
          end: '2026-01-06T22:00:00.000Z',
          timezone: 'America/Los_Angeles'
        }
      }
    ]

    const enriched = enrichEventsWithLocalTime(events)

    expect(enriched).toHaveLength(1)
    expect(enriched[0].when.displayLocal).toBeTruthy()
    expect(enriched[0].when.displayLocal).toContain('11:00 AM')
    expect(enriched[0].when.displayLocal).toContain('2:00 PM')
    expect(enriched[0].when.start).toBe('2026-01-06T19:00:00.000Z') // Original should remain
    expect(enriched[0].when.end).toBe('2026-01-06T22:00:00.000Z') // Original should remain
  })

  it('should not modify events without timezone', () => {
    const events = [
      {
        eventId: 'test456',
        when: {
          start: '2026-01-06T19:00:00.000Z',
          end: '2026-01-06T22:00:00.000Z'
        }
      }
    ]

    const enriched = enrichEventsWithLocalTime(events)

    expect(enriched).toHaveLength(1)
    expect(enriched[0].when.displayLocal).toBeUndefined()
  })

  it('should handle empty arrays', () => {
    expect(enrichEventsWithLocalTime([])).toEqual([])
  })

  it('should handle null/undefined input', () => {
    expect(enrichEventsWithLocalTime(null)).toBeNull()
    expect(enrichEventsWithLocalTime(undefined)).toBeUndefined()
  })

  it('should handle mixed events with and without timezone', () => {
    const events = [
      {
        eventId: 'test1',
        when: {
          start: '2026-01-06T19:00:00.000Z',
          end: '2026-01-06T22:00:00.000Z',
          timezone: 'America/Los_Angeles'
        }
      },
      {
        eventId: 'test2',
        when: {
          start: '2026-01-07T19:00:00.000Z',
          end: '2026-01-07T22:00:00.000Z'
          // No timezone
        }
      }
    ]

    const enriched = enrichEventsWithLocalTime(events)

    expect(enriched).toHaveLength(2)
    expect(enriched[0].when.displayLocal).toBeTruthy()
    expect(enriched[1].when.displayLocal).toBeUndefined()
  })
})
