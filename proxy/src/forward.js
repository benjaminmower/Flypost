// Minimal forwarder that obtains an ID token for the backend and forwards the request.
// Requires: npm install google-auth-library node-fetch@2 express-http-proxy (or use native fetch in Node 18+)
// Usage: const forward = require('./forward'); app.use('/', forward());

const { GoogleAuth } = require('google-auth-library')
const fetch = require('node-fetch') // or use global fetch in Node 18+
const url = require('url')

const BACKEND_BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '') // e.g. https://flypostv4-....run.app

if (!BACKEND_BASE) {
  console.warn('WARNING: BACKEND_URL is not set. Proxy forwarder will not work until BACKEND_URL is set.')
}

module.exports = function createForwardMiddleware() {
  const auth = new GoogleAuth()

  return async function forwardMiddleware(req, res, next) {
    if (!BACKEND_BASE) return res.status(500).json({ error: 'proxy backend not configured' })

    try {
      // Build full backend URL preserving original path + query
      const targetUrl = BACKEND_BASE + req.originalUrl

      // Obtain an ID token client for the backend audience
      const client = await auth.getIdTokenClient(BACKEND_BASE)
      // Use the client to make the request; client.request attaches Authorization header
      // Collect body (assuming express.json() used upstream)
      const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : undefined

      const headers = {
        ...req.headers,
        // override host to backend host
        host: url.parse(BACKEND_BASE).host,
        // ensure content-type is correct if we forwarded a body
        ...(body ? { 'content-type': req.get('content-type') || 'application/json' } : {})
      }
      // Remove hop-by-hop headers that should not be forwarded
      delete headers['accept-encoding']
      delete headers['content-length']
      delete headers.connection

      // client.request returns a response-like object
      const backendRes = await client.request({
        url: targetUrl,
        method: req.method,
        headers,
        data: body
      })

      // Relay status, headers, and body to original client
      // Some headers should be filtered; this is a minimal pass-through
      Object.entries(backendRes.headers || {}).forEach(([k, v]) => {
        // Avoid setting hop-by-hop headers; adjust as needed
        if (['transfer-encoding', 'content-encoding'].includes(k.toLowerCase())) return
        res.setHeader(k, v)
      })

      res.status(backendRes.status).send(backendRes.data)
    } catch (err) {
      console.error('proxy -> backend forward error:', err && err.stack ? err.stack : err)
      // Return a clear JSON error so the frontend doesn't get opaque 502
      res.status(502).json({ error: 'upstream proxy error', details: err?.message })
    }
  }
}
