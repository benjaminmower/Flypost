// cloud-run-proxy.js
// Flypost Proxy (v12 clean) – backend-only tenancy
// No brokerage headers, no tenancy logic here.
// Responsibilities: CORS, write-token auth, request logging, and forwarding.

const express = require('express')
const cors = require('cors')
const createForward = require('./src/forward')

const app = express()

// Allowed CORS origins
const allowedOrigins = Array.from(
  new Set([
    ...((process.env.FRONTEND_ORIGIN || '')
      .split(',')
      .map(o => o.trim())
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

// Log every incoming request
app.use((req, _res, next) => {
  console.log('proxy incoming:', req.method, req.originalUrl)
  next()
})

// Write-token auth (POST /api/* only)
function requireWriteToken(req, res, next) {
  const isApiPost =
    req.method === 'POST' && (req.originalUrl || '').startsWith('/api/')

  if (isApiPost) {
    const provided = req.get('x-flypost-write-token')
    const expected = process.env.FLYPOST_WRITE_TOKEN

    if (expected) {
      if (!provided) {
        console.log(
          `🔒 Write-token missing for ${req.method} ${req.originalUrl}`
        )
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Missing write token'
        })
      }
      if (provided !== expected) {
        console.log(
          `🔒 Write-token invalid for ${req.method} ${req.originalUrl}`
        )
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid write token'
        })
      }

      console.log(
        `✅ Write-token validated for ${req.method} ${req.originalUrl}`
      )
    }
  }

  next()
}

app.use(requireWriteToken)

// Forwarder
const forward = createForward()

// Routes forwarded to backend
app.get('/', (req, res) => res.json({ status: 'proxy running' }))
app.get('/health', forward)
app.get('/v1/events/near', forward)
app.post('/api/parse-and-publish', forward)
app.use('/api', forward)

const PORT = parseInt(process.env.PORT || '8080', 10)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`)
})
