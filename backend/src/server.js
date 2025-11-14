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
  origin: process.env.FRONTEND_URL || 'https://flypost.netlify.app',
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`)
  next()
})

const healthHandler = (req, res) => {
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
}

// Health check endpoint (temporary dual routing for compatibility)
app.get(['/health', '/api/health'], healthHandler)

// Parse and publish endpoint - core functionality (now with alias support)
app.post('/api/parse-and-publish', async (req, res) => {
  try {
    const body = req.body || {}
    // Accept aliases for ergonomics
    let naturalLanguageInput =
      body.naturalLanguageInput ??
      body.text ??
      body.input

    const userContext = body.userContext

    if (typeof naturalLanguageInput !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing event description. Provide "naturalLanguageInput" (preferred) or one of ["text","input"] as a non-empty string.',
        providedKeys: Object.keys(body)
      })
    }

    naturalLanguageInput = naturalLanguageInput.trim()
    if (!naturalLanguageInput.length) {
      return res.status(400).json({
        success: false,
        error: 'Event description cannot be empty after trimming'
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

    // Step 3: Store
    const storedEvent = storeEvent(validation.data)
    console.log(`📦 Stored event: ${storedEvent.flypost.eventId}`)

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

// Get events near location - naive implementation (temporary dual routing for compatibility)
const getEventsNearHandler = (req, res) => {
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
}

app.get(['/v1/events/near', '/api/v1/events/near'], getEventsNearHandler)

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
      event: storedEvent
    }
  })
})

app.listen(port, () => {
  console.log('\n🚀 Flypost v4 Backend Server Started')
  console.log(`📡 Listening on port ${port}`)
  console.log(`🌐 Health check: http://localhost:${port}/health`)
  console.log(`🤖 Parse endpoint: POST http://localhost:${port}/api/parse-and-publish`)
  console.log(`📋 Events endpoint: GET http://localhost:${port}/v1/events/near\n`)
  console.log('💡 Ready for parse → publish → query loop testing!')
})
