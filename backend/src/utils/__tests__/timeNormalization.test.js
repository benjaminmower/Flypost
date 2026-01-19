/* Test Suite for Open-House Local Intent Time Normalization
 * 
 * Tests the new local intent → UTC conversion pipeline for open-houses.
 * This is NOT backward compatible - validates the new contract.
 */

import { describe, it, expect } from 'vitest'
import { 
  localIntentToUTC, 
  convertOpenHouseLocalIntent 
} from '../timeNormalization.js'

describe('localIntentToUTC', () => {
  it('should convert local intent to UTC for America/Los_Angeles', () => {
    const result = localIntentToUTC('2026-01-19', '12:00', 'America/Los_Angeles')
    
    // 12:00 PM Pacific on Jan 19, 2026 → 20:00 UTC (PST is UTC-8)
    expect(result).toBe('2026-01-19T20:00:00.000Z')
  })

  it('should convert local intent to UTC for America/New_York', () => {
    const result = localIntentToUTC('2026-01-19', '14:00', 'America/New_York')
    
    // 2:00 PM Eastern on Jan 19, 2026 → 19:00 UTC (EST is UTC-5)
    expect(result).toBe('2026-01-19T19:00:00.000Z')
  })

  it('should throw error for invalid date format', () => {
    expect(() => {
      localIntentToUTC('19-01-2026', '12:00', 'America/Los_Angeles')
    }).toThrow('Invalid date format')
  })

  it('should throw error for invalid time format', () => {
    expect(() => {
      localIntentToUTC('2026-01-19', '12:00 PM', 'America/Los_Angeles')
    }).toThrow('Invalid time format')
  })

  it('should throw error for missing timezone', () => {
    expect(() => {
      localIntentToUTC('2026-01-19', '12:00', null)
    }).toThrow('localDate, localTime, and timezone are required')
  })
})

describe('convertOpenHouseLocalIntent', () => {
  it('should convert single occurrence from local intent to UTC (America/Los_Angeles)', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      },
      occurrences: [
        {
          local: {
            date: '2026-01-19',
            startTime: '12:00',
            endTime: '14:00'
          },
          label: 'Saturday'
        }
      ]
    }

    const result = convertOpenHouseLocalIntent(event, 'America/Los_Angeles')

    // Verify UTC conversion
    expect(result.occurrences[0].startDate).toBe('2026-01-19T20:00:00.000Z')
    expect(result.occurrences[0].endDate).toBe('2026-01-19T22:00:00.000Z')
    
    // Verify top-level dates are set
    expect(result.startDate).toBe('2026-01-19T20:00:00.000Z')
    expect(result.endDate).toBe('2026-01-19T22:00:00.000Z')
    
    // Verify time normalization version is set
    expect(result.flypost.timeNormalizationVersion).toBe('local_intent_v1')
  })

  it('should convert multiple occurrences from local intent to UTC', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      },
      occurrences: [
        {
          local: {
            date: '2026-06-19',
            startTime: '11:00',
            endTime: '13:00'
          },
          label: 'Saturday'
        },
        {
          local: {
            date: '2026-06-20',
            startTime: '14:00',
            endTime: '16:00'
          },
          label: 'Sunday'
        }
      ]
    }

    const result = convertOpenHouseLocalIntent(event, 'America/Los_Angeles')

    // Verify first occurrence
    expect(result.occurrences[0].startDate).toBe('2026-06-19T18:00:00.000Z')
    expect(result.occurrences[0].endDate).toBe('2026-06-19T20:00:00.000Z')
    
    // Verify second occurrence
    expect(result.occurrences[1].startDate).toBe('2026-06-20T21:00:00.000Z')
    expect(result.occurrences[1].endDate).toBe('2026-06-20T23:00:00.000Z')
    
    // Verify top-level dates are set to first occurrence (upcoming)
    expect(result.startDate).toBe('2026-06-19T18:00:00.000Z')
    expect(result.endDate).toBe('2026-06-19T20:00:00.000Z')
  })

  it('should handle cross-midnight scenarios (end < start)', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      },
      occurrences: [
        {
          local: {
            date: '2026-01-19',
            startTime: '22:00',
            endTime: '01:00'
          },
          label: 'Late Night'
        }
      ]
    }

    const result = convertOpenHouseLocalIntent(event, 'America/Los_Angeles')

    // Verify cross-midnight handling
    // Start: 22:00 Pacific on Jan 19 → 06:00 UTC on Jan 20 (PST is UTC-8)
    expect(result.occurrences[0].startDate).toBe('2026-01-20T06:00:00.000Z')
    
    // End: 01:00 Pacific on Jan 20 (next day) → 09:00 UTC on Jan 20
    expect(result.occurrences[0].endDate).toBe('2026-01-20T09:00:00.000Z')
  })

  it('should throw INVALID_OPEN_HOUSE_LOCAL_INTENT when occurrences missing', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      }
    }

    try {
      convertOpenHouseLocalIntent(event, 'America/Los_Angeles')
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.code).toBe('INVALID_OPEN_HOUSE_LOCAL_INTENT')
      expect(error.message).toContain('occurrences')
    }
  })

  it('should throw INVALID_OPEN_HOUSE_LOCAL_INTENT when local intent missing', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      },
      occurrences: [
        {
          label: 'Saturday'
          // Missing local intent
        }
      ]
    }

    try {
      convertOpenHouseLocalIntent(event, 'America/Los_Angeles')
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.code).toBe('INVALID_OPEN_HOUSE_LOCAL_INTENT')
      expect(error.message).toContain('local intent')
    }
  })

  it('should throw TIMEZONE_INFERENCE_FAILED when timezone is null', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      },
      occurrences: [
        {
          local: {
            date: '2026-01-19',
            startTime: '12:00',
            endTime: '14:00'
          },
          label: 'Saturday'
        }
      ]
    }

    try {
      convertOpenHouseLocalIntent(event, null)
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.code).toBe('TIMEZONE_INFERENCE_FAILED')
      expect(error.message).toContain('timezone')
    }
  })

  it('should throw INVALID_LOCAL_TIME_RANGE for invalid date format', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      },
      occurrences: [
        {
          local: {
            date: '01/19/2026', // Wrong format
            startTime: '12:00',
            endTime: '14:00'
          },
          label: 'Saturday'
        }
      ]
    }

    try {
      convertOpenHouseLocalIntent(event, 'America/Los_Angeles')
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.code).toBe('INVALID_LOCAL_TIME_RANGE')
      expect(error.message).toContain('date format')
    }
  })

  it('should throw INVALID_LOCAL_TIME_RANGE for invalid time format', () => {
    const event = {
      flypost: {
        category: 'open-houses'
      },
      occurrences: [
        {
          local: {
            date: '2026-01-19',
            startTime: '12:00 PM', // Wrong format (should be 24h)
            endTime: '14:00'
          },
          label: 'Saturday'
        }
      ]
    }

    try {
      convertOpenHouseLocalIntent(event, 'America/Los_Angeles')
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.code).toBe('INVALID_LOCAL_TIME_RANGE')
      expect(error.message).toContain('startTime format')
    }
  })

  it('should not process non-open-house categories', () => {
    const event = {
      flypost: {
        category: 'garage-sales'
      },
      occurrences: [
        {
          local: {
            date: '2026-01-19',
            startTime: '12:00',
            endTime: '14:00'
          }
        }
      ]
    }

    const result = convertOpenHouseLocalIntent(event, 'America/Los_Angeles')

    // Should return event unchanged
    expect(result.occurrences[0].startDate).toBeUndefined()
    expect(result.flypost.timeNormalizationVersion).toBeUndefined()
  })
})
