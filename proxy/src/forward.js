// v14 - Clean Forwarder (no tenancy logic)
// Robust proxy forwarder: request-id, logging, ID token if configured,
// Firebase auth passthrough, and response passthrough.

const { GoogleAuth, OAuth2Client } = require('google-auth-library')
const axios = require('axios')
const crypto = require('crypto')

const BACKEND_BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '')
if (!BACKEND_BASE) {
  console.warn('WARNING: BACKEND_URL is not set. Forwarder will return 500.')
}

const USE_ID_TOKEN = process.env.PROXY_USE_ID_TOKEN !== 'false'
const WRITE_TOKEN = process.env.FLYPOST_WRITE_TOKEN || process.env.WRITE_TOKEN || ''
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || ''
const HAS_FIREBASE_AUTH = Boolean(FIREBASE_PROJECT_ID)

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

function setCors(res, origin) {
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

function ensureRequestId(req) {
  let rid = req.headers['x-request-id']
  if (!rid) {
    rid = crypto.randomUUID()
    req.headers['x-request-id'] = rid
  }
  return rid
}

module.exports = function createForward() {
  const auth = USE_ID_TOKEN ? new GoogleAuth() : null
  const firebaseVerifier = HAS_FIREBASE_AUTH ? new OAuth2Client(FIREBASE_PROJECT_ID) : null

  function extractBearer(h) {
    if (!h) return ''
    return h.replace(/^Bearer\s+/i, '').trim()
  }

  async function verifyFirebaseIdToken(headerAuth) {
    if (!HAS_FIREBASE_AUTH) return { ok: false, reason: 'firebase-disabled' }

    const token = extractBearer(headerAuth)
    if (!token) return { ok: false, reason: 'missing' }

    const issuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
    try {
      const ticket = await firebaseVerifier.verifyIdToken({
        idToken: token,
        audience: FIREBASE_PROJECT_ID,
        issuer,
        certsUrl:
          'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
      })
      return { ok: true, decoded: ticket.getPayload() }
    } catch (err) {
      return { ok: false, reason: 'invalid', error: err }
    }
  }

  return async function forward(req, res) {
    const origin = req.headers.origin
    const requestId = ensureRequestId(req)

    if (!BACKEND_BASE) {
      setCors(res, origin)
      return res.status(500).json({ success: false, error: 'proxy backend not configured', requestId })
    }

    const targetUrl = BACKEND_BASE + req.originalUrl
    console.log(
      `[proxy → backend] ${req.method} ${req.originalUrl} (id=${requestId}, origin=${origin || 'n/a'})`
    )

    try {
      // Write + Firebase auth
      let firebaseUser = null
      const isApiPost = req.method === 'POST' && req.path.startsWith('/api/')

      if (isApiPost && (WRITE_TOKEN || HAS_FIREBASE_AUTH)) {
        const headerToken = req.headers['x-flypost-write-token']
        const bearer = req.headers.authorization || req.headers.Authorization
        const bearerToken = extractBearer(bearer)

        const firebaseAuthResult = await verifyFirebaseIdToken(bearer)
        if (firebaseAuthResult.ok) firebaseUser = firebaseAuthResult.decoded

        const hasWriteToken =
          WRITE_TOKEN && (headerToken === WRITE_TOKEN || bearerToken === WRITE_TOKEN)

        if (!firebaseUser && !hasWriteToken) {
          setCors(res, origin)
          return res.status(401).json({
            success: false,
            error: 'unauthorized write',
            requestId
          })
        }
      }

      // Clone headers
      const headers = { ...req.headers }
      const hop = [
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
        'accept-encoding'
      ]
      hop.forEach(h => delete headers[h])
      delete headers.authorization
      delete headers.Authorization

      headers.host = new URL(BACKEND_BASE).host

      if (firebaseUser) {
        headers['x-flypost-auth-provider'] = 'firebase'
        headers['x-flypost-auth-uid'] = firebaseUser.uid
        if (firebaseUser.email) headers['x-flypost-auth-email'] = firebaseUser.email
      }

      // Body
      let data
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        data = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        headers['content-type'] = 'application/json'
        headers['content-length'] = Buffer.byteLength(data)
      }

      // ID token
      if (USE_ID_TOKEN) {
        const client = await auth.getIdTokenClient(BACKEND_BASE)
        const tokenHeaders = await client.getRequestHeaders()
        headers.Authorization = tokenHeaders.Authorization
      }

      // Backend request
      const start = Date.now()
      const backendRes = await axios({
        url: targetUrl,
        method: req.method,
        headers,
        data,
        responseType: 'arraybuffer',
        validateStatus: () => true
      })
      const ms = Date.now() - start

      console.log(
        `[backend → proxy] ${backendRes.status} ${req.method} ${req.originalUrl} (${ms}ms, id=${requestId})`
      )

      // Forward backend headers
      Object.entries(backendRes.headers || {}).forEach(([k, v]) => {
        if (!k || hop.includes(k.toLowerCase())) return
        try {
          res.setHeader(k, v)
        } catch {}
      })

      setCors(res, origin)
      res.status(backendRes.status).send(Buffer.from(backendRes.data || ''))
    } catch (err) {
      console.error(`proxy ERROR id=${requestId} → ${targetUrl}`, err)
      setCors(res, origin)
      res.status(502).json({
        success: false,
        error: 'proxy forward error',
        detail: err?.message,
        target: targetUrl,
        requestId
      })
    }
  }
}
