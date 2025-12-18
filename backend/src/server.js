/* v12
 * Flypost v4 - Minimal Backend Server (tenancy, brokerageId added after validation)
 * Endpoints: /health, POST /api/parse-and-publish, GET /v1/events/near
 * - Multi-tenant via brokerageId
 * - brokerageId comes from x-flypost-brokerage-id header (proxy) or body/query fallback
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { parseEventWithLLM } from './llmParser.js'
import { validateEventData, getSchema } from './validation.js'
import { storeEvent, getEventsNear, getStorageStats, clearEvents, findEventByIdentity, getEventById } from './storage.js'
import { computeEventHash } from './hashUtils.js'
import { isFirestoreEnabled } from './firestoreClient.js'
import { computeCanonicalKey, computeEventIdentity } from './utils/canonicalKey.js'
import { extractPriceFromText, hasValidListPrice } from './utils/priceExtractor.js'
import { sanitizeEvent } from './utils/northStarEnforcer.js'
import { mergeSources, validateSource } from './utils/sourceProvenance.js'
import { enrichEventMetadata, normalizeEventDates } from './utils/eventEnrichment.js'
import { toDiscoveryEventsV1, toDiscoveryEventV1 } from './utils/discoveryMapper.js'
import { sanitizeDiscoveryResponse } from './utils/sanitizer.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 3001

// Configuration constants
const PRESENCE_RADIUS_KM = parseFloat(process.env.PRESENCE_RADIUS_KM || '0.3') // 300 meters default
const FEEDBACK_RECENCY_THRESHOLD_HOURS = parseFloat(process.env.FEEDBACK_RECENCY_THRESHOLD_HOURS || '4') // 4 hours default
const FEEDBACK_RECENCY_THRESHOLD_MS = FEEDBACK_RECENCY_THRESHOLD_HOURS * 60 * 60 * 1000

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
    // Validate URL using built-in URL constructor
    try {
      const url = new URL(origin)
      // Robust URL validation: must be a valid http(s) URL with a hostname
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

// Rate limiters
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per 15 min
  message: { success: false, error: 'Too many event submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per 15 min
  message: { success: false, error: 'Too many read requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Stricter rate limiter for anonymous public access (no brokerage_id or key)
const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Tighter limit for public anonymous access
  message: { success: false, error: 'Too many anonymous requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Anomaly detection: track requests per IP
const ipRequestTracker = new Map()
const ANOMALY_THRESHOLD = 50 // requests per 5 minutes
const ANOMALY_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

function trackAndDetectAnomaly(ip) {
  const now = Date.now()
  
  if (!ipRequestTracker.has(ip)) {
    ipRequestTracker.set(ip, [])
  }
  
  const requests = ipRequestTracker.get(ip)
  // Remove old requests outside the window
  const recentRequests = requests.filter(timestamp => now - timestamp < ANOMALY_WINDOW_MS)
  recentRequests.push(now)
  ipRequestTracker.set(ip, recentRequests)
  
  if (recentRequests.length > ANOMALY_THRESHOLD) {
    console.warn(`⚠️  ANOMALY DETECTED: IP ${ip} made ${recentRequests.length} requests in ${ANOMALY_WINDOW_MS / 1000}s`)
    return true
  }
  
  return false
}

// Request logging and JSON response headers
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`)
  
  // Ensure all responses have JSON content type
  res.setHeader('Content-Type', 'application/json')
  
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

// Helper: derive brokerageId from header/body/query
function getBrokerageIdFromRequest(req, source) {
  const headerId = req.get('x-flypost-brokerage-id')
  if (headerId) return headerId

  if (source === 'body') {
    return (req.body && (req.body.brokerageId || req.body.brokerage_id)) || null
  }
  if (source === 'query') {
    return (req.query && (req.query.brokerageId || req.query.brokerage_id)) || null
  }
  return null
}

// Helper: reduce geo precision for public aggregate queries
function reduceGeoPrecision(lat, lng, precision = 2) {
  return {
    latitude: parseFloat(lat.toFixed(precision)),
    longitude: parseFloat(lng.toFixed(precision))
  }
}

// REMOVED: Access tier logic - all endpoints are now uniformly public Layer-1
// No tiering, no redaction variations. All discovery endpoints return the same data.

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
app.post('/api/parse-and-publish', writeLimiter, async (req, res) => {
  try {
    const body = req.body || {}

    // tenancy: header wins, then body.brokerageId
    const brokerageId =
      getBrokerageIdFromRequest(req, 'body') || body.brokerageId || null

    // Check if this is a Firebase-authenticated request
    const isFirebaseAuth = req.get('x-flypost-auth-provider') === 'firebase'

    // Require brokerageId for non-Firebase writes (machine/static-token flows)
    // Firebase-authenticated browser writes can proceed without brokerageId
    if (!brokerageId && !isFirebaseAuth) {
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
      `🤖 Processing (brokerageId=${brokerageId || 'none'}, firebaseAuth=${isFirebaseAuth}): "${naturalLanguageInput.substring(
        0,
        100
      )}..."`
    )

    // 1) Parse with LLM
    let parsedEvent = await parseEventWithLLM(naturalLanguageInput, userContext)
    console.log(`✅ LLM parsed event: ${parsedEvent.name}`)

    // 1.1) ENFORCE NORTH STAR: Strip Layer-2 intelligence fields from parsed event
    parsedEvent = sanitizeEvent(parsedEvent)

    // 1.2) DETERMINISTIC PRICE EXTRACTION & ENRICHMENT
    // If LLM didn't extract price, try deterministic extraction from input text
    if (!hasValidListPrice(parsedEvent)) {
      const extractedPrice = extractPriceFromText(naturalLanguageInput)
      if (extractedPrice) {
        console.log(`💰 Deterministic price extraction: ${extractedPrice.listPriceDisplay} → ${extractedPrice.listPrice}`)
        
        // Inject extracted price into parsed event
        parsedEvent.flypost = {
          ...parsedEvent.flypost,
          listPrice: extractedPrice.listPrice,
          listPriceDisplay: extractedPrice.listPriceDisplay,
          listPriceCurrency: extractedPrice.listPriceCurrency,
          priceType: extractedPrice.priceType
        }
        
        // Derive offers object from listPrice (same logic as parser normalization)
        parsedEvent.offers = {
          '@type': 'Offer',
          price: extractedPrice.listPrice,
          priceCurrency: extractedPrice.listPriceCurrency
        }
      }
    }

    // 2) Normalize dates (needed for eventIdentity computation)
    normalizeEventDates(parsedEvent)

    // 3) Normalize organizer phone field (telephone → phone alias)
    if (parsedEvent.organizer && typeof parsedEvent.organizer === 'object') {
      const org = parsedEvent.organizer
      if (!org.phone && org.telephone) {
        org.phone = org.telephone
        console.log(`📱 Normalized organizer.telephone → phone: ${org.phone}`)
      }
    }

    // 4) Check for existing event by identity to determine if update
    let existingEvent = null
    let isUpdate = false
    let updateCount = 0
    
    const tempIdentity = computeEventIdentity(parsedEvent)
    if (tempIdentity) {
      try {
        existingEvent = await findEventByIdentity(tempIdentity)
        if (existingEvent) {
          isUpdate = true
          updateCount = (existingEvent.flypost?.updateCount || 0) + 1
          console.log(`🔄 Found existing event ${existingEvent.flypost.eventId} for identity ${tempIdentity}`)
        }
      } catch (err) {
        console.error('⚠️ Error checking event identity:', err)
      }
    }

    // 5) Enrich event with server-side metadata
    const enrichedEvent = enrichEventMetadata(parsedEvent, {
      brokerageId,
      isUpdate,
      existingEventId: existingEvent?.flypost?.eventId,
      updateCount
    })
    
    // Legacy: Also compute old canonical key for backward compatibility during migration
    const canonicalKey = computeCanonicalKey(enrichedEvent, brokerageId)
    if (canonicalKey) {
      enrichedEvent.flypost.canonicalKey = canonicalKey
    }
    
    // 6) Add source provenance for LLM adapter
    if (existingEvent?.flypost?.sources) {
      enrichedEvent.flypost.sources = mergeSources(
        existingEvent.flypost.sources,
        { sourceType: 'llm', sourceId: 'parse-and-publish' }
      )
    } else {
      enrichedEvent.flypost.sources = mergeSources(
        [],
        { sourceType: 'llm', sourceId: 'parse-and-publish' }
      )
    }

    // 7) Validate the enriched event
    const validation = validateEventData(enrichedEvent)
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.errors)
      return res.status(400).json({
        success: false,
        error: 'Event validation failed',
        details: validation.errors
      })
    }

    const validatedEvent = validation.data

    // 8) ENFORCE PRICE REQUIREMENT
    // After parsing, extraction, and normalization, enforce that a valid list price exists
    if (!hasValidListPrice(validatedEvent)) {
      console.error('❌ Price validation failed: No valid list price found')
      return res.status(400).json({
        success: false,
        error: 'List price is required for published events',
        message: 'Please include the list price in your event description (e.g., "List Price: $1,250,000" or "$2.5 million").',
        hint: 'Supported formats: $1,250,000 | $1250000 | $2.5M | $2.5 million'
      })
    }

    // 9) Compute hash over the validated event
    const eventHash = computeEventHash(validatedEvent)

    // 10) Prepare event for storage
    const eventToStore = {
      ...validatedEvent,
      brokerageId, // tenancy metadata (not governed by schema)
      hash: eventHash
    }
    
    // If updating, preserve metadata
    if (isUpdate && existingEvent) {
      if (existingEvent._firestoreMetadata) {
        eventToStore._firestoreMetadata = {
          ...existingEvent._firestoreMetadata,
          updatedAt: new Date()
        }
      }
    }

    console.log(
      `🔐 Computed event hash: ${eventHash.value.substring(
        0,
        16
      )}... (brokerageId=${brokerageId || 'none'})`
    )

    // 11) Store (will handle upsert via eventIdentity)
    const storedEvent = await storeEvent(eventToStore)
    console.log(
      `📦 ${isUpdate ? 'Updated' : 'Stored'} event: ${storedEvent.flypost.eventId} (brokerageId=${storedEvent.brokerageId || 'none'})`
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

// REMOVED: Tiered rate limiting - all read endpoints now use uniform 500/15min rate limit
// No distinction between public/brokerage access tiers

// Events near (with optional brokerage filter) - Discovery V1 Contract
app.get('/v1/events/near', readLimiter, async (req, res) => {
  try {
    // CodeQL: lat/lng from query params is acceptable - these are public geographic coordinates
    // Validate to prevent injection attacks
    const latitude = parseFloat(req.query.lat || req.query.latitude || '34.0195')
    const longitude = parseFloat(
      req.query.lng || req.query.longitude || '-118.4912'
    )
    const radius = parseFloat(req.query.radius || '10')
    
    // Validate coordinate ranges
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latitude: must be between -90 and 90'
      })
    }
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid longitude: must be between -180 and 180'
      })
    }
    if (isNaN(radius) || radius < 0 || radius > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid radius: must be between 0 and 100 km'
      })
    }

    const useFirestore = isFirestoreEnabled()

    // tenancy: header wins, then query.brokerageId — but now OPTIONAL
    const brokerageId =
      getBrokerageIdFromRequest(req, 'query') || req.query.brokerageId || null
    
    // Track and detect anomalies
    const clientIp = req.ip || req.connection.remoteAddress
    trackAndDetectAnomaly(clientIp)

    // Date filtering parameters (ISO 8601 date-time strings)
    let startFilter = null
    let endFilter = null
    
    if (req.query.start) {
      startFilter = new Date(req.query.start)
      if (isNaN(startFilter.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid start date: must be ISO 8601 format (e.g., 2025-01-01T00:00:00Z)'
        })
      }
    }
    
    if (req.query.end) {
      endFilter = new Date(req.query.end)
      if (isNaN(endFilter.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid end date: must be ISO 8601 format (e.g., 2025-12-31T23:59:59Z)'
        })
      }
    }
    
    // Validate start < end
    if (startFilter && endFilter && startFilter >= endFilter) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date range: start date must be before end date'
      })
    }

    console.log(
      `📋 Discovery V1: GET ${req.protocol}://${req.get('host')}${
        req.path
      } lat=${latitude.toFixed(4)} lng=${longitude.toFixed(4)} radius=${radius}km (brokerageId=${brokerageId || 'ALL'}, dateRange=${startFilter ? startFilter.toISOString() : 'none'} to ${endFilter ? endFilter.toISOString() : 'none'})`
    )

    const events = await getEventsNear(latitude, longitude, radius, useFirestore)

    let filteredEvents = events || []

    if (brokerageId) {
      // Server-side brokerage isolation
      filteredEvents = filteredEvents.filter(
        ev =>
          ev?.brokerageId === brokerageId ||
          ev?.flypost?.brokerageId === brokerageId // backward compat if any old data ever used that
      )
    }

    // Date range filtering
    if (startFilter || endFilter) {
      filteredEvents = filteredEvents.filter(ev => {
        const eventStart = ev.startDate ? new Date(ev.startDate) : null
        const eventEnd = ev.endDate ? new Date(ev.endDate) : eventStart

        // Event must overlap with the requested date range
        if (startFilter && eventEnd && eventEnd < startFilter) {
          return false // Event ends before requested start
        }
        if (endFilter && eventStart && eventStart > endFilter) {
          return false // Event starts after requested end
        }
        return true
      })
    }

    // Pagination parameters
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 50)
    const cursor = req.query.cursor || null
    const sort = req.query.sort || 'distance'
    
    // Apply sorting
    if (sort === 'startDate') {
      filteredEvents.sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0)
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0)
        return dateA - dateB
      })
    }
    // 'distance' sort is already applied by getEventsNear
    
    // Apply cursor-based pagination
    let startIndex = 0
    if (cursor) {
      const cursorIndex = filteredEvents.findIndex(ev => ev.flypost?.eventId === cursor)
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1
      }
    }
    
    const paginatedEvents = filteredEvents.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < filteredEvents.length
    const nextCursor = hasMore && paginatedEvents.length > 0 
      ? paginatedEvents[paginatedEvents.length - 1].flypost?.eventId 
      : null

    // Map to Discovery V1 format (allowlist registry-safe fields only)
    // No access tier distinction - all data is uniformly Layer-1
    const discoveryEvents = toDiscoveryEventsV1(paginatedEvents, {})

    // Build Discovery V1 response
    let response = {
      success: true,
      schemaVersion: 'discovery.v1',
      events: discoveryEvents,
      meta: {
        count: discoveryEvents.length,
        totalCount: filteredEvents.length,
        radiusKm: radius,
        limit,
        hasMore
      }
    }
    
    if (nextCursor) {
      response.meta.cursor = nextCursor
    }

    // Apply runtime sanitizer to strip any forbidden keys that might have leaked
    response = sanitizeDiscoveryResponse(response)

    res.json(response)
  } catch (error) {
    console.error('❌ Error retrieving events:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve events',
      details: error.message
    })
  }
})

// Get single event by ID - Discovery V1 Contract
app.get('/v1/events/:event_id', readLimiter, async (req, res) => {
  try {
    const { event_id } = req.params
    
    if (!event_id) {
      return res.status(400).json({
        success: false,
        error: 'event_id parameter is required'
      })
    }
    
    // Track and detect anomalies
    const clientIp = req.ip || req.connection.remoteAddress
    trackAndDetectAnomaly(clientIp)

    console.log(
      `📋 Discovery V1: GET ${req.protocol}://${req.get('host')}${req.path} (eventId=${event_id})`
    )

    // Try to get event from storage (wrap in try-catch for safety)
    let event = null
    try {
      event = getEventById(event_id)
    } catch (storageError) {
      console.error('❌ Storage error:', storageError)
      throw storageError
    }
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        eventId: event_id
      })
    }

    // Check brokerage isolation if brokerageId is provided
    const brokerageId = getBrokerageIdFromRequest(req, 'query') || req.query.brokerageId
    if (brokerageId) {
      if (event.brokerageId !== brokerageId && event.flypost?.brokerageId !== brokerageId) {
        return res.status(404).json({
          success: false,
          error: 'Event not found',
          eventId: event_id
        })
      }
    }

    // Map to Discovery V1 format (allowlist registry-safe fields only)
    // No access tier distinction - all data is uniformly Layer-1
    const discoveryEvent = toDiscoveryEventV1(event, {})

    if (!discoveryEvent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to format event'
      })
    }

    // Build Discovery V1 response
    let response = {
      success: true,
      schemaVersion: 'discovery.v1',
      event: discoveryEvent,
      meta: {}
    }

    // Apply runtime sanitizer to strip any forbidden keys that might have leaked
    response = sanitizeDiscoveryResponse(response)

    res.json(response)
  } catch (error) {
    console.error('❌ Error retrieving event:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve event',
      details: error.message
    })
  }
})

/**
 * POST /v1/events/upsert
 * Canonical structured ingestion endpoint for machine sources
 * (MLS, calendar, scraper, manual, LLM adapter)
 * 
 * Body:
 * - event (required): Full Schema.org Event object
 * - source (optional): { sourceType: string, sourceId?: string }
 * 
 * Behavior:
 * - Validates the event using AJV
 * - Strips Layer 2 intelligence fields (North Star enforcement)
 * - Computes event identity (brokerage-agnostic)
 * - Upserts by eventIdentity (insert if new, update if exists)
 * - Tracks source provenance
 * - Returns operation type (insert/update) and event data
 */
