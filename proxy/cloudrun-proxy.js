// v13 – Cloud Run proxy with multi-token write auth

const express = require('express')
const cors = require('cors')
const createForward = require('./src/forward')

const app = express()

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

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error('Not allowed by CORS: ' + origin))
    },
    credentials: true
  })
)

app.use(express.json({ limit: '1mb' }))

app.use((req, _res, next) => {
  console.log('proxy incoming:', req.method, req.originalUrl)
  next()
})

// -------------------------------------
// Write-token authentication middleware
// Checks POST requests to /api/* paths before routing
// Supports multiple static tokens (global + per-brokerage)
// -------------------------------------

// Collect all allowed tokens here
const WRITE_TOKENS = [
  process.env.FLYPOST_WRITE_TOKEN,   // global token (e.g., "goflypost")
  process.env.VISTA_WRITE_TOKEN,     // Vista-specific token (e.g., "vist@sir")
  process.env.BHHS_UTAH_WRITE_TOKEN, // BHHS Utah brokerage
  process.env.COMPASS_WRITE_TOKEN,   // Compass brokerage
].filter(Boolean)

function requireWriteToken(req, res, next) {
  const isApiPost =
    req.method === 'POST' && (req.originalUrl || '').startsWith('/api/')

  if (isApiPost && WRITE_TOKENS.length > 0) {
    const token = req.get('x-flypost-write-token') || ''

    if (!token) {
      console.log(`🔒 Write-token missing for ${req.method} ${req.originalUrl}`)
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing write token'
      })
    }

    const matched = WRITE_TOKENS.includes(token)
    if (!matched) {
      console.log(`🔒 Write-token invalid for ${req.method} ${req.originalUrl}`)
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid write token'
      })
    }

    console.log(`✅ Write-token validated for ${req.method} ${req.originalUrl}`)
  }

  next()
}

app.use(requireWriteToken)

const forward = createForward()

app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' })
})

app.get('/health', forward)
app.get('/v1/events/near', forward)
app.post('/api/parse-and-publish', forward)
app.use('/api', forward)

const PORT = parseInt(process.env.PORT || '8080', 10)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`)
})
