import rateLimit from 'express-rate-limit'

// Rate limiters
export const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per 15 min
  message: { success: false, error: 'Too many read requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Stricter rate limiter for anonymous public access (no brokerage_id or key)
export const publicReadLimiter = rateLimit({
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

export function trackAndDetectAnomaly(ip) {
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

// Helper: derive brokerageId from header/body/query
export function getBrokerageIdFromRequest(req, source) {
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
export function reduceGeoPrecision(lat, lng, precision = 2) {
  return {
    latitude: parseFloat(lat.toFixed(precision)),
    longitude: parseFloat(lng.toFixed(precision))
  }
}

// Helper: determine access tier (public vs brokerage-scoped)
export function getAccessTier(req) {
  const brokerageId = getBrokerageIdFromRequest(req, 'query')
  // CodeQL: api_key in query is acceptable for read-only public API
  // Prefer header (x-api-key) but allow query param for AI plugin compatibility
  const hasApiKey = req.get('x-api-key') || req.query.api_key

  if (brokerageId || hasApiKey) {
    return 'brokerage' // Full fidelity
  }
  return 'public' // Reduced precision and fewer fields
}

// Dynamic rate limiting middleware based on access tier
export function applyTieredRateLimit(req, res, next) {
  const accessTier = getAccessTier(req)
  if (accessTier === 'public') {
    return publicReadLimiter(req, res, next)
  }
  return readLimiter(req, res, next)
}
