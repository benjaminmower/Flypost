import express from 'express'
import rateLimit from 'express-rate-limit'
import { parseEventWithLLM } from '../llmParser.js'
import { validateEventData } from '../validation.js'
import { storeEvent, findEventByIdentity, getEventByIdAny } from '../storage.js'
import { computeEventHash } from '../hashUtils.js'
import { isFirestoreEnabled, getFirestoreClient } from '../firestoreClient.js'
import { computeCanonicalKey, computeEventIdentity } from '../utils/canonicalKey.js'
import { extractPriceFromText, hasValidListPrice } from '../utils/priceExtractor.js'
import { mergeSources } from '../utils/sourceProvenance.js'
import { extractFirstUrl } from '../utils/urlExtractor.js'
import { enrichEventMetadata, normalizeEventDates } from '../utils/eventEnrichment.js'
import { generateShareUrl } from '../utils/shareUrl.js'
import { geocodeAddress } from '../geocode.js'
import { inferTimezoneFromCoordinates, hasExplicitTimezone } from '../utils/timezone.js'
import {
  normalizeOpenHouseTimestamps,
  generateOccurrenceId,
  selectUpcomingOccurrence,
  validateOpenHouseEndDate,
  convertOpenHouseLocalIntent
} from '../utils/timeNormalization.js'
import { triggerHeroImageScrape } from '../utils/heroImage.js'

const router = express.Router()

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Too many event submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Helper: Detect if input text describes multiple time slots
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
  const andPattern = /\b(morning|afternoon|evening|\d{1,2}\s*(am|pm)?)\s+and\s+(morning|afternoon|evening|\d{1,2}\s*(am|pm)?)\b/i
  if (andPattern.test(text)) {
    return true
  }

  return false
}