app.post('/v1/events/upsert', writeLimiter, async (req, res) => {
  try {
    const body = req.body || {}
    
    // 1. Validate request structure
    if (!body.event || typeof body.event !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Request body must include an "event" object'
      })
    }
    
    // 2. Validate source if provided
    if (body.source) {
      const sourceValidation = validateSource(body.source)
      if (!sourceValidation.valid) {
        return res.status(400).json({
          success: false,
          error: `Invalid source: ${sourceValidation.error}`
        })
      }
    }
    
    // 3. Apply North Star enforcement: strip Layer 2 intelligence fields
    let event = sanitizeEvent(body.event)
    
    // 4. Normalize dates
    normalizeEventDates(event)
    
    // 5. Check for existing event by identity
    let existingEvent = null
    let isUpdate = false
    let updateCount = 0
    
    // First compute identity to check for existing
    const tempIdentity = computeEventIdentity(event)
    
    if (tempIdentity) {
      try {
        existingEvent = await findEventByIdentity(tempIdentity)
        if (existingEvent) {
          isUpdate = true
          updateCount = (existingEvent.flypost?.updateCount || 0) + 1
          console.log(`🔄 Found existing event ${existingEvent.flypost.eventId} for identity ${tempIdentity}`)
        }
      } catch (err) {
        console.error('⚠️ Error checking event identity:', err)
        // Continue as new event if check fails
      }
    }
    
    // 6. Enrich event with server-side metadata
    event = enrichEventMetadata(event, {
      isUpdate,
      existingEventId: existingEvent?.flypost?.eventId,
      updateCount
    })
    
    // 7. Handle source provenance
    if (body.source || existingEvent?.flypost?.sources) {
      const existingSources = existingEvent?.flypost?.sources || []
      event.flypost.sources = mergeSources(existingSources, body.source)
    }
    
    // 8. Validate the enriched event
    const validation = validateEventData(event)
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.errors)
      return res.status(400).json({
        success: false,
        error: 'Event validation failed',
        details: validation.errors
      })
    }
    
    const validatedEvent = validation.data
    
    // 9. Compute hash
    const eventHash = computeEventHash(validatedEvent)
    console.log(`🔐 Computed event hash: ${eventHash.value.substring(0, 16)}...`)
    
    // 10. Prepare event for storage
    const eventToStore = {
      ...validatedEvent,
      hash: eventHash
    }
    
    // 11. If updating, preserve metadata
    if (isUpdate && existingEvent) {
      // Preserve Firestore metadata
      if (existingEvent._firestoreMetadata) {
        eventToStore._firestoreMetadata = {
          ...existingEvent._firestoreMetadata,
          updatedAt: new Date()
        }
      }
    }
    
    // 12. Store
    const storedEvent = await storeEvent(eventToStore)
    console.log(`📦 ${isUpdate ? 'Updated' : 'Inserted'} event: ${storedEvent.flypost.eventId}`)
    
    // 13. Return response
    res.json({
      success: true,
      operation: isUpdate ? 'update' : 'insert',
      data: {
        eventId: storedEvent.flypost.eventId,
        eventIdentity: storedEvent.flypost.eventIdentity,
        updateCount: storedEvent.flypost.updateCount,
        event: storedEvent
      }
    })
  } catch (error) {
    console.error('❌ Upsert error:', error)
    res.status(500).json({
      success: false,
      error: 'Event upsert failed',
      details: error.message
    })
  }
})

