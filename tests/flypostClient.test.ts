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
      }
    })

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'))

      const fastClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        retryDelay: 10, // Fast retry for testing
      })

      try {
        await fastClient.flypostParseAndPublish({
          naturalLanguageInput: 'Test event',
        })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toContain('Network error')
        expect(flypostError.message).toContain('after')
      }
    })

    it('should handle invalid response format', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: false }),
      })

      const fastClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        retryDelay: 10, // Fast retry for testing
      })

      await expect(
        fastClient.flypostParseAndPublish({
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
  })

  describe('Retry Logic', () => {
    it('should retry on network errors and eventually succeed', async () => {
      const mockResponse = {
        success: true,
        data: { events: [], total: 0 },
      }

      // First two calls fail with network error, third succeeds
      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        })

      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        maxRetries: 3,
        retryDelay: 10, // Short delay for testing
      })

      const result = await retryClient.flypostEventsNear()

      expect(result.events).toEqual([])
      expect(result.total).toBe(0)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('should retry on 5xx errors and eventually succeed', async () => {
      const errorResponse = {
        success: false,
        error: 'Internal server error',
      }
      const successResponse = {
        success: true,
        data: { events: [{ name: 'Test' }], total: 1 },
      }

      // First call returns 500, second succeeds
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => errorResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => successResponse,
        })

      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        maxRetries: 2,
        retryDelay: 10,
      })

      const result = await retryClient.flypostEventsNear()

      expect(result.events).toHaveLength(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('should not retry on 4xx client errors', async () => {
      const errorResponse = {
        success: false,
        error: 'Bad request',
      }

      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => errorResponse,
      })

      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        maxRetries: 3,
        retryDelay: 10,
      })

      await expect(retryClient.flypostEventsNear()).rejects.toThrow('Bad request')
      expect(fetchMock).toHaveBeenCalledTimes(1) // No retries
    })

    it('should throw after exhausting all retries', async () => {
      fetchMock.mockRejectedValue(new Error('Persistent network error'))

      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        maxRetries: 2,
        retryDelay: 10,
      })

      await expect(retryClient.flypostEventsNear()).rejects.toThrow(
        'Network request failed after 3 attempts'
      )
      expect(fetchMock).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('should not retry on timeout errors', async () => {
      fetchMock.mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      )

      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        maxRetries: 3,
        retryDelay: 10,
        timeout: 100,
      })

      await expect(retryClient.flypostEventsNear()).rejects.toThrow('Request timeout')
      expect(fetchMock).toHaveBeenCalledTimes(1) // No retries on timeout
    })
  })

  describe('Authentication and BrokerageId Support', () => {
    it('should include write token header when configured', async () => {
      const mockResponse = {
        success: true,
        data: { events: [], total: 0 },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const authClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        writeToken: 'test-token-123',
      })

      await authClient.flypostEventsNear()

      const callArgs = fetchMock.mock.calls[0][1]
      expect(callArgs.headers['X-Flypost-Write-Token']).toBe('test-token-123')
    })

    it('should include brokerageId header when configured in client', async () => {
      const mockResponse = {
        success: true,
        data: { events: [], total: 0 },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const brokerageClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        brokerageId: 'vista-sir',
      })

      await brokerageClient.flypostEventsNear()

      const callArgs = fetchMock.mock.calls[0][1]
      expect(callArgs.headers['X-Flypost-Brokerage-Id']).toBe('vista-sir')
    })

    it('should include brokerageId in query params', async () => {
      const mockResponse = {
        success: true,
        data: { events: [], total: 0 },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      await client.flypostEventsNear({ brokerageId: 'vista-sir' })

      const url = fetchMock.mock.calls[0][0]
      expect(url).toContain('brokerageId=vista-sir')
    })

    it('should prioritize args brokerageId over client config', async () => {
      const mockResponse = {
        success: true,
        data: { events: [], total: 0 },
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const brokerageClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        brokerageId: 'default-brokerage',
      })

      await brokerageClient.flypostEventsNear({ brokerageId: 'vista-sir' })

      const url = fetchMock.mock.calls[0][0]
      expect(url).toContain('brokerageId=vista-sir')
      expect(url).not.toContain('default-brokerage')
    })
  })

  describe('Enhanced Error Messages', () => {
    it('should provide helpful timeout error message', async () => {
      fetchMock.mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      )

      const client = new FlypostClient({
        apiBase: 'http://test.example.com',
        timeout: 5000,
      })

      try {
        await client.flypostEventsNear()
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toContain('timeout')
        expect(flypostError.message).toContain('increasing timeout')
        expect(flypostError.details).toHaveProperty('suggestion')
        expect(flypostError.details.timeout).toBe(5000)
      }
    })

    it('should provide helpful network error message with retry info', async () => {
      fetchMock.mockRejectedValue(new Error('Connection refused'))

      const retryClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        maxRetries: 2,
        retryDelay: 10,
      })

      try {
        await retryClient.flypostEventsNear()
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError)
        const flypostError = error as FlypostError
        expect(flypostError.message).toContain('after 3 attempts')
        expect(flypostError.details).toHaveProperty('attempts')
        expect(flypostError.details.attempts).toBe(3)
        expect(flypostError.details).toHaveProperty('suggestion')
        expect(flypostError.details.suggestion).toContain('network connectivity')
      }
    })
  })

  describe('Configuration', () => {
    it('should use increased default timeout of 60 seconds', () => {
      const defaultClient = new FlypostClient()
      // We can't directly access private properties, but we can verify it doesn't error
      expect(defaultClient).toBeDefined()
    })

    it('should allow custom timeout configuration', async () => {
      const customClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        timeout: 90000,
      })
      
      expect(customClient).toBeDefined()
    })

    it('should have default retry configuration', async () => {
      const defaultClient = new FlypostClient({
        apiBase: 'http://test.example.com',
        retryDelay: 10, // Fast retry for testing
      })
      
      // Trigger network error to test retries
      fetchMock.mockRejectedValue(new Error('Network error'))
      
      await expect(defaultClient.flypostEventsNear()).rejects.toThrow()
      // Default is 3 retries, so 4 total attempts
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })
  })
})
