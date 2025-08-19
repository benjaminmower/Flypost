/*
 * Flypost v4 - Minimal Backend Server
 * Essential endpoints: /health, POST /api/parse-and-publish, GET /v1/events/near
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { parseEventWithLLM } from './llmParser.js'
import { validateEventData, getSchema } from './validation.js'
import { storeEvent, getEvents, getEventsNear, getStorageStats, clearEvents } from './storage.js'

// Load environment variables
dotenv.config()

const app = express()
const port = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`)
  next()
})

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = getStorageStats()
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0-mvp',
    storage: {
      type: 'in-memory',
      events: stats.totalEvents
    },
    uptime: stats.uptime
  })
})

// Parse and publish endpoint - core functionality
app.post('/api/parse-and-publish', async (req, res) => {
  try {
    const { naturalLanguageInput, userContext } = req.body

    if (!naturalLanguageInput || typeof naturalLanguageInput !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'naturalLanguageInput is required and must be a string'
      })
    }

    console.log(`🤖 Processing: "${naturalLanguageInput.substring(0, 100)}..."`)

    // Step 1: Parse with LLM
    const parsedEvent = await parseEventWithLLM(naturalLanguageInput, userContext)
    console.log(`✅ LLM parsed event: ${parsedEvent.name}`)

    // Step 2: Validate against schema
    const validation = validateEventData(parsedEvent)
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.errors)
      return res.status(400).json({
        success: false,
        error: 'Event validation failed',
        details: validation.errors
      })
    }

    // Step 3: Enrich and store
    const storedEvent = storeEvent(validation.data)
    
    console.log(`📦 Successfully stored event: ${storedEvent.flypost.eventId}`)

    // Return success response
    res.json({
      success: true,
      data: {
        eventId: storedEvent.flypost.eventId,
        event: storedEvent,
        processing: {
          parsed: true,
          validated: true,
          stored: true
        }
      }
    })

  } catch (error) {
    console.error('❌ Parse and publish error:', error)
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during processing',
      type: error.constructor.name
    })
  }
})

// Get events near location - naive implementation
app.get('/v1/events/near', (req, res) => {
  try {
    const { lat, lng, radius } = req.query
    
    // For MVP, just return all events regardless of location
    const events = lat && lng ? 
      getEventsNear(parseFloat(lat), parseFloat(lng), radius ? parseFloat(radius) : 10) :
      getEvents()

    console.log(`📋 Returning ${events.length} events`)

    res.json({
      success: true,
      data: {
        events: events,
        total: events.length,
        query: { lat, lng, radius },
        note: "MVP implementation returns all events - geospatial filtering not yet implemented"
      }
    })

  } catch (error) {
    console.error('❌ Events retrieval error:', error)
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during retrieval'
    })
  }
})

// Utility endpoints for development
app.get('/api/schema', (req, res) => {
  res.json(getSchema())
})

app.get('/api/stats', (req, res) => {
  res.json(getStorageStats())
})

// Debug endpoint to clear all events
app.delete('/api/events', (req, res) => {
  const cleared = clearEvents()
  res.json({
    success: true,
    message: `Cleared ${cleared} events`
  })
})

// Test endpoint to add mock events (for testing without OpenAI)
app.post('/api/test-add-event', (req, res) => {
  const mockEvent = {
    "@context": "https://schema.org",
    "@type": "Event",
    "flypost": {
      "eventId": `evt_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      "category": "garage-sales",
      "realTimeData": true,
      "crawlable": true,
      "queryable": true,
      "submissionTimestamp": new Date().toISOString()
    },
    "name": req.body.name || "Test Event",
    "description": req.body.description || "Mock event for testing",
    "startDate": new Date(Date.now() + 24*60*60*1000).toISOString(), // Tomorrow
    "location": {
      "@type": "Place",
      "name": req.body.location || "123 Main Street",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": req.body.location || "123 Main Street",
        "addressLocality": "Springfield",
        "addressRegion": "IL",
        "postalCode": "62701",
        "addressCountry": "US"
      }
    },
    "organizer": {
      "@type": "Person", 
      "name": req.body.organizer || "Test Organizer",
      "email": req.body.email || "test@example.com"
    }
  }

  const validation = validateEventData(mockEvent)
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: 'Mock event validation failed',
      details: validation.errors
    })
  }

  const storedEvent = storeEvent(validation.data)
  
  res.json({
    success: true,
    data: {
      eventId: storedEvent.flypost.eventId,
      event: storedEvent,
      note: "Mock event added for testing"
    }
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available: [
      'GET /health',
      'POST /api/parse-and-publish',
      'GET /v1/events/near',
      'GET /api/schema',
      'GET /api/stats',
      'DELETE /api/events (debug)',
      'POST /api/test-add-event (testing)'
    ]
  })
})

// Error handler
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  })
})

// Start server
app.listen(port, () => {
  console.log('\n🚀 Flypost v4 Backend Server Started')
  console.log(`📡 Listening on port ${port}`)
  console.log(`🌐 Health check: http://localhost:${port}/health`)
  console.log(`🤖 Parse endpoint: POST http://localhost:${port}/api/parse-and-publish`)
  console.log(`📋 Events endpoint: GET http://localhost:${port}/v1/events/near`)
  console.log('\n💡 Ready for parse → publish → query loop testing!\n')
})

export default app