/**
 * POST /v1/presence/check-in
 * Create an attendance record for presence at an event
 * 
 * Body:
 * - eventId (optional): Specific event ID, or will match nearest event
 * - lat (required): Latitude
 * - lng (required): Longitude
 * - buyerToken (required): Opaque buyer identifier
 * - method (optional): 'geo_time', 'qr', or 'geo_time_qr'
 * - timestamp (optional): ISO timestamp for check-in
 */
app.post('/v1/presence/check-in', writeLimiter, async (req, res) => {
  try {
    const { eventId, lat, lng, buyerToken, method, timestamp } = req.body

    if (!buyerToken) {
      return res.status(400).json({
        success: false,
        error: 'buyerToken is required'
      })
    }

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'lat and lng are required for presence verification'
      })
    }

    let targetEventId = eventId
    let matchedBy = 'explicit'

    // If no eventId provided, find nearest event
    if (!targetEventId) {
      const useFirestore = isFirestoreEnabled()
      const nearbyEvents = await getEventsNear(
        parseFloat(lat),
        parseFloat(lng),
        PRESENCE_RADIUS_KM,
        useFirestore
      )

      if (!nearbyEvents || nearbyEvents.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No events found within proximity for check-in',
          hint: 'Make sure you are at the event location'
        })
      }

      // For now, use the first/nearest event
      // TODO: Add time window filtering based on timestamp
      targetEventId = nearbyEvents[0].flypost.eventId
      matchedBy = 'nearest'
      console.log(`📍 Matched nearest event: ${targetEventId}`)
    }

    // Create attendance record
    const { storeAttendance } = await import('./intelligenceStorage.js')
    
    const attendance = await storeAttendance({
      eventId: targetEventId,
      buyerToken,
      checkInTime: timestamp || new Date().toISOString(),
      presenceProof: {
        method: method || 'geo_time',
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        matchedBy
      }
    })

    res.json({
      success: true,
      attendance: {
        attendanceId: attendance.attendanceId,
        eventId: attendance.eventId,
        checkInTime: attendance.checkInTime,
        matchedBy
      }
    })
  } catch (error) {
    console.error('❌ Check-in error:', error)
    res.status(500).json({
      success: false,
      error: 'Check-in failed',
      details: error.message
    })
  }
})

