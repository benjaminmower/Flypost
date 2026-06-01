import express from 'express'
import { getEventsNear, getEventByIdAny } from '../storage.js'
import { isFirestoreEnabled } from '../firestoreClient.js'
import {
  normalizeCategory,
  normalizeCategoryForFilter,
  toDiscoveryEventsV1,
  toDiscoveryEventV1,
  VALID_DISCOVERY_CATEGORIES
} from '../utils/discoveryMapper.js'
import { sanitizeDiscoveryResponse } from '../utils/sanitizer.js'
import {
  getAccessTier,
  applyTieredRateLimit,
  trackAndDetectAnomaly
} from '../utils/requestHelpers.js'

// Local helper: read brokerageId from query params (read routes only)
function getBrokerageIdFromRequest(req, source) {
  const headerId = req.get('x-flypost-brokerage-id')
  if (headerId) return headerId
  if (source === 'query') {
    return (req.query && (req.query.brokerageId || req.query.brokerage_id)) || null
  }
  return null
}

const router = express.Router()

// GET /v1/events/near - Discovery V1 Contract
router.get('/near', applyTieredRateLimit, async (req, res) => {
  try {
    // CodeQL: lat/lng from query params is acceptable - these are public geographic coordinates
    const latitude = parseFloat(req.query.lat || req.query.latitude || '34.0195')
    const longitude = parseFloat(
      req.query.lng || req.query.longitude || '-118.4912'
    )

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
    // Default startFilter to now so callers who omit ?start= still get future-only results.
    const startFilter = req.query.start ? new Date(req.query.start) : new Date()
    const endFilter = req.query.end ? new Date(req.query.end) : null

    const rawCategoryParam = req.query.category
    let categoryFilters = null
    if (rawCategoryParam != null && rawCategoryParam !== '') {
      const rawCategories = (Array.isArray(rawCategoryParam)
        ? rawCategoryParam
        : [rawCategoryParam]
      )
        .flatMap(value => String(value).split(','))
        .map(value => value.trim())
        .filter(Boolean)

      if (rawCategories.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid category: category must include at least one value',
          allowedCategories: VALID_DISCOVERY_CATEGORIES
        })
      }

      const invalidCategories = []
      const normalizedCategories = rawCategories.map(value => {
        const normalized = normalizeCategoryForFilter(value)
        if (!normalized) invalidCategories.push(value)
        return normalized
      })

      if (invalidCategories.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid category: ${invalidCategories.join(', ')}`,
          allowedCategories: VALID_DISCOVERY_CATEGORIES
        })
      }

      categoryFilters = new Set(normalizedCategories)
    }

    console.log(
      `📋 Discovery V1: GET ${req.protocol}://${req.get('host')}${req.path} lat=${latitude.toFixed(4)} lng=${longitude.toFixed(4)} radius=${radiusKm.toFixed(4)}km (brokerageId=${brokerageId || 'ALL'}, tier=${accessTier}, categories=${categoryFilters ? Array.from(categoryFilters).join(',') : 'ALL'}, dateRange=${startFilter ? startFilter.toISOString() : 'none'} to ${endFilter ? endFilter.toISOString() : 'none'})`
    )

    const events = await getEventsNear(latitude, longitude, radiusKm, useFirestore)

    let filteredEvents = events || []

    if (brokerageId) {
      filteredEvents = filteredEvents.filter(
        ev =>
          ev?.brokerageId === brokerageId ||
          ev?.flypost?.brokerageId === brokerageId
      )
    }

    if (categoryFilters) {
      filteredEvents = filteredEvents.filter(ev => {
        const category = normalizeCategory(ev?.flypost?.category)
        return categoryFilters.has(category)
      })
    }

    // Date range filtering
    if (startFilter || endFilter) {
      filteredEvents = filteredEvents.filter(ev => {
        const eventStart = ev.startDate ? new Date(ev.startDate) : null
        const eventEnd = ev.endDate ? new Date(ev.endDate) : eventStart

        if (startFilter && eventEnd && eventEnd < startFilter) {
          return false
        }
        if (endFilter && eventStart && eventStart > endFilter) {
          return false
        }
        return true
      })
    }

    const discoveryEvents = toDiscoveryEventsV1(filteredEvents, { accessTier })

    let response = {
      protocol: 'flypost-discovery',
      version: 'v1',
      success: true,
      events: discoveryEvents,
      meta: {
        count: discoveryEvents.length
      }
    }

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

// GET /v1/events/:event_id - Discovery V1 Contract
router.get('/:event_id', applyTieredRateLimit, async (req, res) => {
  try {
    const { event_id } = req.params

    if (!event_id) {
      return res.status(400).json({
        success: false,
        error: 'event_id parameter is required'
      })
    }

    const accessTier = getAccessTier(req)

    const clientIp = req.ip || req.connection.remoteAddress
    trackAndDetectAnomaly(clientIp)

    console.log(
      `📋 Discovery V1: GET ${req.protocol}://${req.get('host')}${req.path} (eventId=${event_id}, tier=${accessTier})`
    )

    const useFirestore = isFirestoreEnabled()

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

    const discoveryEvent = toDiscoveryEventV1(event, { accessTier })

    if (!discoveryEvent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to format event'
      })
    }

    let response = {
      protocol: 'flypost-discovery',
      version: 'v1',
      success: true,
      events: [discoveryEvent],
      meta: {
        count: 1
      }
    }

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

export default router
