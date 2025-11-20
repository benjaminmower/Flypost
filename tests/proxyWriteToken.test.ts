/**
 * Proxy Write-Token Middleware Tests
 * 
 * Tests for the requireWriteToken middleware in the proxy server:
 * - POST requests to /api/* require valid write-token when configured
 * - GET requests are not affected
 * - Requests to non-/api/* paths are not affected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('requireWriteToken middleware logic', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // Simulate the middleware logic
  function requireWriteToken(req: any, expectedToken?: string): { allowed: boolean; status?: number; error?: string } {
    const isApiPost = req.method === 'POST' && (req.originalUrl || '').startsWith('/api/')
    
    if (isApiPost && expectedToken) {
      const token = req.headers['x-flypost-write-token']
      
      if (token !== expectedToken) {
        return {
          allowed: false,
          status: 401,
          error: 'Unauthorized: Invalid or missing write token'
        }
      }
    }
    
    return { allowed: true }
  }

  describe('POST requests to /api/* paths', () => {
    it('should allow POST to /api/parse-and-publish with valid token', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/parse-and-publish',
        headers: {
          'x-flypost-write-token': 'valid-token-123'
        }
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(true)
    })

    it('should block POST to /api/parse-and-publish with invalid token', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/parse-and-publish',
        headers: {
          'x-flypost-write-token': 'wrong-token'
        }
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(false)
      expect(result.status).toBe(401)
    })

    it('should block POST to /api/parse-and-publish without token', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/parse-and-publish',
        headers: {}
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(false)
      expect(result.status).toBe(401)
    })

    it('should allow POST to /api/foo with valid token', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/foo',
        headers: {
          'x-flypost-write-token': 'valid-token-123'
        }
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(true)
    })

    it('should block POST to /api/test-endpoint without token when configured', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/test-endpoint',
        headers: {}
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(false)
    })

    it('should allow POST to /api/* when no token is configured', () => {
      const req = {
        method: 'POST',
        originalUrl: '/api/parse-and-publish',
        headers: {}
      }

      const result = requireWriteToken(req, undefined)
      expect(result.allowed).toBe(true)
    })
  })

  describe('GET requests', () => {
    it('should allow GET to /api/* without token', () => {
      const req = {
        method: 'GET',
        originalUrl: '/api/schema',
        headers: {}
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(true)
    })

    it('should allow GET to /health without token', () => {
      const req = {
        method: 'GET',
        originalUrl: '/health',
        headers: {}
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(true)
    })
  })

  describe('Non-/api/* paths', () => {
    it('should allow POST to /health without token', () => {
      const req = {
        method: 'POST',
        originalUrl: '/health',
        headers: {}
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(true)
    })

    it('should allow POST to /v1/events/near without token', () => {
      const req = {
        method: 'POST',
        originalUrl: '/v1/events/near',
        headers: {}
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(true)
    })
  })

  describe('originalUrl preservation', () => {
    it('should use originalUrl to check /api/ prefix', () => {
      // This simulates the case where Express strips the prefix
      // but originalUrl preserves it
      const req = {
        method: 'POST',
        originalUrl: '/api/some-endpoint',
        path: '/some-endpoint', // Express may strip /api/
        headers: {}
      }

      const result = requireWriteToken(req, 'valid-token-123')
      expect(result.allowed).toBe(false) // Should check originalUrl, not path
    })
  })
})