/**
 * POST /v1/feedback/submit
 * Submit feedback for an event (requires recent attendance)
 * 
 * Body:
 * - attendanceId (optional): Specific attendance record
 * - eventId (optional): Event ID (if attendanceId not provided, requires buyerToken)
 * - buyerToken (optional): Buyer token (if attendanceId not provided)
 * - answers (required): { liked, disliked, wantsSimilar }
 * - brokerageAffiliation (optional): Brokerage ID for routing
 */
app.post('/v1/feedback/submit', writeLimiter, async (req, res) => {
  try {
    const { attendanceId, eventId, buyerToken, answers, brokerageAffiliation } = req.body

    if (!answers || !answers.hasOwnProperty('wantsSimilar')) {
      return res.status(400).json({
        success: false,
        error: 'answers object with wantsSimilar is required'
      })
    }

    const { 
      findAttendanceById, 
      findAttendanceByEventAndBuyer, 
      storeFeedback 
    } = await import('./intelligenceStorage.js')

    let attendance = null

    // Find attendance record
    if (attendanceId) {
      attendance = await findAttendanceById(attendanceId)
    } else if (eventId && buyerToken) {
      const records = await findAttendanceByEventAndBuyer(eventId, buyerToken)
      if (records.length > 0) {
        // Get most recent
        attendance = records.sort((a, b) => 
          new Date(b.checkInTime) - new Date(a.checkInTime)
        )[0]
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either attendanceId or (eventId + buyerToken) is required'
      })
    }

    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: 'No attendance record found',
        hint: 'You must check in at the event before submitting feedback'
      })
    }

    // Enforce presence gate: attendance must be recent
    const checkInTime = new Date(attendance.checkInTime)
    const now = new Date()
    const timeSinceCheckIn = now - checkInTime

    if (timeSinceCheckIn > FEEDBACK_RECENCY_THRESHOLD_MS) {
      return res.status(403).json({
        success: false,
        error: `Attendance record is too old (must be within ${FEEDBACK_RECENCY_THRESHOLD_HOURS} hours)`,
        checkInTime: attendance.checkInTime,
        hoursAgo: Math.round(timeSinceCheckIn / (60 * 60 * 1000))
      })
    }

    // Store feedback
    const feedback = await storeFeedback({
      attendanceId: attendance.attendanceId,
      eventId: attendance.eventId,
      answers: {
        liked: answers.liked || '',
        disliked: answers.disliked || '',
        wantsSimilar: Boolean(answers.wantsSimilar)
      },
      brokerageAffiliation: brokerageAffiliation || null
    })

    res.json({
      success: true,
      feedback: {
        feedbackId: feedback.feedbackId,
        eventId: feedback.eventId,
        createdAt: feedback.createdAt
      }
    })
  } catch (error) {
    console.error('❌ Feedback submission error:', error)
    res.status(500).json({
      success: false,
      error: 'Feedback submission failed',
      details: error.message
    })
  }
})

