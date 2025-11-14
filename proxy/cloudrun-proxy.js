import express from 'express'
import { GoogleAuth } from 'google-auth-library'

const app = express()
const auth = new GoogleAuth()

const TARGET = process.env.TARGET_URL || 'https://flypostv4-498798854474.us-west1.run.app'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://flypost.netlify.app'

// parse JSON bodies so POST/PUT proxying works
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// CORS middleware for all incoming requests
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    return res.sendStatus(204)
  }
  next()
})

// Optional: keep any explicit /api/... helpers (existing handlers may be preserved),
// but the generic catch-all below will handle both /api/* and non-/api paths used by the frontend.

// Generic proxy: forward any path to TARGET
app.use(async (req, res) => {
  try {
    // If the incoming path starts with /api, strip the prefix when forwarding.
    // That keeps compatibility with both frontend calling /api/... (proxy-style)
    // and frontend calling root-level backend paths (/health, /v1/...).
    const upstreamPath = req.originalUrl.replace(/^\/api/, '') // includes query string
    const upstreamUrl = `${TARGET}${upstreamPath}`

    const client = await auth.getIdTokenClient(TARGET)

    // Clone headers but remove host to avoid conflicts; Google-auth will add Authorization header.
    const forwardHeaders = { ...req.headers }
    delete forwardHeaders.host

    const opts = {
      url: upstreamUrl,
      method: req.method,
      headers: forwardHeaders,
      // axios-style 'data' for non-GET bodies. client.request will accept this.
      data: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
      responseType: 'arraybuffer', // preserve binary responses if any
      validateStatus: null
    }

    const response = await client.request(opts)

    // Mirror upstream status and content-type
    if (response.headers && response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type'])
    }
    res.status(response.status).send(response.data)
  } catch (err) {
    console.error('proxy error', err)
    res.status(502).json({ error: 'upstream proxy error' })
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`Proxy listening on ${PORT}`))
