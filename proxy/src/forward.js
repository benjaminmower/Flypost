// v16 – Flypost forwarder with multi-token auth + tenancy mapping
// - Supports multiple static write tokens (global + per brokerage)
// - Derives brokerageId from the validated token
// - Injects x-flypost-brokerage-id header to backend
// - Keeps: ID token auth, logging, provenance enrichment

const { GoogleAuth, OAuth2Client } = require('google-auth-library')
const axios = require('axios')
const crypto = require('crypto')

const BACKEND_BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '')
if (!BACKEND_BASE) {
  console.warn('WARNING: BACKEND_URL is not set. Forwarder will return 500 until set.')
}

const USE_ID_TOKEN = process.env.PROXY_USE_ID_TOKEN !== 'false'

// ---- Static write tokens (add more brokerages here) ----
// ---- Static write tokens (add more brokerages here) ----
const VISTA_TOKEN = process.env.VISTA_WRITE_TOKEN || ''
const BHHS_TOKEN = process.env.BHHS_UTAH_WRITE_TOKEN || ''
const COMPASS_TOKEN = process.env. COMPASS_WRITE_TOKEN || ''  // ← ADD THIS
const GLOBAL_TOKEN = process.env.FLYPOST_WRITE_TOKEN || ''

// List of *values* that are accepted as write tokens
const WRITE_TOKENS = [GLOBAL_TOKEN, VISTA_TOKEN, BHHS_TOKEN, COMPASS_TOKEN].filter(Boolean)  // ← ADD COMPASS_TOKEN

// Map token value -> canonical brokerageId
const TOKEN_TENANCY = {}
if (VISTA_TOKEN) TOKEN_TENANCY[VISTA_TOKEN] = 'vista-sir'
if (BHHS_TOKEN) TOKEN_TENANCY[BHHS_TOKEN] = 'bhhs_utah'
if (COMPASS_TOKEN) TOKEN_TENANCY[COMPASS_TOKEN] = 'compass'  // ← ADD THIS

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || ''
const HAS_FIREBASE_AUTH = Boolean(FIREBASE_PROJECT_ID)

