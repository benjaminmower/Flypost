import express from 'express'
import rateLimit from 'express-rate-limit'
import { validateEventData } from '../validation.js'
import { storeEvent, findEventByIdentity, getEventByIdAny } from '../storage.js'
import { computeEventHash } from '../hashUtils.js'
import { isFirestoreEnabled } from '../firestoreClient.js'
import { computeCanonicalKey, computeEventIdentity } from '../utils/canonicalKey.js'
import { sanitizeEvent } from '../utils/northStarEnforcer.js'
import { mergeSources, validateSource } from '../utils/sourceProvenance.js'
import { enrichEventMetadata, normalizeEventDates } from '../utils/eventEnrichment.js'
import { getBrokerageIdFromRequest } from '../utils/requestHelpers.js'
import { triggerHeroImageScrape } from '../utils/heroImage.js'

const router = express.Router()

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Too many event submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/', writeLimiter, async (req, res) => {
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
    if (event.flypost?.eventId) {
      delete event.flypost.eventId
      console.log(`🛡️  Stripped client-supplied eventId (server will generate)`)
    }

    // Accept an explicit existingEventId to target a specific event for update
    const explicitExistingEventId = body.existingEventId || null

    // 4. Normalize dates
    normalizeEventDates(event)

    // 5. Check for existing event by identity
    let existingEvent = null
    let isUpdate = false
    let updateCount = 0

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

    // 5b. Fallback: direct lookup by caller-supplied existingEventId
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
    triggerHeroImageScrape(storedEvent)

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

export default router
