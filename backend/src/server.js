/* v14
 * Flypost v4 - Minimal Backend Server (tenancy, brokerageId added after validation)
 * Endpoints: /health, POST /api/parse-and-publish, GET /v1/events/near
 * - Multi-tenant via brokerageId
 * - brokerageId comes from x-flypost-brokerage-id header (proxy) or body/query fallback
 * - Timezone-aware timestamp handling for open-houses
 * - Multi-slot open houses via occurrences[]
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { getStorageStats, clearEvents, storeEvent } from './storage.js'
import { validateEventData, getSchema } from './validation.js'
import { computeEventHash } from './hashUtils.js'
import { computeCanonicalKey, computeEventIdentity } from './utils/canonicalKey.js'
import wellKnownRouter from './wellKnownRoutes.js'
import { readLimiter } from './utils/requestHelpers.js'

// Route modules
import healthRouter from './routes/health.js'
import publishRouter from './routes/publish.js'
import eventsRouter from './routes/events.js'
import shareRouter from './routes/share.js'
import upsertRouter from './routes/upsert.js'
import presenceRouter from './routes/presence.js'
import feedbackRouter from './routes/feedback.js'
import tokensRouter from './routes/tokens.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 8080

// CORS
const frontendOrigins = [
  ...((process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)),
  'https://flypost.netlify.app',
  'https://app.goflypost.com'
]

// Add Webflow origins for Web Concierge widget (with validation)
const conciergeOrigins = ((process.env.CONCIERGE_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => {
    if (!origin) return false
    try {
      const url = new URL(origin)
      return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname
    } catch {
      console.warn(`⚠️  Invalid origin skipped: ${origin}`)
      return false
    }
  }))

const allAllowedOrigins = [...frontendOrigins, ...conciergeOrigins]

app.use(
  cors({
    origin: allAllowedOrigins,
    credentials: true
  })
)
app.use(express.json({ limit: '1mb' }))

// Trust proxy for rate limiting (important for deployment behind proxies)
app.set('trust proxy', 1)

// Request logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`)
  next()
})

// Web Concierge Feature (conditionally enabled)
const ENABLE_CONCIERGE = process.env.ENABLE_CONCIERGE === 'true'
if (ENABLE_CONCIERGE) {
  console.log('🎯 Web Concierge feature enabled')
  try {
    const { createConciergeRouter } = await import('./concierge/routes.js')
    const conciergeRouter = createConciergeRouter({
      backendUrl: `http://localhost:${port}`
    })
    app.use('/api', conciergeRouter)
    console.log('✅ Web Concierge routes mounted at /api/chat')
  } catch (error) {
    console.error('❌ Failed to load Web Concierge:', error.message)
  }
} else {
  console.log('⚪ Web Concierge feature disabled (set ENABLE_CONCIERGE=true to enable)')
}

// Mount routers
app.use(['/health', '/api/health'], healthRouter)
app.use(wellKnownRouter)
app.use('/api/parse-and-publish', publishRouter)
app.use('/v1/events/upsert', upsertRouter)
app.use('/v1/events', eventsRouter)
app.use('/e', shareRouter)
app.use('/v1/presence', presenceRouter)
app.use('/v1/feedback', feedbackRouter)
app.use('/v1/tokens', tokensRouter)

// Insights route (brokerage-level)
app.get('/v1/brokerages/:brokerageId/insights', readLimiter, async (req, res) => {
  try {
    const { brokerageId } = req.params

    if (!brokerageId) {
      return res.status(400).json({
        success: false,
        error: 'brokerageId is required'
      })
    }

    const { getFeedbackByBrokerage } = await import('./intelligenceStorage.js')
    const feedbackRecords = await getFeedbackByBrokerage(brokerageId)

    const byEvent = {}
    const recentVerbatims = []

    for (const feedback of feedbackRecords) {
      const eid = feedback.eventId

      if (!byEvent[eid]) {
        byEvent[eid] = {
          eventId: eid,
          totalResponses: 0,
          differentSnippets: []
        }
      }

      byEvent[eid].totalResponses++

      if (feedback.answers.different) {
        byEvent[eid].differentSnippets.push(feedback.answers.different)
      }

      if (recentVerbatims.length < 10) {
        recentVerbatims.push({
          feedbackId: feedback.feedbackId,
          eventId: feedback.eventId,
          different: feedback.answers.different,
          wouldBuy: feedback.answers.wouldBuy,
          createdAt: feedback.createdAt
        })
      }
    }

    res.json({
      success: true,
      brokerageId,
      summary: {
        totalFeedbackRecords: feedbackRecords.length,
        eventsWithFeedback: Object.keys(byEvent).length
      },
      byEvent: Object.values(byEvent),
      recentVerbatims
    })
  } catch (error) {
    console.error('❌ Insights error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve insights',
      details: error.message
    })
  }
})

// Agent listings route — returns events published by a given agent email
app.get('/v1/agents/:email/events', readLimiter, async (req, res) => {
  try {
    const { email } = req.params

    if (!email) {
      return res.status(400).json({ success: false, error: 'email is required' })
    }

    const { isFirestoreEnabled, getFirestoreClient } = await import('./firestoreClient.js')

    if (!isFirestoreEnabled()) {
      return res.json({ success: true, events: [] })
    }

    const db = getFirestoreClient()
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const snapshot = await db.collection('events')
      .where('flypost.agentEmail', '==', email)
      .where('startDate', '>=', cutoff)
      .orderBy('startDate', 'desc')
      .limit(10)
      .get()

    const events = snapshot.docs.map(doc => {
      const { _firestoreMetadata, ...eventData } = doc.data()
      return eventData
    })

    res.json({ success: true, events })
  } catch (error) {
    console.error('❌ Agent events error:', error)
    res.status(500).json({ success: false, error: 'Failed to retrieve agent events', details: error.message })
  }
})

// Event stats route (attendance + feedback counts)
app.get('/v1/events/:eventId/stats', readLimiter, async (req, res) => {
  try {
    const { eventId } = req.params

    const { countAttendanceByEvent, countFeedbackByEvent } = await import('./intelligenceStorage.js')
    const [attendanceCount, feedbackCount] = await Promise.all([
      countAttendanceByEvent(eventId),
      countFeedbackByEvent(eventId)
    ])

    res.json({
      success: true,
      eventId,
      attendanceCount,
      feedbackCount
    })
  } catch (error) {
    console.error('❌ Event stats error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve event stats',
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
      startDate: req.body.startDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      location: {
        '@type': 'Place',
        name: req.body.location || req.body.streetAddress || '123 Main Street',
        address: {
          '@type': 'PostalAddress',
          streetAddress: req.body.streetAddress || req.body.location || '123 Main Street',
          addressLocality: req.body.city || 'Santa Monica',
          addressRegion: req.body.state || 'CA',
          postalCode: req.body.postalCode || '90405',
          addressCountry: 'US'
        }
      },
      organizer: {
        '@type': 'Person',
        name: req.body.organizer || 'Test Organizer',
        email: req.body.email || 'test@example.com'
      }
    }

    if (req.body.endDate) {
      baseEvent.endDate = req.body.endDate
    }

    if (req.body.latitude && req.body.longitude) {
      baseEvent.location.geo = {
        '@type': 'GeoCoordinates',
        latitude: parseFloat(req.body.latitude),
        longitude: parseFloat(req.body.longitude)
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

    const eventIdentity = computeEventIdentity(validatedEvent)
    if (eventIdentity) {
      validatedEvent.flypost = {
        ...validatedEvent.flypost,
        eventIdentity: eventIdentity,
        brokerageId: brokerageId
      }
    }

    const canonicalKey = computeCanonicalKey(validatedEvent, brokerageId)
    if (canonicalKey) {
      validatedEvent.flypost.canonicalKey = canonicalKey
    }

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
    `📝 Upsert endpoint:    POST   http://localhost:${port}/v1/events/upsert`
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
