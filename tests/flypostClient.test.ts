/**
 * Flypost Client Tests
 * 
 * Tests for the Flypost TypeScript client covering:
 * - Happy paths for both endpoints
 * - Error normalization
 * - Timeout handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FlypostClient, FlypostError } from '../clients/flypostClient'

describe('FlypostClient', () => {
  let client: FlypostClient
  let fetchMock: any

  beforeEach(() => {
    client = new FlypostClient({ apiBase: 'http://test.example.com' })
    
    // Mock global fetch
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('flypostParseAndPublish', () => {
    it('should successfully parse and publish an event', async () => {
      const mockResponse = {
        success: true,
        data: {
          eventId: 'evt_test123_1234567890',
          event: {
            '@type': 'Event',
            name: 'Test Event',
            startDate: '2024-01-15T13:00:00.000Z',
          },
          processing: {
            parsed: true,
            validated: true,
            hashed: true,
            stored: true,
          },
        },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.flypostParseAndPublish({
        naturalLanguageInput: 'Test event on January 15th at 1pm',
      })

      expect(result.eventId).toBe('evt_test123_1234567890')
      expect(result.event['@type']).toBe('Event')
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test.example.com/api/parse-and-publish',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    it('should include userContext when provided', async () => {
      const mockResponse = {
        success: true,
        data: {
          eventId: 'evt_test456_1234567890',
          event: { '@type': 'Event' },
        },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      await client.flypostParseAndPublish({
        naturalLanguageInput: 'Test event',
        userContext: { channel: 'test', userId: '123' },
      })

      const callArgs = fetchMock.mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.userContext).toEqual({ channel: 'test', userId: '123' })
    })

    it('should normalize server error response', async () => {
      const errorResponse = {
        success: false,
        error: 'Validation failed',
        details: 'Missing required field: startDate',
      }

      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => errorResponse,
      })

      try {
        await client.flypostParseAndPublish({
          naturalLanguageInput: 'Invalid event',
        })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toBe('Validation failed')
        expect(flypostError.status).toBe(400)
        expect(flypostError.details).toBe('Missing required field: startDate')
      }
    })

    it('should handle timeout', async () => {
      const shortTimeoutClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        timeout: 100,
        retryAttempts: 0, // Disable retries for this test
      })

      // Mock fetch to throw an AbortError
      fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))

      try {
        await shortTimeoutClient.flypostParseAndPublish({
          naturalLanguageInput: 'Test event',
        })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toContain('timeout')
        expect(flypostError.code).toBe('TIMEOUT')
        expect(flypostError.category).toBe('TIMEOUT')
      }
    })

    it('should handle network errors', async () => {
      const noRetryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        retryAttempts: 0, // Disable retries for this test
      })
      
      fetchMock.mockRejectedValue(new Error('Network error'))

      try {
        await noRetryClient.flypostParseAndPublish({
          naturalLanguageInput: 'Test event',
        })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toBe('Network error')
        expect(flypostError.category).toBe('NETWORK_ERROR')
      }
    })

    it('should handle invalid response format', async () => {
      const noRetryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        retryAttempts: 0, // Disable retries for this test
      })
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: false }),
      })

      await expect(
        noRetryClient.flypostParseAndPublish({
          naturalLanguageInput: 'Test event',
        })
      ).rejects.toThrow('Invalid response format from API')
    })
  })

  describe('flypostEventsNear', () => {
    it('should successfully retrieve events near a location', async () => {
      const mockResponse = {
        success: true,
        data: {
          events: [
            {
              '@type': 'Event',
              name: 'Event 1',
              eventId: 'evt_1',
            },
            {
              '@type': 'Event',
              name: 'Event 2',
              eventId: 'evt_2',
            },
          ],
          total: 2,
          query: { lat: 34.01, lng: -118.49, radius: 10 },
          source: 'Firestore',
        },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.flypostEventsNear({
        lat: 34.01,
        lng: -118.49,
        radius: 10,
      })

      expect(result.events).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/events/near?'),
        expect.objectContaining({
          method: 'GET',
        })
      )
    })

    it('should use default radius of 10km when omitted', async () => {
      const mockResponse = {
        success: true,
        data: { events: [], total: 0 },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      await client.flypostEventsNear({ lat: 34.01, lng: -118.49 })

      const url = fetchMock.mock.calls[0][0]
      expect(url).toContain('radius=10')
    })

    it('should work with no parameters (defaults)', async () => {
      const mockResponse = {
        success: true,
        data: { events: [], total: 0 },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await client.flypostEventsNear()

      expect(result.events).toEqual([])
      expect(result.total).toBe(0)
      const url = fetchMock.mock.calls[0][0]
      expect(url).toContain('radius=10')
    })

    it('should normalize server error response', async () => {
      const errorResponse = {
        success: false,
        error: 'Invalid coordinates',
        details: 'Latitude must be between -90 and 90',
      }

      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => errorResponse,
      })

      try {
        await client.flypostEventsNear({ lat: 999, lng: -118.49 })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toBe('Invalid coordinates')
        expect(flypostError.status).toBe(400)
      }
    })

    it('should handle timeout', async () => {
      const shortTimeoutClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        timeout: 100,
        retryAttempts: 0, // Disable retries for this test
      })

      // Mock fetch to throw an AbortError
      fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))

      try {
        await shortTimeoutClient.flypostEventsNear()
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toContain('timeout')
        expect(flypostError.code).toBe('TIMEOUT')
        expect(flypostError.category).toBe('TIMEOUT')
      }
    })
  })

  describe('FlypostError', () => {
    it('should create error with all properties', () => {
      const error = new FlypostError('Test error', {
        code: 'TEST_CODE',
        status: 400,
        url: 'http://example.com/api/test',
        details: { extra: 'info' },
      })

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('FlypostError')
      expect(error.code).toBe('TEST_CODE')
      expect(error.status).toBe(400)
      expect(error.url).toBe('http://example.com/api/test')
      expect(error.details).toEqual({ extra: 'info' })
    })

    it('should work with minimal options', () => {
      const error = new FlypostError('Simple error')

      expect(error.message).toBe('Simple error')
      expect(error.name).toBe('FlypostError')
      expect(error.code).toBeUndefined()
      expect(error.status).toBeUndefined()
    })

    it('should categorize timeout errors correctly', () => {
      const error = new FlypostError('Timeout error', {
        code: 'TIMEOUT',
      })

      expect(error.category).toBe('TIMEOUT')
    })

    it('should categorize network errors correctly', () => {
      const error = new FlypostError('Network error', {
        code: 'NETWORK_ERROR',
      })

      expect(error.category).toBe('NETWORK_ERROR')
    })

    it('should categorize server errors (5xx) correctly', () => {
      const error = new FlypostError('Server error', {
        status: 500,
      })

      expect(error.category).toBe('SERVER_ERROR')
    })

    it('should categorize client errors (4xx) correctly', () => {
      const error = new FlypostError('Client error', {
        status: 400,
      })

      expect(error.category).toBe('CLIENT_ERROR')
    })

    it('should categorize unknown errors correctly', () => {
      const error = new FlypostError('Unknown error', {
        status: 200, // Success status but error created
      })

      expect(error.category).toBe('UNKNOWN')
    })

    it('should allow explicit category override', () => {
      const error = new FlypostError('Custom error', {
        status: 500,
        category: 'NETWORK_ERROR', // Override automatic categorization
      })

      expect(error.category).toBe('NETWORK_ERROR')
    })
  })

  describe('Retry Mechanism', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should retry on network errors with exponential backoff', async () => {
      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        timeout: 5000,
        retryAttempts: 2,
        retryDelay: 100,
      })

      let attemptCount = 0
      fetchMock.mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          return Promise.reject(new TypeError('Network error'))
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eventId: 'evt_retry_test',
              event: { '@type': 'Event' },
            },
          }),
        })
      })

      const promise = retryClient.flypostParseAndPublish({
        naturalLanguageInput: 'Test event',
      })

      // Fast-forward through retry delays
      await vi.runAllTimersAsync()

      const result = await promise
      expect(result.eventId).toBe('evt_retry_test')
      expect(attemptCount).toBe(3) // Initial attempt + 2 retries
    })

    it('should not retry on client errors (4xx)', async () => {
      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        retryAttempts: 3,
      })

      let attemptCount = 0
      fetchMock.mockImplementation(() => {
        attemptCount++
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: 'Bad request',
          }),
        })
      })

      try {
        await retryClient.flypostParseAndPublish({
          naturalLanguageInput: 'Invalid input',
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        expect(attemptCount).toBe(1) // Should not retry
      }
    })

    it('should give up after max retries', async () => {
      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        retryAttempts: 2,
        retryDelay: 100,
      })

      let attemptCount = 0
      fetchMock.mockImplementation(() => {
        attemptCount++
        return Promise.reject(new TypeError('Network error'))
      })

      const promise = retryClient.flypostParseAndPublish({
        naturalLanguageInput: 'Test event',
      })

      await vi.runAllTimersAsync()

      try {
        await promise
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        expect((error as FlypostError).category).toBe('NETWORK_ERROR')
        expect(attemptCount).toBe(3) // Initial + 2 retries
      }
    })
  })

  describe('Mobile Configuration', () => {
    it('should use longer timeout for mobile devices', () => {
      const mobileClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        isMobile: true,
      })

      // Access private property for testing (TypeScript workaround)
      const timeout = (mobileClient as any).timeout
      expect(timeout).toBe(90000) // 90 seconds for mobile
    })

    it('should use standard timeout for desktop', () => {
      const desktopClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        isMobile: false,
      })

      const timeout = (desktopClient as any).timeout
      expect(timeout).toBe(60000) // 60 seconds for desktop
    })

    it('should respect explicit timeout override', () => {
      const customClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        isMobile: true,
        timeout: 120000, // Override
      })

      const timeout = (customClient as any).timeout
      expect(timeout).toBe(120000)
    })
  })
})