function safeHttpsUrl(value) {
  if (!value || typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function getPwaFlyerContext(userContext) {
  if (!userContext || typeof userContext !== 'object' || Array.isArray(userContext)) {
    return {}
  }

  const flyer =
    userContext.flyer && typeof userContext.flyer === 'object' && !Array.isArray(userContext.flyer)
      ? userContext.flyer
      : {}

  return {
    heroImageUrl: safeHttpsUrl(flyer.heroImageUrl || userContext.heroImageUrl),
    heroImageStoragePath: flyer.heroImageStoragePath || userContext.heroImageStoragePath || null,
    category: flyer.category || userContext.category || null
  }
}

router.post('/', writeLimiter, async (req, res) => {
  try {
    const body = req.body || {}

    // Resolve identity from proxy-injected Firebase headers OR x-flypost-write-token.
    // The proxy (forward.js) strips the Authorization header before forwarding, and
    // injects x-flypost-auth-uid / x-flypost-auth-email after verifying the Firebase token.
    let uid = null
    let agentEmail = null

    const isFirebaseAuth = req.get('x-flypost-auth-provider') === 'firebase'
    const writeToken = req.get('x-flypost-write-token')

    if (isFirebaseAuth) {
      uid = req.get('x-flypost-auth-uid') || null
      agentEmail = req.get('x-flypost-auth-email') || null
      if (!uid) {
        return res.status(401).json({ success: false, error: 'Missing Firebase uid from proxy' })
      }
    } else if (writeToken) {
      const db = getFirestoreClient()
      const snap = await db.collection('tokens').where('token', '==', writeToken).limit(1).get()
      if (snap.empty) {
        return res.status(401).json({ success: false, error: 'Invalid write token' })
      }
      const data = snap.docs[0].data()
      uid = data.uid
      agentEmail = data.email
    } else {
      return res.status(401).json({
        success: false,
        error: 'Missing auth: provide Authorization: Bearer <firebase_id_token> or x-flypost-write-token'
      })
    }

    // Accept an explicit existingEventId to target a specific event for update
    const EVT_ID_PATTERN = /\bevt_[a-z0-9]+_\d+\b/i
    const extractedEventId = (body.naturalLanguageInput ?? body.text ?? body.input ?? '')
      .match(EVT_ID_PATTERN)?.[0] || null
    const explicitExistingEventId = body.existingEventId || extractedEventId || null
    if (extractedEventId && !body.existingEventId) {
      console.log(`🔍 Extracted existingEventId from natural language: ${extractedEventId}`)
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
      `🤖 Processing (uid=${uid}): "${naturalLanguageInput.substring(0, 100)}..."`
    )

    // 1) Parse with LLM
    let parsedEvent = await parseEventWithLLM(naturalLanguageInput, userContext)
    console.log(`✅ LLM parsed event: ${parsedEvent.name}`)

    const pwaFlyerContext = getPwaFlyerContext(userContext)
    if (pwaFlyerContext.heroImageUrl) {
      parsedEvent.flypost = parsedEvent.flypost || {}
      parsedEvent.flypost.heroImageUrl = pwaFlyerContext.heroImageUrl
      if (pwaFlyerContext.heroImageStoragePath) {
        parsedEvent.flypost.heroImageStoragePath = String(pwaFlyerContext.heroImageStoragePath)
      }
      console.log('🖼️  Applied PWA flyer image context')
    }
    if (pwaFlyerContext.category) {
      parsedEvent.flypost = parsedEvent.flypost || {}
      parsedEvent.flypost.category = pwaFlyerContext.category
    }

    // 1.05) STRIP CLIENT-SUPPLIED EVENTID (defense in depth)
    if (parsedEvent.flypost?.eventId) {
      delete parsedEvent.flypost.eventId
      console.log(`🛡️  Stripped client-supplied eventId (server will generate)`)
    }

    // 1.1) DETERMINISTIC URL EXTRACTION
    const extractedUrl = extractFirstUrl(naturalLanguageInput)
    if (extractedUrl) {
      console.log(`🔗 Extracted external URL: ${extractedUrl}`)
      parsedEvent.url = extractedUrl
    }

    // 1.2) DETERMINISTIC PRICE EXTRACTION & ENRICHMENT
    if (!hasValidListPrice(parsedEvent)) {
      const extractedPrice = extractPriceFromText(naturalLanguageInput)
      if (extractedPrice) {
        console.log(`💰 Deterministic price extraction: ${extractedPrice.listPriceDisplay} → ${extractedPrice.listPrice}`)
        parsedEvent.flypost = {
          ...parsedEvent.flypost,
          listPrice: extractedPrice.listPrice,
          listPriceDisplay: extractedPrice.listPriceDisplay,
          listPriceCurrency: extractedPrice.listPriceCurrency,
          priceType: extractedPrice.priceType
        }
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
    const hasGeo = parsedEvent.location?.geo?.latitude != null && parsedEvent.location?.geo?.longitude != null

    if (!hasGeo) {
      console.log(`🗺️  Event missing geo coordinates, attempting geocode enrichment...`)

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
        const geocodeResult = await geocodeAddress(addressString)

        if (geocodeResult) {
          if (!parsedEvent.location) parsedEvent.location = { '@type': 'Place' }
          parsedEvent.location.geo = {
            '@type': 'GeoCoordinates',
            latitude: geocodeResult.latitude,
            longitude: geocodeResult.longitude
          }
          console.log(`✅ Geocode enrichment successful: ${geocodeResult.latitude}, ${geocodeResult.longitude}`)
        } else {
          console.error(`❌ Geocode enrichment failed for address: ${addressString}`)
          return res.status(400).json({
            success: false,
            error: 'Validation error: event.location.geo (latitude and longitude) is required for publishing events',
            hint: 'Provide a full address or set GEOCODER_API_KEY to enable automatic geocoding',
            address: addressString
          })
        }
      } else {
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
    const latitude = parsedEvent.location.geo.latitude
    const longitude = parsedEvent.location.geo.longitude
    const inferredTimezone = inferTimezoneFromCoordinates(latitude, longitude)

    if (inferredTimezone) {
      parsedEvent.flypost = parsedEvent.flypost || {}
      parsedEvent.flypost.timezone = inferredTimezone
      console.log(`🌍 Inferred timezone: ${inferredTimezone}`)
    } else {
      console.warn(`⚠️  Could not infer timezone for coordinates: ${latitude}, ${longitude}`)
    }

    // 3.76) OPEN-HOUSE LOCAL INTENT CONVERSION (NEW PIPELINE)
    if (parsedEvent.flypost?.category === 'open-houses') {
      try {
        if (parsedEvent.startDate) {
          delete parsedEvent.startDate
          console.log(`🛡️  Stripped model-provided startDate for open-house (will derive from local intent)`)
        }
        if (parsedEvent.endDate) {
          delete parsedEvent.endDate
          console.log(`🛡️  Stripped model-provided endDate for open-house (will derive from local intent)`)
        }
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
    const endDateValidation = validateOpenHouseEndDate(parsedEvent)
    if (!endDateValidation.valid) {
      console.error(`❌ Open house validation failed: ${endDateValidation.error}`)
      return res.status(400).json({
        success: false,
        error: endDateValidation.error
      })
    }

    // 3.85) MULTI-SLOT DETECTION FOR OPEN-HOUSES
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
    if (parsedEvent.occurrences && Array.isArray(parsedEvent.occurrences)) {
      console.log(`📅 Processing ${parsedEvent.occurrences.length} occurrences`)

      const canonicalKeyForOcc = computeCanonicalKey(parsedEvent, null) || 'unknown'
      for (const occ of parsedEvent.occurrences) {
        if (!occ.occurrenceId && occ.startDate && occ.endDate) {
          occ.occurrenceId = generateOccurrenceId(canonicalKeyForOcc, occ.startDate, occ.endDate)
          console.log(`  Generated occurrence ID: ${occ.occurrenceId}`)
        }
      }

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
    } else {
      console.log(`⚠️  Could not compute event identity (missing address or startDate) — will insert as new`)
    }

    // Phase 2: if 3-part identity (with URL) failed, retry without URL
    if (!existingEvent && tempIdentity && tempIdentity.split('|').length === 3) {
      const addressTimeIdentity = tempIdentity.split('|').slice(0, 2).join('|')
      try {
        existingEvent = await findEventByIdentity(addressTimeIdentity)
        if (existingEvent) {
          isUpdate = true
          updateCount = (existingEvent.flypost?.updateCount || 0) + 1
          console.log(`🔄 Found existing event ${existingEvent.flypost.eventId} via address+time fallback (URL changed)`)
        }
      } catch (err) {
        console.error('⚠️ Error in address+time fallback identity check:', err)
      }
    }

    // 4b. If caller supplied existingEventId, use direct lookup (overrides identity match)
    if (!existingEvent && explicitExistingEventId) {
      const useFirestore = isFirestoreEnabled()
      const byId = await getEventByIdAny(explicitExistingEventId, useFirestore)
      if (byId) {
        existingEvent = byId
        isUpdate = true
        updateCount = (byId.flypost?.updateCount || 0) + 1
        console.log(`🎯 Explicit existingEventId matched: ${explicitExistingEventId}`)
      }
    }

    // 5) Enrich event with server-side metadata
    const enrichedEvent = enrichEventMetadata(parsedEvent, {
      brokerageId: null,
      isUpdate,
      existingEventId: existingEvent?.flypost?.eventId,
      updateCount
    })

    // Store submitter identity on every event
    enrichedEvent.flypost.createdBy = uid
    enrichedEvent.flypost.createdByUid = uid
    enrichedEvent.flypost.createdByEmail = agentEmail
    enrichedEvent.flypost.agentEmail = agentEmail

    // Legacy: Also compute old canonical key for backward compatibility during migration
    const canonicalKey = computeCanonicalKey(enrichedEvent, null)
    if (canonicalKey) {
      enrichedEvent.flypost.canonicalKey = canonicalKey
    }

    // 6) Add source provenance for LLM adapter
    const sourceData = { sourceType: 'llm', sourceId: 'parse-and-publish' }
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
      hash: eventHash
    }

    if (isUpdate && existingEvent) {
      if (existingEvent._firestoreMetadata) {
        eventToStore._firestoreMetadata = {
          ...existingEvent._firestoreMetadata,
          updatedAt: new Date()
        }
      }
    }

    console.log(
      `🔐 Computed event hash: ${eventHash.value.substring(0, 16)}... (uid=${uid})`
    )

    // 11) Store (will handle upsert via eventIdentity)
    const storedEvent = await storeEvent(eventToStore)
    console.log(
      `📦 ${isUpdate ? 'Updated' : 'Stored'} event: ${storedEvent.flypost.eventId} (uid=${uid})`
    )
    triggerHeroImageScrape(storedEvent)
    storedEvent.shareUrl = generateShareUrl(storedEvent)
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

export default router