// Origin-gated auth policy: app.goflypost.com requires Firebase, others require static token
const APP_ORIGIN = 'https://app.goflypost.com'

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
  const firebaseVerifier = HAS_FIREBASE_AUTH ? new OAuth2Client(FIREBASE_PROJECT_ID) : null

  function extractBearer(authHeader) {
    if (!authHeader) return ''
    return authHeader.replace(/^Bearer\s+/i, '').trim()
  }

  async function verifyFirebaseIdToken(authHeader) {
    if (!HAS_FIREBASE_AUTH || !firebaseVerifier) return { ok: false, reason: 'firebase-disabled' }

    const token = extractBearer(authHeader)
    if (!token) return { ok: false, reason: 'missing-token' }

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
      return { ok: false, reason: 'verify-failed', error: err }
    }
  }

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

    console.log(
      `[proxy → backend] ${req.method} ${req.originalUrl} ` +
        `(origin=${origin || 'n/a'}, id=${requestId}, useIdToken=${USE_ID_TOKEN}, firebaseAuth=${HAS_FIREBASE_AUTH})`
    )

    try {
      //-------------------------------------
      // Write authentication + tenancy derivation
      // Origin-gated policy:
      // - app.goflypost.com: requires Firebase Bearer token
      // - other origins: require x-flypost-write-token
      // - /api/chat is exempt (read-only POST endpoint)
      //-------------------------------------
      let firebaseUser = null
      let resolvedBrokerageId = null

      const isChatEndpoint = req.path.startsWith('/api/chat')

      if (isApiPost && !isChatEndpoint) {
        const bearer = req.headers.authorization || req.headers.Authorization
        const headerToken = (req.headers['x-flypost-write-token'] || '').toString().trim()

        // Check if request is from app.goflypost.com
        const isAppOrigin = origin === APP_ORIGIN

        if (isAppOrigin) {
          // App origin: require Firebase token
          const firebaseAuthResult = await verifyFirebaseIdToken(bearer)
          if (!firebaseAuthResult.ok) {
            setCors(res, origin)
            console.log(`🔒 Firebase auth failed for ${origin}: ${firebaseAuthResult.reason}`)
            return res.status(401).json({
              success: false,
              error: 'unauthorized: Firebase authentication required for app.goflypost.com',
              requestId
            })
          }
          firebaseUser = firebaseAuthResult.decoded
          console.log(`✅ Firebase auth successful for ${origin} (uid=${firebaseUser.uid})`)
        } else {
          // Non-app origin: require static write token
          if (!WRITE_TOKENS.length) {
            // No tokens configured - allow for backward compatibility
            console.log(`⚠️  No write tokens configured, allowing ${req.method} ${req.path}`)
          } else {
            let matchedStaticToken = null
            for (const token of WRITE_TOKENS) {
              if (!token) continue
              if (headerToken === token) {
                matchedStaticToken = token
                resolvedBrokerageId = TOKEN_TENANCY[token] || null
                break
              }
            }

            if (!matchedStaticToken) {
              setCors(res, origin)
              console.log(`🔒 Static write token missing/invalid for origin=${origin || 'none'}`)
              return res.status(401).json({
                success: false,
                error: 'unauthorized: valid x-flypost-write-token required',
                requestId
              })
            }
            console.log(`✅ Static write token validated for origin=${origin || 'none'}`)
          }
        }
      }

      //-------------------------------------
      // Clone/sanitize headers
      //-------------------------------------
      const headers = { ...req.headers }
      const hopByHop = [
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
      hopByHop.forEach(h => delete headers[h])
      delete headers.authorization
      delete headers.Authorization

      headers.host = new URL(BACKEND_BASE).host

      // Inject canonical brokerageId if we resolved one from token
      if (resolvedBrokerageId) {
        headers['x-flypost-brokerage-id'] = resolvedBrokerageId
      }

      //-------------------------------------
      // Source channel hint for backend provenance
      //-------------------------------------
      const sourceChannel =
        req.headers['x-flypost-source-channel'] ||
        (req.body &&
        typeof req.body === 'object' &&
        !Array.isArray(req.body)
          ? req.body?.userContext?.channel || req.body?.userContext?.source
          : null)

      if (sourceChannel) {
        headers['x-flypost-source-channel'] = sourceChannel
      }

      if (firebaseUser) {
        headers['x-flypost-auth-provider'] = 'firebase'
        headers['x-flypost-auth-uid'] = firebaseUser.uid
        if (firebaseUser.email) {
          headers['x-flypost-auth-email'] = firebaseUser.email
        }
      }

      //-------------------------------------
      // Body handling (provenance enrichment)
      //-------------------------------------
      let data
      if (isParseAndPublish && req.body && typeof req.body === 'object') {
        const baseContext =
          req.body &&
          typeof req.body.userContext === 'object' &&
          !Array.isArray(req.body.userContext)
            ? req.body.userContext
            : {}

        const firebaseProvenance = firebaseUser
          ? {
              authProvider: 'firebase',
              firebaseUid: firebaseUser.uid,
              firebaseEmail: firebaseUser.email,
              firebaseSignInProvider:
                firebaseUser.firebase?.sign_in_provider || 'emailLink',
              firebaseIssuedAt: firebaseUser.iat
                ? new Date(firebaseUser.iat * 1000).toISOString()
                : undefined
            }
          : {}

        req.body = {
          ...(typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}),
          userContext: {
            ...baseContext,
            provenance: {
              ...(baseContext?.provenance || {}),
              ...(firebaseProvenance || {}),
              via: 'flypost-proxy',
              origin: origin || 'unknown',
              requestId,
              userAgent: req.headers['user-agent'] || 'unknown',
              receivedAt: new Date().toISOString()
            }
          }
        }

        // If we know brokerageId from the token, make sure body.brokerageId matches
        if (resolvedBrokerageId) {
          req.body.brokerageId = resolvedBrokerageId
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
      // ID Token to backend
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
        validateStatus: () => true
      })
      const durationMs = Date.now() - start

      const rawBody = Buffer.from(backendRes.data || '')

      const status = backendRes.status
      const color =
        status >= 500
          ? '\x1b[31m'
          : status >= 400
          ? '\x1b[33m'
          : '\x1b[32m'

      console.log(
        `[backend → proxy] ${color}${status}\x1b[0m ` +
          `${req.method} ${req.originalUrl} ` +
          `(bytes=${rawBody.length}, ${durationMs}ms, id=${requestId})`
      )

      Object.entries(backendRes.headers || {}).forEach(([k, v]) => {
        if (!k) return
        if (hopByHop.includes(k.toLowerCase())) return
        try {
          res.setHeader(k, v)
        } catch (_) {}
      })

      setCors(res, origin)
      res.status(status).send(rawBody)
    } catch (err) {
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
