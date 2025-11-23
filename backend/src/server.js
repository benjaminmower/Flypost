/*
 * Flypost v4 Backend – Multi-Tenant via brokerageId in body/query
 * This is the canonical tenancy enforcement layer.
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

const frontendOrigins = [
  ...((process.env.FRONTEND_URL || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)),
  'https://flypost.netlify.app',
  'https://app.goflypost.com'
]

app.use(cors({ origin: frontendOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))

app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`)
  next()
})

// Utilities
function isIso(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s)
}
function toIso(v) {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toISOString()
}
function normalizeDates(evt) {
  if (evt.startDate && !isIso(evt.startDate)) evt.startDate = toIso(evt.startDate)
  if (evt.endDate && !isIso(evt.endDate)) evt.endDate = toIso(evt.endDate)
}

/**
 * Extract brokerageId from body or query.
 * Backend is the source of truth.
 */
function getBrokerageId(req) {
  const bodyVal = req.body?.brokerageId
  const queryVal = req.query?.brokerageId
  return (bodyVal || queryVal || '').toString().trim()
}

// Health
app.get(['/health', '/api/health'], (req, res) => {
  const stats = getStorageStats()
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0-mvp',
    storage: {
      type: isFirestoreEnabled() ? 'hybrid (memory + Firestore)' : 'in-memory',
      events: stats.totalEvents
    },
    uptime: stats.uptime
  })
})

// Parse + Publish
app.post('/api/parse-and-publish', async (req, res) => {
  try {
    const brokerageId = getBrokerageId(req)
    if (!brokerageId) {
      return res.status(400).json({
        success: false,
        error: 'Missing brokerageId in request body'
      })
    }

    const body = req.body || {}
    let input = body.naturalLanguageInput ?? body.text ?? body.input

    if (typeof input !== 'string' || !input.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Missing naturalLanguageInput'
      })
    }
    input = input.trim()
    console.log(`🤖 Parsing for brokerage "${brokerageId}" input="${input.slice(0, 100)}..."`)

    const parsed = await parseEventWithLLM(input, body.userContext)
    normalizeDates(parsed)

    parsed.flypost = parsed.flypost || {}
    parsed.flypost.eventId = `evt_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`
    parsed.flypost.submissionTimestamp = new Date().toISOString()
    parsed.flypost.brokerageId = brokerageId

    const validation = validateEventData(parsed)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Event validation failed',
        details: validation.errors
      })
    }

    const hash = computeEventHash(validation.data)
    const stored = await storeEvent({ ...validation.data, hash })

    res.json({
      success: true,
      data: {
        eventId: stored.flypost.eventId,
        event: stored
      }
    })
  } catch (err) {
    console.error('❌ Parse error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// Events Near
app.get('/v1/events/near', async (req, res) => {
  try {
    const brokerageId = getBrokerageId(req)
    if (!brokerageId) {
      return res.status(400).json({
        success: false,
        error: 'Missing brokerageId query parameter'
      })
    }

    const lat = parseFloat(req.query.lat || req.query.latitude || '34.0195')
    const lng = parseFloat(req.query.lng || req.query.longitude || '-118.4912')
    const radius = parseFloat(req.query.radius || '10')

    const useFs = isFirestoreEnabled()

    const all = await getEventsNear(lat, lng, radius, useFs)
    const filtered = all.filter(e => e.flypost?.brokerageId === brokerageId)

    res.json({
      success: true,
      data: {
        events: filtered,
        total: filtered.length,
        query: req.query,
        source: useFs ? 'Firestore' : 'Memory'
      }
    })
  } catch (err) {
    console.error('❌ near error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// Dev tools
if (process.env.NODE_ENV !== 'production') {
  console.log('🧪 Dev utilities enabled')

  app.get('/api/schema', (req, res) => res.json(getSchema()))
  app.get('/api/stats', (req, res) => res.json(getStorageStats()))

  app.delete('/api/events', (req, res) => {
    const cleared = clearEvents()
    res.json({ success: true, cleared })
  })
}

app.listen(port, () => {
  console.log(`🚀 Backend running on ${port}`)
})
