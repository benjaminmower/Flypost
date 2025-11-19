/*
 * Flypost v4 - Minimal Backend Server (v10)
 * Essential endpoints: /health, POST /api/parse-and-publish, GET /v1/events/near
 * + Dev-only utilities when NODE_ENV !== 'production'
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { parseEventWithLLM } from './llmParser.js'
import { validateEventData, getSchema } from './validation.js'
import { storeEvent, getEventsNear, getStorageStats, clearEvents } from './storage.js'
import { computeEventHash } from './hashUtils.js'
import { isFirestoreEnabled } from './firestoreClient.js'

// Load environment variables
dotenv.config()

const app = express()
const port = process.env.PORT || 3001

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://flypost.netlify.app',
  'https://app.goflypost.com',
  'http://localhost:5173'
]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`)
  next()
})

/**
 * Utilities: ISO date normalization
 */
function isIsoDateTime(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)
}
function toIsoIfParsable(value) {
  if (typeof value !== 'string') return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}
function normalizeEventDates(event /*, userContext */) {
  // Minimal normalization: if present and not ISO-like, coerce via Date -> toISOString
  if (event.startDate && !isIsoDateTime(event.startDate)) {
    const before = event.startDate
    event.startDate = toIsoIfParsable(event.startDate)
    if (event.startDate !== before) {
      console.log(`⏱️  Normalized startDate to ISO: ${before} -> ${event.startDate}`)
    }
  }
  if (event.endDate && !isIsoDateTime(event.endDate)) {
    const before = event.endDate
    event.endDate = toIsoIfParsable(event.endDate)
    if (event.endDate !== before) {
      console.log(`⏱️  Normalized endDate to ISO: ${before} -> ${event.endDate}`)
    }
  }
}

const healthHandler = (req, res) => {
  const stats = getStorageStats()
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0-mvp', // backend version; keep simple for now
    storage: {
      type: isFirestoreEnabled() ? 'hybrid (memory + Firestore)' : 'in-memory',
      events: stats.totalEvents,
      firestore: isFirestoreEnabled()
    },
    uptime: stats.uptime
  })
}

// Health check endpoint (temporary dual routing for compatibility)
app.get(['/health', '/api/health'], healthHandler)

// Parse and publish endpoint - core functionality (with alias support)
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

    // Step 1.25: Normalize date fields to ISO 8601 to satisfy schema validation
    normalizeEventDates(parsedEvent, userContext)

    // Step 1.5: Enforce server-side ID & timestamp to avoid overwrites
    parsedEvent.flypost = parsedEvent.flypost || {}
    parsedEvent.flypost.eventId = `evt_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`
    parsedEvent.flypost.submissionTimestamp = new Date().toISOString()

    // Step 2: Validate against schema (LLM output should not have hash)
    const validation = validateEventData(parsedEvent)
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.errors)
      return res.status(400).json({
        success: false,
        error: 'Event validation failed',
        details: validation.errors
      })
    }

    // Step 3: Compute hash of validated event
    // Hash is computed AFTER validation and Flypost enrichment, BEFORE adding hash field itself
    const eventHash = computeEventHash(validation.data)
    const eventWithHash = {
      ...validation.data,
      hash: eventHash
    }
    console.log(`🔐 Computed event hash: ${eventHash.value.substring(0, 16)}...`)

    // Step 4: Store event (with hash) to memory and Firestore
    const storedEvent = await storeEvent(eventWithHash)
    console.log(`📦 Stored event: ${storedEvent.flypost.eventId}`)

    res.json({
      success: true,
      data: {
        eventId: storedEvent.flypost.eventId,
        event: storedEvent,
        processing: {
          parsed: true,
          validated: true,
          hashed: true,
          stored: true
        }
      }
    })

  } catch (error) {
    console.error('❌ Parse and publish error:', error)
    res.status(500).json({
      success: false,
      error: 'Parse and publish failed',
      details: error.message
    })
  }
})

// Events near endpoint (opinionated "near" with Santa Monica default)
app.get('/v1/events/near', async (req, res) => {
  try {
    // Default: Santa Monica if no explicit coords passed
    const latitude = parseFloat(req.query.lat || req.query.latitude || '34.0195')
    const longitude = parseFloat(req.query.lng || req.query.longitude || '-118.4912')
    const radius = parseFloat(req.query.radius || '10')

    const useFirestore = isFirestoreEnabled()
    console.log(`📋 Events endpoint: GET ${req.protocol}://${req.get('host')}${req.originalUrl}`)

    const events = await getEventsNear(latitude, longitude, radius, useFirestore)
    res.json({
      success: true,
      data: {
        events,
        total: events.length,
        query: req.query || {},
        source: useFirestore ? 'Firestore' : 'Memory',
        note: useFirestore
          ? 'Querying from Firestore with geospatial filtering'
          : 'Naive in-memory retrieval'
      }
    })
  } catch (error) {
    console.error('❌ Error retrieving events:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve events',
      details: error.message
    })
  }
})

/**
 * Dev-only utilities (schema/stats/clear/mock event)
 * Enabled when NODE_ENV !== 'production'
 */
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Dev utilities enabled (NODE_ENV !== "production")')

  // Introspect current schema
  app.get('/api/schema', (req, res) => {
    res.json(getSchema())
  })

  // Storage stats
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
  app.post('/api/test-add-event', async (req, res) => {
    const mockEvent = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      flypost: {
        eventId: `evt_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        category: req.body.category || 'garage-sales',
        realTimeData: true,
        crawlable: true,
        queryable: true,
        submissionTimestamp: new Date().toISOString()
      },
      name: req.body.name || 'Test Event',
      description: req.body.description || 'Mock event for testing',
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      location: {
        '@type': 'Place',
        name: req.body.location || '123 Main Street',
        address: {
          '@type': 'PostalAddress',
          streetAddress: req.body.location || '123 Main Street',
          addressLocality: 'Santa Monica',
          addressRegion: 'CA',
          postalCode: '90405',
          addressCountry: 'US'
        }
      },
      organizer: {
        '@type': 'Person',
        name: req.body.organizer || 'Test Organizer',
        email: req.body.email || 'test@example.com'
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

    const eventHash = computeEventHash(validation.data)
    const eventWithHash = {
      ...validation.data,
      hash: eventHash
    }

    const storedEvent = await storeEvent(eventWithHash)

    res.json({
      success: true,
      data: {
        eventId: storedEvent.flypost.eventId,
        event: storedEvent
      }
    })
  })
}

app.listen(port, () => {
  console.log('\n🚀 Flypost v4 Backend Server Started (v9.1)')
  console.log(`📡 Listening on port ${port}`)
  console.log(`🌐 Health check:       http://localhost:${port}/health`)
  console.log(`🤖 Parse endpoint:     POST   http://localhost:${port}/api/parse-and-publish`)
  console.log(`📋 Events endpoint:    GET    http://localhost:${port}/v1/events/near`)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🧪 Dev: schema:        GET    http://localhost:${port}/api/schema`)
    console.log(`🧪 Dev: stats:         GET    http://localhost:${port}/api/stats`)
    console.log(`🧪 Dev: clear events:  DELETE http://localhost:${port}/api/events`)
    console.log(`🧪 Dev: test add:      POST   http://localhost:${port}/api/test-add-event`)
  }
  console.log('')
})
