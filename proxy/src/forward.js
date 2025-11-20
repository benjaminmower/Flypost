// v14 – Flypost robust forwarder
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
const WRITE_TOKEN = process.env.FLYPOST_WRITE_TOKEN || process.env.WRITE_TOKEN || ''
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
    const isApiPost = req.method === 'POST' && req.path.startsWith('/api/')
    const isParseAndPublish =
      req.method === 'POST' && req.path === '/api/parse-and-publish'

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
      // Basic write authentication
      //-------------------------------------
      if (isApiPost && WRITE_TOKEN) {
        const bearer = req.headers.authorization || req.headers.Authorization
        const headerToken = req.headers['x-flypost-write-token']
        const provided = (headerToken || '').toString().trim()
        const bearerToken = bearer
          ? bearer.replace(/^Bearer\s+/i, '').trim()
          : ''
        const suppliedToken = provided || bearerToken

        if (!suppliedToken || suppliedToken !== WRITE_TOKEN) {
          setCors(res, origin)
          return res.status(401).json({
            success: false,
            error: 'unauthorized write',
            requestId
          })
        }
      }

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
      // Source channel hint for backend provenance
      //-------------------------------------
      const sourceChannel =
        req.headers['x-flypost-source-channel'] ||
        (req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? req.body.userContext?.channel || req.body.userContext?.source
          : null)
      if (sourceChannel) {
        headers['x-flypost-source-channel'] = sourceChannel
      }

      //-------------------------------------
      // Body handling
      //-------------------------------------
      let data
      if (isParseAndPublish && req.body && typeof req.body === 'object') {
        const baseContext =
          typeof req.body.userContext === 'object' &&
          !Array.isArray(req.body.userContext)
            ? req.body.userContext
            : {}
        req.body = {
          ...(typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}),
          userContext: {
            ...baseContext,
            provenance: {
              ...(baseContext?.provenance || {}),
              via: 'flypost-proxy',
              origin: origin || 'unknown',
              requestId,
              userAgent: req.headers['user-agent'] || 'unknown',
              receivedAt: new Date().toISOString()
            }
          }
        }
      }

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