/**
 * GET /v1/brokerages/:brokerageId/insights
 * Get aggregated feedback insights for a brokerage
 * 
 * Returns basic aggregations of feedback where brokerageAffiliation matches
 */
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

    // Basic aggregation by eventId
    const byEvent = {}
    const recentVerbatims = []

    for (const feedback of feedbackRecords) {
      const eid = feedback.eventId
      
      if (!byEvent[eid]) {
        byEvent[eid] = {
          eventId: eid,
          totalResponses: 0,
          wantsSimilarCount: 0,
          likedSnippets: [],
          dislikedSnippets: []
        }
      }

      byEvent[eid].totalResponses++
      if (feedback.answers.wantsSimilar) {
        byEvent[eid].wantsSimilarCount++
      }

      if (feedback.answers.liked) {
        byEvent[eid].likedSnippets.push(feedback.answers.liked)
      }
      if (feedback.answers.disliked) {
        byEvent[eid].dislikedSnippets.push(feedback.answers.disliked)
      }

      // Collect recent verbatims (last 10)
      if (recentVerbatims.length < 10) {
        recentVerbatims.push({
          feedbackId: feedback.feedbackId,
          eventId: feedback.eventId,
          liked: feedback.answers.liked,
          disliked: feedback.answers.disliked,
          wantsSimilar: feedback.answers.wantsSimilar,
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
    
    // Add optional geo coordinates if provided
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
    
    // Compute event identity (brokerage-agnostic)
    const eventIdentity = computeEventIdentity(validatedEvent)
    if (eventIdentity) {
      validatedEvent.flypost = {
        ...validatedEvent.flypost,
        eventIdentity: eventIdentity,
        brokerageId: brokerageId
      }
    }
    
    // Also compute legacy canonical key for backward compatibility
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

// Global error handler - ensure all errors return JSON
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err)
  
  // Set JSON content type
  res.setHeader('Content-Type', 'application/json')
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500
  
  // Return JSON error
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  })
})

// 404 handler - return JSON for not found routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  })
})

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
