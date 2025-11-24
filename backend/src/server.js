/* v12
 * Flypost v4 - Minimal Backend Server (tenancy, brokerageId added after validation)
 * Endpoints: /health, POST /api/parse-and-publish, GET /v1/events/near
 * - Multi-tenant via brokerageId
 * - brokerageId comes from x-flypost-brokerage-id header (proxy) or body/query fallback
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { parseEventWithLLM } from './llmParser.js'
import { validateEventData, getSchema } from './validation.js'
import { storeEvent, getEventsNear, getStorageStats, clearEvents } from './storage.js'
import { computeEventHash } from './hashUtils.js'
import { isFirestoreEnabled } from './firestoreClient.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 3001

// CORS
const frontendOrigins = [
  ...((process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)),
  'https://flypost.netlify.app',
  'https://app.goflypost.com'
]

app.use(
  cors({
    origin: frontendOrigins,
    credentials: true
  })
)
app.use(express.json({ limit: '1mb' }))

// Request logging
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

// Helper: derive brokerageId from header/body/query
function getBrokerageIdFromRequest(req, source) {
  const headerId = req.get('x-flypost-brokerage-id')
  if (headerId) return headerId

  if (source === 'body') {
    return (req.body && req.body.brokerageId) || null
  }
  if (source === 'query') {
    return (req.query && req.query.brokerageId) || null
  }
  return null
}

// Health
const healthHandler = (_req, res) => {
  const stats = getStorageStats()
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0-mvp',
    storage: {
      type: isFirestoreEnabled() ? 'hybrid (memory + Firestore)' : 'in-memory',
      events: stats.totalEvents,
      firestore: isFirestoreEnabled()
    },
    uptime: stats.uptime
  })
}

app.get(['/health', '/api/health'], healthHandler)

// Parse & publish
app.post('/api/parse-and-publish', async (req, res) => {
  try {
    const body = req.body || {}

    // tenancy: header wins, then body.brokerageId
    const brokerageId =
      getBrokerageIdFromRequest(req, 'body') || body.brokerageId || null

    if (!brokerageId) {
      return res.status(400).json({
        success: false,
        error:
          'Missing brokerageId. This should normally be injected by the proxy from the write token.'
      })
    }

    // Accept aliases for ergonomics
    let naturalLanguageInput =
      body.naturalLanguageInput ?? body.text ?? body.input
    const userContext = body.userContext

    if (typeof naturalLanguageInput !== 'string') {
      return res.status(400).json({
        success: false,
        error:
          'Missing event description. Provide "naturalLanguageInput" (preferred) or one of ["text","input"] as a non-empty string.',
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

    console.log(
      `🤖 Processing (brokerageId=${brokerageId}): "${naturalLanguageInput.substring(
        0,
        100
      )}..."`
    )

    // 1) Parse with LLM
    const parsedEvent = await parseEventWithLLM(naturalLanguageInput, userContext)
    console.log(`✅ LLM parsed event: ${parsedEvent.name}`)

    // 1.25) Normalize dates
    normalizeEventDates(parsedEvent, userContext)

    // 1.5) Enforce server-side eventId + timestamp (inside flypost)
    parsedEvent.flypost = parsedEvent.flypost || {}
    parsedEvent.flypost.eventId = `evt_${Math.random()
      .toString(36)
      .slice(2, 11)}_${Date.now()}`
    parsedEvent.flypost.submissionTimestamp = new Date().toISOString()

    // 2) Validate the *schema-only* event (no brokerageId yet)
    const validation = validateEventData(parsedEvent)
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.errors)
      return res.status(400).json({
        success: false,
        error: 'Event validation failed',
        details: validation.errors
      })
    }

    const validatedEvent = validation.data

    // 3) Compute hash over the validated event (no brokerageId)
    const eventHash = computeEventHash(validatedEvent)

    // 4) Attach brokerageId + hash AFTER validation
    const eventToStore = {
      ...validatedEvent,
      brokerageId, // tenancy metadata (not governed by schema)
      hash: eventHash
    }

    console.log(
      `🔐 Computed event hash: ${eventHash.value.substring(
        0,
        16
      )}... (brokerageId=${brokerageId})`
    )

    // 5) Store
    const storedEvent = await storeEvent(eventToStore)
    console.log(
      `📦 Stored event: ${storedEvent.flypost.eventId} (brokerageId=${storedEvent.brokerageId})`
    )

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

// Events near (with optional brokerage filter)
app.get('/v1/events/near', async (req, res) => {
  try {
    const latitude = parseFloat(req.query.lat || req.query.latitude || '34.0195')
    const longitude = parseFloat(
      req.query.lng || req.query.longitude || '-118.4912'
    )
    const radius = parseFloat(req.query.radius || '10')

    const useFirestore = isFirestoreEnabled()

    // tenancy: header wins, then query.brokerageId — but now OPTIONAL
    const brokerageId =
      getBrokerageIdFromRequest(req, 'query') || req.query.brokerageId || null

    console.log(
      `📋 Events endpoint: GET ${req.protocol}://${req.get('host')}${
        req.originalUrl
      } (brokerageId=${brokerageId || 'ALL'})`
    )

    const events = await getEventsNear(latitude, longitude, radius, useFirestore)

    let filteredEvents = events || []
    let note

    if (brokerageId) {
      // Server-side brokerage isolation
      filteredEvents = filteredEvents.filter(
        ev =>
          ev?.brokerageId === brokerageId ||
          ev?.flypost?.brokerageId === brokerageId // backward compat if any old data ever used that
      )

      note = useFirestore
        ? 'Querying from Firestore with geospatial filtering (then brokerage filter in server)'
        : 'Naive in-memory retrieval with brokerage filter'
    } else {
      // No brokerageId → return all events (for generic Flypost app)
      note = useFirestore
        ? 'Querying from Firestore with geospatial filtering (no brokerage filter)'
        : 'Naive in-memory retrieval (no brokerage filter)'
    }

    res.json({
      success: true,
      data: {
        events: filteredEvents,
        total: filteredEvents.length,
        query: req.query || {},
        brokerageId: brokerageId || null,
        source: useFirestore ? 'Firestore' : 'Memory',
        note
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
 * Dev-only utilities
 */
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Dev utilities enabled (NODE_ENV !== "production")')

  app.get('/api/schema', (_req, res) => {
    res.json(getSchema())
  })

  app.get('/api/stats', (_req, res) => {
    res.json(getStorageStats())
  })

  app.delete('/api/events', (_req, res) => {
    const cleared = clearEvents()
    res.json({
      success: true,
      message: `Cleared ${cleared} events`
    })
  })

  app.post('/api/test-add-event', async (req, res) => {
    const brokerageId = req.body.brokerageId || 'test-brokerage'

    // Build a schema-conforming base event (no brokerageId yet)
    const baseEvent = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      flypost: {
        eventId: `evt_test_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        category: req.body.category || 'garage-sales',
        realTimeData: true,
        crawlable: true,
        queryable: true,
        submissionTimestamp: new Date().toISOString()
      },
      name: req.body.name || 'Test Event',
      description: req.body.description || 'Mock event for testing',
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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

    const validation = validateEventData(baseEvent)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Mock event validation failed',
        details: validation.errors
      })
    }

    const validatedEvent = validation.data
    const eventHash = computeEventHash(validatedEvent)

    const eventToStore = {
      ...validatedEvent,
      brokerageId,
      hash: eventHash
    }

    const storedEvent = await storeEvent(eventToStore)

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
  console.log(
    '\n🚀 Flypost v4 Backend Server Started (tenancy-enabled, brokerageId post-validate)'
  )
  console.log(`📡 Listening on port ${port}`)
  console.log(`🌐 Health check:       http://localhost:${port}/health`)
  console.log(
    `🤖 Parse endpoint:     POST   http://localhost:${port}/api/parse-and-publish`
  )
  console.log(
    `📋 Events endpoint:    GET    http://localhost:${port}/v1/events/near?brokerageId=...`
  )
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🧪 Dev: schema:        GET    http://localhost:${port}/api/schema`)
    console.log(`🧪 Dev: stats:         GET    http://localhost:${port}/api/stats`)
    console.log(
      `🧪 Dev: clear events:  DELETE http://localhost:${port}/api/events`
    )
    console.log(
      `🧪 Dev: test add:      POST   http://localhost:${port}/api/test-add-event`
    )
  }
  console.log('')
})
