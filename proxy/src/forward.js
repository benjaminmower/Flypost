// v13 – Flypost robust forwarder
// Adds request-id propagation, richer logging, latency metrics,
// cleaner CORS, and safer debug information.
// Preserves: ID token, status passthrough, hop-by-hop stripping, arraybuffer handling.

const { GoogleAuth } = require('google-auth-library')
const axios = require('axios')
const crypto = require('crypto')

const BACKEND_BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '')
if (!BACKEND_BASE) {
  console.warn('WARNING: BACKEND_URL is not set. Forwarder will return 500 until set.')
}

const USE_ID_TOKEN = process.env.PROXY_USE_ID_TOKEN !== 'false'
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'https://flypost.netlify.app',
  'https://app.goflypost.com',
  'http://localhost:5173'
]

//-------------------------------------
// CORS
//-------------------------------------
function setCors(res, origin) {
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

//-------------------------------------
// Request ID generator
//-------------------------------------
function ensureRequestId(req) {
  let rid = req.headers['x-request-id']
  if (!rid) {
    rid = crypto.randomUUID()
    req.headers['x-request-id'] = rid
  }
  return rid
}

//-------------------------------------
// Forwarder factory
//-------------------------------------
module.exports = function createForward() {
  const auth = USE_ID_TOKEN ? new GoogleAuth() : null

  return async function forward(req, res) {
    const origin = req.headers.origin
    const requestId = ensureRequestId(req)

    if (!BACKEND_BASE) {
      setCors(res, origin)
      return res.status(500).json({
        success: false,
        error: 'proxy backend not configured',
        requestId
      })
    }

    const targetUrl = BACKEND_BASE + req.originalUrl

    //-------------------------------------
    // OUTBOUND LOG
    //-------------------------------------
    console.log(
      `[proxy → backend] ${req.method} ${req.originalUrl} ` +
      `(origin=${origin || 'n/a'}, id=${requestId}, useIdToken=${USE_ID_TOKEN})`
    )

    try {
      //-------------------------------------
      // Clone/sanitize headers
      //-------------------------------------
      const headers = { ...req.headers }
      const hopByHop = [
        'connection','keep-alive','proxy-authenticate','proxy-authorization',
        'te','trailer','transfer-encoding','upgrade','accept-encoding'
      ]
      hopByHop.forEach(h => delete headers[h])
      delete headers.authorization
      delete headers.Authorization

      headers.host = new URL(BACKEND_BASE).host

      //-------------------------------------
      // Body handling
      //-------------------------------------
      let data
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (
          req.body &&
          (typeof req.body === 'string'
            ? req.body.length
            : Object.keys(req.body).length)
        ) {
          data =
            typeof req.body === 'string'
              ? req.body
              : JSON.stringify(req.body)
          headers['content-type'] = headers['content-type'] || 'application/json'
          headers['content-length'] = Buffer.byteLength(data)
        }
      }

      //-------------------------------------
      // ID Token
      //-------------------------------------
      if (USE_ID_TOKEN) {
        const client = await auth.getIdTokenClient(BACKEND_BASE)
        const tokenHeaders = await client.getRequestHeaders()
        headers.Authorization = tokenHeaders.Authorization
      }

      //-------------------------------------
      // Backend call
      //-------------------------------------
      const start = Date.now()
      const backendRes = await axios({
        url: targetUrl,
        method: req.method,
        headers,
        data,
        responseType: 'arraybuffer',
        validateStatus: () => true // preserve status codes
      })
      const durationMs = Date.now() - start

      const rawBody = Buffer.from(backendRes.data || '')

      //-------------------------------------
      // INBOUND LOG (colorized status)
      //-------------------------------------
      const status = backendRes.status
      const color =
        status >= 500 ? '\x1b[31m' : // red
        status >= 400 ? '\x1b[33m' : // yellow
        '\x1b[32m'                  // green

      console.log(
        `[backend → proxy] ${color}${status}\x1b[0m ` +
        `${req.method} ${req.originalUrl} ` +
        `(bytes=${rawBody.length}, ${durationMs}ms, id=${requestId})`
      )

      //-------------------------------------
      // Forward backend headers
      //-------------------------------------
      Object.entries(backendRes.headers || {}).forEach(([k, v]) => {
        if (!k) return
        if (hopByHop.includes(k.toLowerCase())) return
        try { res.setHeader(k, v) } catch (_) {}
      })

      setCors(res, origin)

      //-------------------------------------
      // Send response
      //-------------------------------------
      res.status(status).send(rawBody)

    } catch (err) {
      //-------------------------------------
      // ERROR LOG
      //-------------------------------------
      console.error(
        `[proxy ERROR] id=${requestId} path=${req.originalUrl} → ${targetUrl}\n`,
        err && err.stack ? err.stack : err
      )

      setCors(res, origin)

      return res.status(502).json({
        success: false,
        error: 'proxy forward error',
        detail: err && err.message ? err.message : String(err),
        target: targetUrl,
        requestId
      })
    }
  }
}
