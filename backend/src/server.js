/* v13
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
import rateLimit from 'express-rate-limit'
import { parseEventWithLLM } from './llmParser.js'
import { validateEventData, getSchema } from './validation.js'
import { storeEvent, getEventsNear, getStorageStats, clearEvents, findEventByIdentity, getEventById, getEventByIdAny } from './storage.js'
import { computeEventHash } from './hashUtils.js'
import { isFirestoreEnabled } from './firestoreClient.js'
import { computeCanonicalKey, computeEventIdentity } from './utils/canonicalKey.js'
import { extractPriceFromText, hasValidListPrice } from './utils/priceExtractor.js'
import { sanitizeEvent } from './utils/northStarEnforcer.js'
import { mergeSources, validateSource } from './utils/sourceProvenance.js'
import { extractFirstUrl } from './utils/urlExtractor.js'
import { enrichEventMetadata, normalizeEventDates } from './utils/eventEnrichment.js'
import { toDiscoveryEventsV1, toDiscoveryEventV1 } from './utils/discoveryMapper.js'
import { sanitizeDiscoveryResponse } from './utils/sanitizer.js'
import { geocodeAddress } from './geocode.js'
import { inferTimezoneFromCoordinates, hasExplicitTimezone } from './utils/timezone.js'
import { buildEventShareMeta, buildShareOgHtml } from './sharePage.js'
import { 
  normalizeOpenHouseTimestamps, 
  generateOccurrenceId, 
  selectUpcomingOccurrence,
  validateOpenHouseEndDate,
  convertOpenHouseLocalIntent
} from './utils/timeNormalization.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 8080

// Configuration constants
const PRESENCE_RADIUS_KM = parseFloat(process.env.PRESENCE_RADIUS_KM || '0.3') // 300 meters default (backward compat); recommended: 0.1 (100m)
const FEEDBACK_RECENCY_THRESHOLD_HOURS = parseFloat(process.env.FEEDBACK_RECENCY_THRESHOLD_HOURS || '4') // 4 hours default
const FEEDBACK_RECENCY_THRESHOLD_MS = FEEDBACK_RECENCY_THRESHOLD_HOURS * 60 * 60 * 1000

// Helper: Calculate distance between two coordinates using Haversine formula
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180)
}

// Helper: Normalize feedback text field (trim, cap at 500 chars, empty → null)
function normalizeFeedbackText(text) {
  if (typeof text !== 'string') {
    return null
  }
  
  const trimmed = text.trim()
  
  if (trimmed.length === 0) {
    return null
  }
  
  // Cap at 500 characters
  return trimmed.substring(0, 500)
}

// Helper: Normalize wouldBuy field (validate "yes"|"maybe"|"no")
function normalizeWouldBuy(value) {
  if (value === null || value === undefined) {
    return null
  }
  
  if (typeof value !== 'string') {
    return null
  }
  
  const normalized = value.toLowerCase().trim()
  
  if (normalized === 'yes' || normalized === 'maybe' || normalized === 'no') {
    return normalized
  }
  
  return null
}

// Helper: Detect if input text describes multiple time slots
// Uses heuristics to identify multiple day/date/time patterns
function detectMultipleTimeSlots(text) {
  if (!text || typeof text !== 'string') {
    return false
  }
  
  const lowerText = text.toLowerCase()
  
  // Count distinct weekday mentions (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
  const weekdayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi
  const weekdays = text.match(weekdayPattern) || []
  const uniqueWeekdays = new Set(weekdays.map(d => d.toLowerCase().substring(0, 3)))
  
  if (uniqueWeekdays.size >= 2) {
    return true
  }
  
  // Count time range patterns (e.g., "11-1", "2:30-5:30", "10am-2pm")
  const timeRangePattern = /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\s*[-–—to]\s*\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\b/gi
  const timeRanges = text.match(timeRangePattern) || []
  
  if (timeRanges.length >= 2) {
    return true
  }
  
  // Count date-like patterns (e.g., "Jan 3", "1/3", "January 3rd")
  const datePattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(st|nd|rd|th)?\b|\b\d{1,2}\/\d{1,2}\b/gi
  const dates = text.match(datePattern) || []
  
  if (dates.length >= 2) {
    return true
  }
  
  // Check for explicit "and" between time indicators
  // e.g., "Saturday 11-1 and Sunday 2-4"
  const andPattern = /\b(morning|afternoon|evening|\d{1,2}\s*(am|pm)?)\s+and\s+(morning|afternoon|evening|\d{1,2}\s*(am|pm)?)\b/i
  if (andPattern.test(text)) {
    return true
  }
  
  return false
}

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

// Helper: determine access tier (public vs brokerage-scoped)
function getAccessTier(req) {
  const brokerageId = getBrokerageIdFromRequest(req, 'query')
  // CodeQL: api_key in query is acceptable for read-only public API
  // Prefer header (x-api-key) but allow query param for AI plugin compatibility
  const hasApiKey = req.get('x-api-key') || req.query.api_key
  
  if (brokerageId || hasApiKey) {
    return 'brokerage' // Full fidelity
  }
  return 'public' // Reduced precision and fewer fields
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

    // 1.05) STRIP CLIENT-SUPPLIED EVENTID (defense in depth)
    // Prevent LLM/client from influencing eventId - server generates on insert
    if (parsedEvent.flypost?.eventId) {
      delete parsedEvent.flypost.eventId
      console.log(`🛡️  Stripped client-supplied eventId (server will generate)`)
    }

    // 1.1) DETERMINISTIC URL EXTRACTION
    // Extract external listing URL from raw input (deterministic, no LLM)
    const extractedUrl = extractFirstUrl(naturalLanguageInput)
    if (extractedUrl) {
      console.log(`🔗 Extracted external URL: ${extractedUrl}`)
      // Set as top-level event.url (Schema.org Event.url)
      parsedEvent.url = extractedUrl
    }

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

    // 3.5) GEOCODE ENRICHMENT & ENFORCEMENT
    // Require event.location.geo for publishing to prevent false-positive presence matches
    const hasGeo = parsedEvent.location?.geo?.latitude != null && parsedEvent.location?.geo?.longitude != null
    
    if (!hasGeo) {
      console.log(`🗺️  Event missing geo coordinates, attempting geocode enrichment...`)
      
      // Construct address string from location fields
      let addressParts = []
      if (parsedEvent.location?.address) {
        const addr = parsedEvent.location.address
        if (addr.streetAddress) addressParts.push(addr.streetAddress)
        if (addr.addressLocality) addressParts.push(addr.addressLocality)
        if (addr.addressRegion) addressParts.push(addr.addressRegion)
        if (addr.postalCode) addressParts.push(addr.postalCode)
        if (addr.addressCountry) addressParts.push(addr.addressCountry)
      }
      
      const addressString = addressParts.join(', ')
      
      if (addressString) {
        // Attempt geocoding
        const geocodeResult = await geocodeAddress(addressString)
        
        if (geocodeResult) {
          // Success: attach geo coordinates
          if (!parsedEvent.location) parsedEvent.location = { '@type': 'Place' }
          parsedEvent.location.geo = {
            '@type': 'GeoCoordinates',
            latitude: geocodeResult.latitude,
            longitude: geocodeResult.longitude
          }
          console.log(`✅ Geocode enrichment successful: ${geocodeResult.latitude}, ${geocodeResult.longitude}`)
        } else {
          // Geocoding failed - reject publish
          console.error(`❌ Geocode enrichment failed for address: ${addressString}`)
          return res.status(400).json({
            success: false,
            error: 'Validation error: event.location.geo (latitude and longitude) is required for publishing events',
            hint: 'Provide a full address or set GEOCODER_API_KEY to enable automatic geocoding',
            address: addressString
          })
        }
      } else {
        // No address to geocode - reject publish
        console.error(`❌ No address available for geocoding`)
        return res.status(400).json({
          success: false,
          error: 'Validation error: event.location.geo (latitude and longitude) is required for publishing events',
          hint: 'Provide a full address or set GEOCODER_API_KEY to enable automatic geocoding'
        })
      }
    } else {
      console.log(`✅ Event has geo coordinates: ${parsedEvent.location.geo.latitude}, ${parsedEvent.location.geo.longitude}`)
    }

    // 3.75) TIMEZONE INFERENCE & TIMESTAMP NORMALIZATION
    // Infer timezone from geo coordinates and store on event
    const latitude = parsedEvent.location.geo.latitude
    const longitude = parsedEvent.location.geo.longitude
    const inferredTimezone = inferTimezoneFromCoordinates(latitude, longitude)
    
    if (inferredTimezone) {
      // Store timezone on event
      parsedEvent.flypost = parsedEvent.flypost || {}
      parsedEvent.flypost.timezone = inferredTimezone
      console.log(`🌍 Inferred timezone: ${inferredTimezone}`)
    } else {
      console.warn(`⚠️  Could not infer timezone for coordinates: ${latitude}, ${longitude}`)
    }

    // 3.76) OPEN-HOUSE LOCAL INTENT CONVERSION (NEW PIPELINE)
    // For open-houses category, convert local intent to canonical UTC timestamps
    if (parsedEvent.flypost?.category === 'open-houses') {
      try {
        // Hard rule: ignore any model-provided startDate/endDate for open-houses
        // Backend derives canonical UTC from occurrences[].local.* only
        if (parsedEvent.startDate) {
          delete parsedEvent.startDate
          console.log(`🛡️  Stripped model-provided startDate for open-house (will derive from local intent)`)
        }
        if (parsedEvent.endDate) {
          delete parsedEvent.endDate
          console.log(`🛡️  Stripped model-provided endDate for open-house (will derive from local intent)`)
        }
        
        // Convert local intent to UTC timestamps
        // This function validates local intent, converts to UTC, and sets timeNormalizationVersion
        parsedEvent = convertOpenHouseLocalIntent(parsedEvent, inferredTimezone)
        
      } catch (error) {
        console.error(`❌ Open-house local intent conversion failed: ${error.message}`)
        return res.status(400).json({
          success: false,
          error: error.code || 'OPEN_HOUSE_CONVERSION_FAILED',
          message: error.message
        })
      }
    } else {
      // For non-open-house categories, apply legacy timestamp normalization if needed
      const hasExplicitTz = hasExplicitTimezone(naturalLanguageInput)
      if (inferredTimezone && !hasExplicitTz) {
        normalizeOpenHouseTimestamps(parsedEvent, hasExplicitTz, inferredTimezone)
      }
    }

    // 3.8) VALIDATE ENDDATE FOR OPEN-HOUSES
    // Open houses require endDate for presence gating (now generated by conversion)
    const endDateValidation = validateOpenHouseEndDate(parsedEvent)
    if (!endDateValidation.valid) {
      console.error(`❌ Open house validation failed: ${endDateValidation.error}`)
      return res.status(400).json({
        success: false,
        error: endDateValidation.error
      })
    }

    // 3.85) MULTI-SLOT DETECTION FOR OPEN-HOUSES
    // Detect if input describes multiple slots but LLM didn't output occurrences
    if (parsedEvent.flypost?.category === 'open-houses') {
      const hasMultipleSlots = detectMultipleTimeSlots(naturalLanguageInput)
      const hasOccurrences = parsedEvent.occurrences && Array.isArray(parsedEvent.occurrences) && parsedEvent.occurrences.length > 0
      
      if (hasMultipleSlots && !hasOccurrences) {
        console.error(`❌ Multi-slot open house detected but occurrences missing`)
        return res.status(400).json({
          success: false,
          error: 'Multiple open house time slots detected. Please include all slots explicitly or submit one slot per publish.'
        })
      }
    }

    // 3.9) PROCESS OCCURRENCES FOR MULTI-SLOT EVENTS
    // Generate stable occurrence IDs (UTC timestamps already set by conversion for open-houses)
    if (parsedEvent.occurrences && Array.isArray(parsedEvent.occurrences)) {
      console.log(`📅 Processing ${parsedEvent.occurrences.length} occurrences`)
      
      // Generate stable occurrence IDs
      const canonicalKeyForOcc = computeCanonicalKey(parsedEvent, brokerageId) || 'unknown'
      for (const occ of parsedEvent.occurrences) {
        if (!occ.occurrenceId && occ.startDate && occ.endDate) {
          occ.occurrenceId = generateOccurrenceId(canonicalKeyForOcc, occ.startDate, occ.endDate)
          console.log(`  Generated occurrence ID: ${occ.occurrenceId}`)
        }
      }
      
      // For non-open-house events, set top-level startDate/endDate to next upcoming occurrence
      // (For open-houses, this is already done by convertOpenHouseLocalIntent)
      if (parsedEvent.flypost?.category !== 'open-houses') {
        const selectedOcc = selectUpcomingOccurrence(parsedEvent.occurrences)
        if (selectedOcc) {
          parsedEvent.startDate = selectedOcc.startDate
          parsedEvent.endDate = selectedOcc.endDate
          console.log(`  Set top-level dates to ${selectedOcc.occurrenceId}: ${selectedOcc.startDate} - ${selectedOcc.endDate}`)
        }
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
    const sourceData = { sourceType: 'llm', sourceId: 'parse-and-publish' }
    // If URL was extracted, add it to source provenance
    if (extractedUrl) {
      sourceData.sourceUrl = extractedUrl
    }
    
    if (existingEvent?.flypost?.sources) {
      enrichedEvent.flypost.sources = mergeSources(
        existingEvent.flypost.sources,
        sourceData
      )
    } else {
      enrichedEvent.flypost.sources = mergeSources(
        [],
        sourceData
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

 // 8) OPTIONAL PRICE VALIDATION
// Price is optional. If flypost.listPrice exists, it must be valid.
if (
  validatedEvent?.flypost?.listPrice != null &&
  !hasValidListPrice(validatedEvent)
) {
  console.error('❌ Price validation failed: Invalid list price')
  return res.status(400).json({
    success: false,
    error: 'Invalid list price',
    message:
      'If you include a price, it must be a valid list price (e.g., "$1,250,000" or "$2.5M").'
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

// Dynamic rate limiting middleware based on access tier
function applyTieredRateLimit(req, res, next) {
  const accessTier = getAccessTier(req)
  if (accessTier === 'public') {
    return publicReadLimiter(req, res, next)
  }
  return readLimiter(req, res, next)
}

// Events near (with optional brokerage filter) - Discovery V1 Contract
app.get('/v1/events/near', applyTieredRateLimit, async (req, res) => {
  try {
    // CodeQL: lat/lng from query params is acceptable - these are public geographic coordinates
    // Validate to prevent injection attacks
    const latitude = parseFloat(req.query.lat || req.query.latitude || '34.0195')
    const longitude = parseFloat(
      req.query.lng || req.query.longitude || '-118.4912'
    )

    // Radius handling:
    // - Preferred: radius_mi (miles) per OpenAPI
    // - Back-compat: radius (kilometers) if radius_mi not provided
    const MILES_TO_KM = 1.60934
    const radiusMiRaw = req.query.radius_mi
    const radiusKmRaw = req.query.radius

    let radiusKm = 10 // default km

    if (radiusMiRaw != null && radiusMiRaw !== '') {
      const radiusMi = parseFloat(String(radiusMiRaw))
      if (isNaN(radiusMi) || radiusMi < 0.1 || radiusMi > 50) {
        return res.status(400).json({
          success: false,
          error: 'Invalid radius_mi: must be between 0.1 and 50 miles'
        })
      }
      radiusKm = radiusMi * MILES_TO_KM
    } else if (radiusKmRaw != null && radiusKmRaw !== '') {
      const radius = parseFloat(String(radiusKmRaw))
      if (isNaN(radius) || radius < 0 || radius > 100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid radius: must be between 0 and 100 km'
        })
      }
      radiusKm = radius
    }

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

    const useFirestore = isFirestoreEnabled()

    // tenancy: header wins, then query.brokerageId — but now OPTIONAL
    const brokerageId =
      getBrokerageIdFromRequest(req, 'query') || req.query.brokerageId || null

    // Determine access tier for two-tier access control
    const accessTier = getAccessTier(req)

    // Track and detect anomalies
    const clientIp = req.ip || req.connection.remoteAddress
    trackAndDetectAnomaly(clientIp)

    // Date filtering parameters (ISO 8601 date-time strings)
    const startFilter = req.query.start ? new Date(req.query.start) : null
    const endFilter = req.query.end ? new Date(req.query.end) : null

    console.log(
      `📋 Discovery V1: GET ${req.protocol}://${req.get('host')}${
        req.path
      } lat=${latitude.toFixed(4)} lng=${longitude.toFixed(
        4
      )} radius=${radiusKm.toFixed(4)}km (brokerageId=${
        brokerageId || 'ALL'
      }, tier=${accessTier}, dateRange=${
        startFilter ? startFilter.toISOString() : 'none'
      } to ${endFilter ? endFilter.toISOString() : 'none'})`
    )

    const events = await getEventsNear(latitude, longitude, radiusKm, useFirestore)

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

    // Map to Discovery V1 format (allowlist registry-safe fields only)
    // Pass access tier for field restrictions
    const discoveryEvents = toDiscoveryEventsV1(filteredEvents, { accessTier })

    // Build Discovery V1 response (Protocol-Grade Contract)
    let response = {
      protocol: 'flypost-discovery',
      version: 'v1',
      success: true,
      events: discoveryEvents,
      meta: {
        count: discoveryEvents.length
      }
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
app.get('/v1/events/:event_id', applyTieredRateLimit, async (req, res) => {
  try {
    const { event_id } = req.params
    
    if (!event_id) {
      return res.status(400).json({
        success: false,
        error: 'event_id parameter is required'
      })
    }

    // Determine access tier for two-tier access control
    const accessTier = getAccessTier(req)
    
    // Track and detect anomalies
    const clientIp = req.ip || req.connection.remoteAddress
    trackAndDetectAnomaly(clientIp)

    console.log(
      `📋 Discovery V1: GET ${req.protocol}://${req.get('host')}${req.path} (eventId=${event_id}, tier=${accessTier})`
    )

    const useFirestore = isFirestoreEnabled()

    // Try to get event from storage with Firestore + memory fallback
    let event = null
    try {
      event = await getEventByIdAny(event_id, useFirestore)
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
    const discoveryEvent = toDiscoveryEventV1(event, { accessTier })

    if (!discoveryEvent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to format event'
      })
    }

    // Build Discovery V1 response (Protocol-Grade Contract)
    // Return as array with single event to match schema
    let response = {
      protocol: 'flypost-discovery',
      version: 'v1',
      success: true,
      events: [discoveryEvent],
      meta: {
        count: 1
      }
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

// Public share page for event preview (OG tags for crawlers)
app.get('/e/:shareId', applyTieredRateLimit, async (req, res) => {
  try {
    const { shareId } = req.params

    if (!shareId) {
      return res.status(400).send('shareId parameter is required')
    }

    const useFirestore = isFirestoreEnabled()
    const event = await getEventByIdAny(shareId, useFirestore)

    if (!event) {
      return res.status(404).send('Event not found')
    }

    const meta = buildEventShareMeta(event)
    const html = buildShareOgHtml(meta)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600')
    res.setHeader('X-Robots-Tag', 'index, follow')
    res.status(200).send(html)
  } catch (error) {
    console.error('❌ Error rendering share page:', error)
    res.status(500).send('Failed to render share page')
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
    
    // 3.5. STRIP CLIENT-SUPPLIED EVENTID (defense in depth)
    // Prevent client/MLS/scraper from influencing eventId - server generates on insert
    if (event.flypost?.eventId) {
      delete event.flypost.eventId
      console.log(`🛡️  Stripped client-supplied eventId (server will generate)`)
    }
    
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

    const latNum = Number(lat)
    const lngNum = Number(lng)

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({
        success: false,
        error: 'lat and lng are required for presence verification'
      })
    }

    let targetEventId = eventId
    let matchedBy = 'explicit'
    let matchedEvent = null

    // If no eventId provided, find nearest event
    if (!targetEventId) {
      const useFirestore = isFirestoreEnabled()
      const nearbyEvents = await getEventsNear(
        latNum,
        lngNum,
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

      // Use the first/nearest event
      matchedEvent = nearbyEvents[0]
      targetEventId = matchedEvent.flypost.eventId
      matchedBy = 'nearest'
      console.log(`📍 Matched nearest event: ${targetEventId}`)
    } else {
      // Explicit eventId provided - fetch the event for distance validation
      const useFirestore = isFirestoreEnabled()
      try {
        matchedEvent = await getEventByIdAny(targetEventId, useFirestore)
        if (!matchedEvent) {
          return res.status(404).json({
            success: false,
            error: 'Event not found',
            eventId: targetEventId
          })
        }
      } catch (error) {
        console.error('❌ Error fetching event for distance check:', error)
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch event for validation',
          details: error.message
        })
      }
    }

    // STRICT TIME GATING: Validate check-in is within event time window
    // Use server time (not client-provided timestamp) for gate checks
    const now = new Date()
    
    // Check for occurrences-based multi-slot events
    let matchedOccurrenceId = null
    let eventStart, eventEnd
    
    if (matchedEvent.occurrences && matchedEvent.occurrences.length > 0) {
      console.log(`📅 Event has ${matchedEvent.occurrences.length} occurrences - checking for active window`)
      
      // Find any occurrence that is currently active
      const activeOccurrences = matchedEvent.occurrences.filter(occ => {
        try {
          const occStart = new Date(occ.startDate)
          const occEnd = new Date(occ.endDate)
          
          if (isNaN(occStart.getTime()) || isNaN(occEnd.getTime())) {
            console.warn(`⚠️  Invalid occurrence dates for ${occ.occurrenceId}`)
            return false
          }
          
          return now >= occStart && now <= occEnd
        } catch (error) {
          console.warn(`⚠️  Error checking occurrence ${occ.occurrenceId}:`, error.message)
          return false
        }
      })
      
      if (activeOccurrences.length === 0) {
        console.log(`⏰ Check-in rejected: No active occurrence windows for event ${targetEventId}`)
        
        // Find next upcoming occurrence for helpful error message
        const upcomingOccurrences = matchedEvent.occurrences
          .filter(occ => {
            try {
              const occStart = new Date(occ.startDate)
              return occStart > now
            } catch {
              return false
            }
          })
          .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
        
        const nextOcc = upcomingOccurrences[0]
        
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_ACTIVE',
          message: nextOcc 
            ? `This event is not currently active. Next occurrence starts at ${nextOcc.startDate}.`
            : 'This event has no active or upcoming occurrences.',
          occurrences: matchedEvent.occurrences.map(occ => ({
            startDate: occ.startDate,
            endDate: occ.endDate,
            label: occ.label
          }))
        })
      }
      
      // Select the occurrence with earliest endDate if multiple match (edge case)
      const selectedOcc = activeOccurrences.sort((a, b) => 
        new Date(a.endDate) - new Date(b.endDate)
      )[0]
      
      matchedOccurrenceId = selectedOcc.occurrenceId
      eventStart = new Date(selectedOcc.startDate)
      eventEnd = new Date(selectedOcc.endDate)
      
      console.log(`✅ Matched active occurrence: ${matchedOccurrenceId} (${selectedOcc.startDate} - ${selectedOcc.endDate})`)
      
    } else {
      // Fallback to top-level startDate/endDate
      // Check if event has startDate
      if (!matchedEvent.startDate) {
        console.error(`❌ Event ${targetEventId} missing startDate (cannot time-gate)`)
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_TIME_GATABLE',
          message: 'This event is missing startDate and cannot be checked into.'
        })
      }

      // Check if event has endDate (required for time gating)
      if (!matchedEvent.endDate) {
        console.error(`❌ Event ${targetEventId} missing endDate (cannot time-gate)`)
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_TIME_GATABLE',
          message: 'This event is missing endDate and cannot be checked into.'
        })
      }

      // Parse event time window
      try {
        eventStart = new Date(matchedEvent.startDate)
        eventEnd = new Date(matchedEvent.endDate)
        
        if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) {
          throw new Error('Invalid date format')
        }
      } catch (error) {
        console.error(`❌ Failed to parse event times for ${targetEventId}:`, error.message)
        return res.status(500).json({
          success: false,
          error: 'Invalid event time data',
          message: 'Event has malformed time information.'
        })
      }

      // Check if current time is within event window
      if (now < eventStart) {
        const minutesUntilStart = Math.round((eventStart - now) / 60000)
        console.log(`⏰ Check-in rejected: Event ${targetEventId} has not started yet (starts in ${minutesUntilStart} minutes)`)
        return res.status(400).json({
          success: false,
          error: 'EVENT_NOT_STARTED',
          message: 'This event has not started yet.',
          eventStart: matchedEvent.startDate,
          eventEnd: matchedEvent.endDate
        })
      }

      if (now > eventEnd) {
        const minutesSinceEnd = Math.round((now - eventEnd) / 60000)
        console.log(`⏰ Check-in rejected: Event ${targetEventId} has already ended (ended ${minutesSinceEnd} minutes ago)`)
        return res.status(400).json({
          success: false,
          error: 'EVENT_ALREADY_ENDED',
          message: 'This event has already ended.',
          eventStart: matchedEvent.startDate,
          eventEnd: matchedEvent.endDate
        })
      }

      // Event is active - log success
      console.log(`✅ Time gate passed: Event ${targetEventId} is active (${eventStart.toISOString()} - ${eventEnd.toISOString()})`)
    }

    // STRICT DISTANCE CHECK: Validate proximity to event location
    // Extract event coordinates (handle common field paths)
    let eventLat = null
    let eventLng = null

    if (
      matchedEvent.location?.geo?.latitude &&
      matchedEvent.location?.geo?.longitude
    ) {
      eventLat = matchedEvent.location.geo.latitude
      eventLng = matchedEvent.location.geo.longitude
    } else if (
      matchedEvent.flypost?.geo?.latitude &&
      matchedEvent.flypost?.geo?.longitude
    ) {
      eventLat = matchedEvent.flypost.geo.latitude
      eventLng = matchedEvent.flypost.geo.longitude
    }

    if (eventLat !== null && eventLng !== null) {
      // Calculate actual distance using Haversine formula
      const actualDistanceKm = distanceKm(latNum, lngNum, eventLat, eventLng)
      const actualDistanceMeters = Math.round(actualDistanceKm * 1000)
      const thresholdMeters = Math.round(PRESENCE_RADIUS_KM * 1000)

      console.log(
        `📏 Distance check: ${actualDistanceMeters}m (threshold: ${thresholdMeters}m) for event ${targetEventId}`
      )

      // Reject if outside configured radius
      if (actualDistanceKm > PRESENCE_RADIUS_KM) {
        return res.status(404).json({
          success: false,
          error: 'No events found within proximity for check-in',
          hint: `Closest event is ${actualDistanceMeters} m away (threshold ${thresholdMeters} m)`
        })
      }
    } else {
      // No geo coordinates on event - log warning and allow check-in
      console.warn(
        `⚠️  Event ${targetEventId} has no geo coordinates; skipping distance validation`
      )
    }

    // Create attendance record
    const { storeAttendance } = await import('./intelligenceStorage.js')

    const attendanceData = {
      eventId: targetEventId,
      buyerToken,
      checkInTime: timestamp || new Date().toISOString(),
      presenceProof: {
        method: method || 'geo_time',
        lat: latNum,
        lng: lngNum,
        matchedBy
      }
    }
    
    // Include occurrenceId if matched to a specific occurrence
    if (matchedOccurrenceId) {
      attendanceData.occurrenceId = matchedOccurrenceId
      attendanceData.presenceProof.occurrenceId = matchedOccurrenceId
    }

    const attendance = await storeAttendance(attendanceData)

    const response = {
      success: true,
      attendance: {
        attendanceId: attendance.attendanceId,
        eventId: attendance.eventId,
        checkInTime: attendance.checkInTime,
        matchedBy
      }
    }
    
    // Include occurrenceId in response if present
    if (matchedOccurrenceId) {
      response.attendance.occurrenceId = matchedOccurrenceId
    }

    res.json(response)
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
 * - answers (required): { liked, disliked, wantsSimilar, wouldBuy }
 *   - liked (optional): string or null
 *   - disliked (optional): string or null
 *   - wantsSimilar (optional): boolean (for backward compatibility)
 *   - wouldBuy (optional): "yes"|"maybe"|"no" or null
 * - brokerageAffiliation (optional): Brokerage ID for routing
 */
