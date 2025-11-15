const express = require('express')
const createForward = require('./src/forward')

const app = express()

// Parse incoming JSON (safe default limit)
app.use(express.json({ limit: '1mb' }))

// Simple request logging for Cloud Run logs
app.use((req, res, next) => {
  try {
    console.log('proxy incoming:', req.method, req.originalUrl, 'auth:', !!req.headers.authorization)
  } catch (e) {
    // Logging should never crash the app
  }
  next()
})

// Mount forwarder at /api (preserves /api prefix behavior)
app.use('/api', createForward())

// Optional root endpoint for quick sanity checks of the proxy service itself
app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' })
})

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
