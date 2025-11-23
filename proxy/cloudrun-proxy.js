// v13 – multi-tenant proxy with header-based brokerageId

const express = require('express')
const cors = require('cors')
const createForward = require('./src/forward')

const app = express()

// --- CORS ---
const allowedOrigins = Array.from(
  new Set([
    ...((process.env.FRONTEND_ORIGIN || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)),
    'https://flypost.netlify.app',
    'https://app.goflypost.com',
    'http://localhost:5173'
  ])
)

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('Not allowed by CORS: ' + origin))
  },
  credentials: true
}))

app.use(express.json({ limit: '1mb' }))

// --- Write-token authentication middleware ---
// Checks POST requests to /api/* paths before routing
function requireWriteToken(req, res, next) {
  const isApiPost =
    req.method === 'POST' &&
    (req.originalUrl || '').startsWith('/api/')

  if (!isApiPost) {
    return next()
  }

  const token = req.get('x-flypost-write-token')
  const expectedToken = process.env.FLYPOST_WRITE_TOKEN

  // If FLYPOST_WRITE_TOKEN is configured, enforce it
  if (expectedToken) {
    if (!token) {
      console.log(JSON.stringify({
        severity: 'WARNING',
        message: 'write_token_missing',
        method: req.method,
        path: req.originalUrl
      }))
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing write token'
      })
    }
    if (token !== expectedToken) {
      console.log(JSON.stringify({
        severity: 'WARNING',
        message: 'write_token_invalid',
        method: req.method,
        path: req.originalUrl
      }))
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid write token'
      })
    }

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'write_token_validated',
      method: req.method,
      path: req.originalUrl
    }))
  }

  next()
}

// --- Brokerage tenancy middleware ---
// Canonical source: x-flypost-brokerage-id header
// Fallbacks: body.brokerageId / query.brokerageId (if you want)
function requireBrokerageId(req, res, next) {
  const path = req.path || ''

  // Health / root don’t require tenancy
  const requiresBrokerage =
    (path.startsWith('/api') || path.startsWith('/v1')) &&
    path !== '/api/health'

  if (!requiresBrokerage) {
    return next()
  }

  const fromHeader = req.get('x-flypost-brokerage-id') || null
  const fromBody =
    req.body && req.body.brokerageId
      ? String(req.body.brokerageId)
      : null
  const fromQuery =
    req.query && req.query.brokerageId
      ? String(req.query.brokerageId)
      : null

  const candidates = [fromHeader, fromBody, fromQuery].filter(Boolean)
  const unique = [...new Set(candidates)]

  if (unique.length === 0) {
    console.log(JSON.stringify({
      severity: 'WARNING',
      message: 'brokerage_missing',
      method: req.method,
      path: req.originalUrl
    }))

    return res.status(400).json({
      success: false,
      error: 'Missing brokerageId'
    })
  }

  if (unique.length > 1) {
    console.log(JSON.stringify({
      severity: 'WARNING',
      message: 'brokerage_conflict',
      method: req.method,
      path: req.originalUrl,
      candidates: unique
    }))

    return res.status(400).json({
      success: false,
      error: 'Conflicting brokerageId'
    })
  }

  req.brokerageId = unique[0]

  next()
}

// Use write-token guard first for POST /api,
// then require brokerage for tenant-aware routes
app.use(requireWriteToken)
app.use(requireBrokerageId)

// --- Normalization + structured request logging ---
app.use((req, _res, next) => {
  // Normalize tenancy into body / query for downstream services
  if (req.brokerageId) {
    if (!req.body) req.body = {}
    req.body.brokerageId = req.brokerageId

    if (!req.query) req.query = {}
    req.query.brokerageId = req.brokerageId
  }

  // Structured log for Cloud Run / Cloud Logging
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'proxy_request',
    method: req.method,
    path: req.originalUrl,
    brokerageId: req.brokerageId || null,
    userAgent: req.get('user-agent') || null,
    sourceIp: req.headers['x-forwarded-for'] || null
  }))

  next()
})

const forward = createForward()

// --- Routes ---
app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' })
})

app.get('/health', forward)

// Tenant-aware reads & writes
app.get('/v1/events/near', forward)
app.post('/api/parse-and-publish', forward)
app.use('/api', forward)

// --- Server ---
const PORT = parseInt(process.env.PORT || '8080', 10)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`)
})
