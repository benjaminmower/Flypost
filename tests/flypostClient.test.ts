/**
 * Flypost Client Tests
 * 
 * Tests for the Flypost TypeScript client with focus on:
 * - Happy paths for both endpoints using OpenAPI response wrappers
 * - Error normalization
 * - Timeout handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  flypostParseAndPublish,
  flypostEventsNear,
  FlypostError,
} from '../clients/flypostClient';

// Mock fetch globally
global.fetch = vi.fn();

describe('flypostClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flypostParseAndPublish', () => {
    it('should successfully parse and publish an event', async () => {
      const mockResponse = {
        success: true,
        data: {
          eventId: 'evt_test123_1700000000000',
          event: {
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: 'Open House',
            startDate: '2024-01-14T13:00:00-08:00',
            location: {
              '@type': 'Place',
              address: '2212 Ocean Park Blvd, Santa Monica, CA',
            },
          },
          processing: {
            parsed: true,
            validated: true,
            hashed: true,
            stored: true,
          },
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await flypostParseAndPublish({
        naturalLanguageInput: 'Open house Sunday 1-4pm at 2212 Ocean Park Blvd',
        userContext: { channel: 'test' },
      });

      expect(result).toEqual({
        eventId: 'evt_test123_1700000000000',
        event: mockResponse.data.event,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/parse-and-publish'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            naturalLanguageInput: 'Open house Sunday 1-4pm at 2212 Ocean Park Blvd',
            userContext: { channel: 'test' },
          }),
        })
      );
    });

    it('should handle server error responses', async () => {
      const mockErrorResponse = {
        success: false,
        error: 'Validation failed',
        details: 'Invalid date format',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValueOnce(mockErrorResponse),
      });

      try {
        await flypostParseAndPublish({
          naturalLanguageInput: 'Invalid event',
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError);
        expect((error as FlypostError).message).toBe('Validation failed');
        expect((error as FlypostError).status).toBe(400);
        expect((error as FlypostError).details).toBe('Invalid date format');
      }
    });

    it('should handle invalid response format', async () => {
      const mockInvalidResponse = {
        success: false,
        // Missing data field
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockInvalidResponse),
      });

      try {
        await flypostParseAndPublish({
          naturalLanguageInput: 'Test event',
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError);
        expect((error as FlypostError).message).toBe('Invalid response format');
      }
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

      try {
        await flypostParseAndPublish({
          naturalLanguageInput: 'Test event',
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError);
        expect((error as FlypostError).message).toBe('Network timeout');
      }
    });
  });

  describe('flypostEventsNear', () => {
    it('should successfully retrieve events near a location', async () => {
      const mockResponse = {
        success: true,
        data: {
          events: [
            {
              '@context': 'https://schema.org',
              '@type': 'Event',
              name: 'Sample Event',
              startDate: '2024-01-14T13:00:00-08:00',
            },
          ],
          total: 1,
          query: { lat: 34.0195, lng: -118.4912, radius: 10 },
          source: 'Memory',
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await flypostEventsNear({
        lat: 34.0195,
        lng: -118.4912,
        radius: 10,
      });

      expect(result).toEqual({
        events: mockResponse.data.events,
        total: 1,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/events\/near\?.*lat=34\.0195.*lng=-118\.4912.*radius=10/),
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should use default radius when omitted', async () => {
      const mockResponse = {
        success: true,
        data: {
          events: [],
          total: 0,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      await flypostEventsNear({ lat: 34.0195, lng: -118.4912 });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('radius=10'),
        expect.any(Object)
      );
    });

    it('should only include defined query params', async () => {
      const mockResponse = {
        success: true,
        data: {
          events: [],
          total: 0,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      await flypostEventsNear({ lat: 34.0195 });

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('lat=34.0195');
      expect(callUrl).toContain('radius=10');
      expect(callUrl).not.toContain('lng=');
    });

    it('should handle server error responses', async () => {
      const mockErrorResponse = {
        success: false,
        error: 'Internal server error',
        details: 'Database connection failed',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValueOnce(mockErrorResponse),
      });

      try {
        await flypostEventsNear({ lat: 34.0195, lng: -118.4912 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError);
        expect((error as FlypostError).message).toBe('Internal server error');
        expect((error as FlypostError).status).toBe(500);
      }
    });

    it('should handle network timeouts', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Request timeout'));

      try {
        await flypostEventsNear({ lat: 34.0195, lng: -118.4912 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(FlypostError);
        expect((error as FlypostError).message).toBe('Request timeout');
      }
    });
  });
});