app.post('/v1/feedback/submit', writeLimiter, async (req, res) => {
  try {
    const { attendanceId, eventId, buyerToken, answers, brokerageAffiliation } = req.body

    if (!answers) {
      return res.status(400).json({
        success: false,
        error: 'answers object is required'
      })
    }
    
    // Backward compatibility: accept submissions with only wantsSimilar (legacy)
    // New submissions should include wouldBuy

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

    // Normalize feedback text fields
    const normalizedLiked = normalizeFeedbackText(answers.liked)
    const normalizedDisliked = normalizeFeedbackText(answers.disliked)
    
    // Normalize wouldBuy field
    const normalizedWouldBuy = normalizeWouldBuy(answers.wouldBuy)

    // Store feedback
    const feedback = await storeFeedback({
      attendanceId: attendance.attendanceId,
      eventId: attendance.eventId,
      answers: {
        liked: normalizedLiked,
        disliked: normalizedDisliked,
        wantsSimilar: answers.hasOwnProperty('wantsSimilar') ? Boolean(answers.wantsSimilar) : null,
        wouldBuy: normalizedWouldBuy
      },
      brokerageAffiliation: brokerageAffiliation || null,
      occurrenceId: attendance.occurrenceId || null
    })

    res.json({
      success: true,
      feedback: {
        feedbackId: feedback.feedbackId,
        eventId: feedback.eventId,
        createdAt: feedback.createdAt,
        occurrenceId: feedback.occurrenceId
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
    
    // Add optional endDate if provided
    if (req.body.endDate) {
      baseEvent.endDate = req.body.endDate
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
