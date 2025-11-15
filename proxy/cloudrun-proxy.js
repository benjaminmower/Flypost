const express = require('express')
const createForward = require('./src/forward')

const app = express()

// Parse incoming JSON (safe default limit)
app.use(express.json({ limit: '1mb' }))

// Simple request logging for Cloud Run logs
app.use((req, res, next) => {
  try {
    console.log(
      'proxy incoming:',
      req.method,
      req.originalUrl,
      'auth:',
      !!req.headers.authorization
    )
  } catch (e) {
    // Logging should never crash the app
  }
  next()
})

// Create a single forward middleware instance
const forward = createForward()

// Root status endpoint for quick sanity checks of the proxy service itself
// (keep existing behavior)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' })
})

// Forwarded routes to backend (preserving path + query via forward middleware)

// Health: proxy /health -> backend /health
app.get('/health', forward)

// Backend API: proxy /v1/events/near -> backend /v1/events/near
app.get('/v1/events/near', forward)

// Backend API: proxy /api/parse-and-publish -> backend /api/parse-and-publish
app.post('/api/parse-and-publish', forward)

// If you also want to preserve the old /api prefix behavior for the frontend,
// you can still mount the forwarder under /api as well:
app.use('/api', forward)

// Start server on the port provided by Cloud Run and bind to all interfaces.
const PORT = parseInt(process.env.PORT || '8080', 10)
const HOST = '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log(`Proxy listening on http://${HOST}:${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received: shutting down')
  process.exit(0)
})
