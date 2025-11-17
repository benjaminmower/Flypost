// Robust forwarder for proxy -> backend
// Preserves original path+query and forwards requests with an ID token for the backend audience.
//v12
// Forwarder with manual ID token, status preservation, robust logging, CORS

const { GoogleAuth } = require('google-auth-library')
const axios = require('axios')

const BACKEND_BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '')
if (!BACKEND_BASE) {
  console.warn('WARNING: BACKEND_URL is not set. Forwarder will return 500 until set.')
}

const USE_ID_TOKEN = process.env.PROXY_USE_ID_TOKEN !== 'false'
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'https://flypost.netlify.app',
  'http://localhost:5173'
]

function setCors(res, origin) {
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

module.exports = function createForward() {
  const auth = USE_ID_TOKEN ? new GoogleAuth() : null

  return async function forward(req, res) {
    const origin = req.headers.origin

    if (!BACKEND_BASE) {
      setCors(res, origin)
      return res.status(500).json({ success: false, error: 'proxy backend not configured' })
    }

    const targetUrl = BACKEND_BASE + req.originalUrl
    console.log('proxy forwarding:', { method: req.method, targetUrl, useIdToken: USE_ID_TOKEN })

    try {
      const headers = { ...req.headers }
      const hopByHop = [
        'connection','keep-alive','proxy-authenticate','proxy-authorization',
        'te','trailer','transfer-encoding','upgrade','accept-encoding'
      ]
      hopByHop.forEach(h => delete headers[h])
      delete headers.authorization
      delete headers.Authorization
      headers.host = new URL(BACKEND_BASE).host

      let data
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body && (typeof req.body === 'string' ? req.body.length : Object.keys(req.body).length)) {
          data = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
          headers['content-type'] = headers['content-type'] || 'application/json'
          headers['content-length'] = Buffer.byteLength(data)
        }
      }

      if (USE_ID_TOKEN) {
        const client = await auth.getIdTokenClient(BACKEND_BASE)
        const tokenHeaders = await client.getRequestHeaders()
        headers.Authorization = tokenHeaders.Authorization
      }

      const start = Date.now()
      const backendRes = await axios({
        url: targetUrl,
        method: req.method,
        headers,
        data,
        responseType: 'arraybuffer',
        validateStatus: () => true
      })
      const durationMs = Date.now() - start

      const rawBody = Buffer.from(backendRes.data || '')
      console.log(`proxy backend response: status=${backendRes.status} bytes=${rawBody.length} durMs=${durationMs}`)

      Object.entries(backendRes.headers || {}).forEach(([k, v]) => {
        if (!k) return
        const lower = k.toLowerCase()
        if (hopByHop.includes(lower)) return
        try { res.setHeader(k, v) } catch (_) {}
      })

      setCors(res, origin)

      res.status(backendRes.status).send(rawBody)
    } catch (err) {
      console.error('proxy forward exception:', err && err.stack ? err.stack : err)
      setCors(res, origin)
      return res.status(502).json({
        success: false,
        error: 'proxy forward error',
        detail: err && err.message ? err.message : String(err),
        target: targetUrl
      })
    }
  }
}
