/**
 * Web Concierge - Express Routes
 * 
 * Defines the /api/chat endpoint for the Web Concierge feature.
 * This is completely isolated from the main v4 production endpoints.
 */

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { processChatMessage } from './chatHandler.js'

/**
 * Create concierge router with all endpoints
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.backendUrl - Internal backend URL for API calls
 * @returns {Router} Express router
 */
export function createConciergeRouter(config) {
  const router = Router()
  const backendUrl = config.backendUrl || process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001'

  // Rate limiter for chat endpoint - more restrictive than regular API
  const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 chat requests per 15 min
    message: { 
      success: false, 
      error: 'Too many chat requests. Please wait a moment and try again.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
  })

  /**
   * POST /api/chat
   * 
   * Chat endpoint for Web Concierge
   * 
   * Request body:
   * {
   *   "message": "What events are happening near me?",
   *   "lat": 34.0195,              // Optional: latitude
   *   "lng": -118.4912,            // Optional: longitude
   *   "brokerageId": "vista-sir",  // Optional
   *   "conversationHistory": [],   // Optional: array of previous messages
   *   "history": []                // Optional: array of {role, content} for follow-ups
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "message": "Markdown-formatted response with headings, lists, tables, etc.",
   *   "listings": [],  // Deprecated: kept for backward compatibility
   *   "scheduleNote": null,  // Deprecated: kept for backward compatibility
   *   "areaContext": null,  // Deprecated: kept for backward compatibility
   *   "suggestedFollowUps": [],  // Deprecated: kept for backward compatibility
   *   "details": null,  // Optional: expanded listing details when requested
   *   "timestamp": "2024-01-01T12:00:00.000Z"
   * }
   * 
   * Note: The response now returns Markdown-formatted content in the "message" field.
   * The structured fields (listings, scheduleNote, etc.) are deprecated but included
   * as empty values for backward compatibility with older widget versions.
   * Coordinates are optional; if missing, model will ask for location clarification.
   */
  router.post('/chat', chatLimiter, async (req, res) => {
    const startTime = Date.now()
    
    try {
      // Validate request body
      const { message, lat, lng, brokerageId, conversationHistory, history } = req.body || {}

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid "message" field. Please provide a non-empty string.'
        })
      }

      // Validate brokerageId if provided
      if (brokerageId !== undefined && typeof brokerageId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid "brokerageId" field. Must be a string if provided.'
        })
      }

      // Validate conversationHistory if provided
      if (conversationHistory !== undefined && !Array.isArray(conversationHistory)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid "conversationHistory" field. Must be an array if provided.'
        })
      }

      // Validate history if provided
      if (history !== undefined && !Array.isArray(history)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid "history" field. Must be an array if provided.'
        })
      }

      // Parse coordinates - now optional (allow undefined for location clarification)
      let latitude = undefined
      let longitude = undefined

      if (lat !== undefined && lat !== null) {
        latitude = typeof lat === 'number' ? lat : parseFloat(lat)
        if (isNaN(latitude)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid latitude. Must be a valid number.'
          })
        }
        // Validate coordinate range only if provided
        if (latitude < -90 || latitude > 90) {
          return res.status(400).json({
            success: false,
            error: 'Invalid latitude. Must be between -90 and 90 degrees.'
          })
        }
      }

      if (lng !== undefined && lng !== null) {
        longitude = typeof lng === 'number' ? lng : parseFloat(lng)
        if (isNaN(longitude)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid longitude. Must be a valid number.'
          })
        }
        // Validate coordinate range only if provided
        if (longitude < -180 || longitude > 180) {
          return res.status(400).json({
            success: false,
            error: 'Invalid longitude. Must be between -180 and 180 degrees.'
          })
        }
      }

      // Log request (GDPR-compliant - no PII)
      const logBrokerageId = brokerageId ? `, brokerageId=${brokerageId}` : ''
      const logHistory = conversationHistory ? `, history_msgs=${conversationHistory.length}` : ''
      const logContextHistory = history ? `, context_history=${history.length}` : ''
      const latStr = latitude !== undefined ? latitude.toFixed(4) : 'n/a'
      const lngStr = longitude !== undefined ? longitude.toFixed(4) : 'n/a'
      console.log(`🤖 Concierge chat request: lat=${latStr}, lng=${lngStr}, msg_length=${message.length}${logBrokerageId}${logHistory}${logContextHistory}`)

      // Process chat message (use history if provided, otherwise conversationHistory)
      const contextHistory = history || conversationHistory
      const result = await processChatMessage(
        message.trim(),
        latitude,
        longitude,
        backendUrl,
        brokerageId,
        contextHistory
      )

      const duration = Date.now() - startTime

      if (result.success) {
        console.log(`✅ Concierge response generated (${duration}ms)`)
        return res.json({
          success: true,
          message: result.message,
          // Include empty arrays for backward compatibility with older clients
          listings: [],
          scheduleNote: null,
          areaContext: null,
          suggestedFollowUps: [],
          details: result.details || null,
          timestamp: new Date().toISOString()
        })
      } else {
        console.error(`❌ Concierge error: ${result.error || 'Unknown error'}`)
        return res.status(500).json({
          success: false,
          error: result.error || 'Failed to process chat message',
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`❌ Concierge error (${duration}ms):`, error)
      
      return res.status(500).json({
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * POST /api/chat/stream
   * 
   * Streaming chat endpoint for Web Concierge (Server-Sent Events)
   * Provides progressive token streaming like ChatGPT
   * 
   * Request body: Same as /api/chat
   * {
   *   "message": "What events are happening near me?",
   *   "lat": 34.0195,              // Optional: latitude
   *   "lng": -118.4912,            // Optional: longitude
   *   "brokerageId": "vista-sir",  // Optional
   *   "conversationHistory": [],   // Optional: array of previous messages
   *   "history": []                // Optional: array of {role, content} for follow-ups
   * }
   * 
   * Response: SSE stream
   * data: {"type": "token", "content": "Hello"}
   * data: {"type": "token", "content": " world"}
   * data: {"type": "done"}
   */
  router.post('/chat/stream', chatLimiter, async (req, res) => {
    const startTime = Date.now()
    
    try {
      // Validate request body
      const { message, lat, lng, brokerageId, conversationHistory, history } = req.body || {}

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid "message" field. Please provide a non-empty string.'
        })
      }

      // Validate brokerageId if provided
      if (brokerageId !== undefined && typeof brokerageId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid "brokerageId" field. Must be a string if provided.'
        })
      }

      // Validate conversationHistory if provided
      if (conversationHistory !== undefined && !Array.isArray(conversationHistory)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid "conversationHistory" field. Must be an array if provided.'
        })
      }

      // Validate history if provided
      if (history !== undefined && !Array.isArray(history)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid "history" field. Must be an array if provided.'
        })
      }

      // Parse coordinates - now optional (allow undefined for location clarification)
      let latitude = undefined
      let longitude = undefined

      if (lat !== undefined && lat !== null) {
        latitude = typeof lat === 'number' ? lat : parseFloat(lat)
        if (isNaN(latitude)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid latitude. Must be a valid number.'
          })
        }
        // Validate coordinate range only if provided
        if (latitude < -90 || latitude > 90) {
          return res.status(400).json({
            success: false,
            error: 'Invalid latitude. Must be between -90 and 90 degrees.'
          })
        }
      }

      if (lng !== undefined && lng !== null) {
        longitude = typeof lng === 'number' ? lng : parseFloat(lng)
        if (isNaN(longitude)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid longitude. Must be a valid number.'
          })
        }
        // Validate coordinate range only if provided
        if (longitude < -180 || longitude > 180) {
          return res.status(400).json({
            success: false,
            error: 'Invalid longitude. Must be between -180 and 180 degrees.'
          })
        }
      }

      // Log request (GDPR-compliant - no PII)
      const logBrokerageId = brokerageId ? `, brokerageId=${brokerageId}` : ''
      const logHistory = conversationHistory ? `, history_msgs=${conversationHistory.length}` : ''
      const logContextHistory = history ? `, context_history=${history.length}` : ''
      const latStr = latitude !== undefined ? latitude.toFixed(4) : 'n/a'
      const lngStr = longitude !== undefined ? longitude.toFixed(4) : 'n/a'
      console.log(`🤖 Concierge streaming request: lat=${latStr}, lng=${lngStr}, msg_length=${message.length}${logBrokerageId}${logHistory}${logContextHistory}`)

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

      // Send initial connection event
      res.write('data: {"type":"connected"}\n\n')

      // Process chat message with streaming callback (use history if provided, otherwise conversationHistory)
      const contextHistory = history || conversationHistory
      await processChatMessage(
        message.trim(),
        latitude,
        longitude,
        backendUrl,
        brokerageId,
        contextHistory,
        (token) => {
          // Send each token as SSE event
          const data = JSON.stringify({ type: 'token', content: token })
          res.write(`data: ${data}\n\n`)
        }
      )

      // Send completion event
      const duration = Date.now() - startTime
      res.write(`data: ${JSON.stringify({ type: 'done', duration })}\n\n`)
      console.log(`✅ Concierge streaming completed (${duration}ms)`)
      res.end()
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`❌ Concierge streaming error (${duration}ms):`, error)
      
      // Send error event
      const errorData = JSON.stringify({ 
        type: 'error', 
        message: 'An unexpected error occurred. Please try again.' 
      })
      res.write(`data: ${errorData}\n\n`)
      res.end()
    }
  })

  /**
   * GET /api/chat/health
   * 
   * Health check for concierge service
   */
  router.get('/chat/health', (req, res) => {
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
    
    res.json({
      status: 'healthy',
      service: 'web-concierge',
      timestamp: new Date().toISOString(),
      configured: hasOpenAIKey
    })
  })

  return router
}
