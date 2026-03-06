// v17 – Flypost forwarder with multi-token auth + tenancy mapping
// - Supports multiple static write tokens (global + per brokerage)
// - Derives brokerageId from the validated token
// - Injects x-flypost-brokerage-id header to backend
// - Keeps: ID token auth, logging, provenance enrichment

const { GoogleAuth } = require('google-auth-library')
const axios = require('axios')
const crypto = require('crypto')
const { getFirebaseAuth } = require('./firebaseAdmin')

const BACKEND_BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '')
if (!BACKEND_BASE) {
  console.warn('WARNING: BACKEND_URL is not set. Forwarder will return 500 until set.')
}

const USE_ID_TOKEN = process.env.PROXY_USE_ID_TOKEN !== 'false'

// ---- Static write tokens (add more brokerages here) ----
// ---- Static write tokens (add more brokerages here) ----
const VISTA_TOKEN = process.env.VISTA_WRITE_TOKEN || ''
const BHHS_TOKEN = process.env.BHHS_UTAH_WRITE_TOKEN || ''
const COMPASS_TOKEN = process.env.COMPASS_WRITE_TOKEN || ''  // ← ADD THIS
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

const allowedOrigins = Array.from(
  new Set([
    ...((process.env.FRONTEND_ORIGIN || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)),
    'https://flypost.netlify.app',
    'https://app.goflypost.com',
    'https://presence.goflypost.com',
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
  const firebaseAuth = HAS_FIREBASE_AUTH ? getFirebaseAuth() : null

  function extractBearer(authHeader) {
    if (!authHeader) return ''
    return authHeader.replace(/^Bearer\s+/i, '').trim()
  }

  function safeErrorSummary(err) {
    if (!err) return null
    return {
      name: err.name,
      code: err.code,
      message: err.message,
    }
  }

  async function verifyFirebaseIdToken(authHeader) {
    if (!HAS_FIREBASE_AUTH || !firebaseAuth) return { ok: false, reason: 'firebase-disabled' }

    const token = extractBearer(authHeader)
    if (!token) return { ok: false, reason: 'missing-token' }

    try {
      // Firebase Admin SDK verifies: signature, exp, iat, aud, iss, sub
      // Handles key rotation automatically by fetching current public keys
      const decoded = await firebaseAuth.verifyIdToken(token)
      return { ok: true, decoded }
    } catch (err) {
      return { ok: false, reason: 'verify-failed', error: err }
    }
  }

  return async function forward(req, res) {
    const origin = req.headers.origin
    const requestId = ensureRequestId(req)
    // Use originalUrl to check path since req.path may be stripped by Express routing
    // Extract path without query string/hash using URL parsing for robustness
    let originalPath
    try {
      // Use URL parsing for reliable path extraction
      originalPath = new URL(req.originalUrl, 'http://localhost').pathname
    } catch {
      // Fallback to simple split if URL parsing fails (shouldn't happen)
      originalPath = req.originalUrl.split('?')[0].split('#')[0]
    }
    const isApiPost = req.method === 'POST' && originalPath.startsWith('/api/')
    const isParseAndPublish =
      req.method === 'POST' && originalPath === '/api/parse-and-publish'

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
      // Truth-writing origin restriction
      // Presence and feedback endpoints require presence.goflypost.com origin
      //-------------------------------------
      const isTruthEndpoint = 
        req.method === 'POST' && 
        (originalPath.startsWith('/v1/presence/') || originalPath.startsWith('/v1/feedback/'))
      
      if (isTruthEndpoint) {
        const REQUIRED_ORIGIN = 'https://presence.goflypost.com'
        
        if (origin !== REQUIRED_ORIGIN) {
          setCors(res, origin)
          console.log(
            `🔒 Truth endpoint ${originalPath} requires origin ${REQUIRED_ORIGIN}, ` +
            `got: ${origin || 'missing'} (id=${requestId})`
          )
          return res.status(403).json({
            success: false,
            error: 'Forbidden: This endpoint requires presence.goflypost.com origin',
            detail: `Truth-writing endpoints (presence/feedback) can only be accessed from the Presence web application`,
            requestId
          })
        }
        
        console.log(`✅ Truth endpoint ${originalPath} - origin validated (id=${requestId})`)
      }

      //-------------------------------------
      // Write authentication + tenancy derivation
      // Origin-gated auth policy:
      // 1. Firebase-required browser origins: app.goflypost.com, post.goflypost.com
      // 2. Read-only ask origin: ask.goflypost.com (only /api/chat allowed)
      // 3. Machine/server writes: require static token in x-flypost-write-token
      // 4. /api/chat and /api/chat/* exempt from auth (but not /api/chatbot)
      //-------------------------------------
      let firebaseUser = null
      let resolvedBrokerageId = null

      // Check if this is /api/chat or /api/chat/* (but not /api/chatbot or /api/chatbot/*)
      // Logic: exact match OR starts with '/api/chat/' (note the trailing slash)
      // This correctly excludes '/api/chatbot' because it doesn't start with '/api/chat/'
      const isChatEndpoint = originalPath === '/api/chat' || originalPath.startsWith('/api/chat/')

      if (isApiPost && !isChatEndpoint) {
        const bearer = req.headers.authorization || req.headers.Authorization
        const headerToken = (req.headers['x-flypost-write-token'] || '').toString().trim()

        // Define browser origins that require Firebase auth
        const FIREBASE_REQUIRED_ORIGINS = [
          'https://app.goflypost.com',
          'https://post.goflypost.com'
        ]

        // Check if origin is ask.goflypost.com (read-only)
        if (origin === 'https://ask.goflypost.com') {
          // ask.goflypost.com is read-only - reject all POST except /api/chat (already handled above)
          setCors(res, origin)
          console.log(`🔒 Read-only origin ${origin} attempted write to ${originalPath}`)
          return res.status(401).json({
            success: false,
            error: 'ask.goflypost.com is read-only. Writes are not allowed.',
            requestId
          })
        }

        // Check if origin requires Firebase auth
        const requiresFirebaseAuth = FIREBASE_REQUIRED_ORIGINS.includes(origin)

        if (requiresFirebaseAuth) {
          // Browser origins: require Firebase token, do NOT accept static tokens
          const firebaseAuthResult = await verifyFirebaseIdToken(bearer)
          if (firebaseAuthResult.ok) {
            firebaseUser = firebaseAuthResult.decoded
            console.log(`✅ Firebase auth validated for ${origin}`)
          } else {
            setCors(res, origin)
            console.log(`🔒 Firebase auth required for ${origin} but ${firebaseAuthResult.reason}`)

            // NEW: log the underlying verification error (safe, no token logged)
            if (firebaseAuthResult.error) {
              console.log(
                `🔍 Firebase verify error (id=${requestId}):`,
                JSON.stringify(safeErrorSummary(firebaseAuthResult.error))
              )
            }

            return res.status(401).json({
              success: false,
              error: 'Firebase authentication required for browser writes',
              detail: firebaseAuthResult.reason === 'firebase-disabled' 
                ? 'Firebase auth not configured'
                : firebaseAuthResult.reason === 'missing-token'
                ? 'Missing Authorization header with Firebase token'
                : 'Invalid or expired Firebase token',
              requestId
            })
          }
        } else {
          // Non-browser origin or no origin: try both Firebase and static tokens
          const firebaseAuthResult = await verifyFirebaseIdToken(bearer)
          if (firebaseAuthResult.ok) {
            firebaseUser = firebaseAuthResult.decoded
          } else if (firebaseAuthResult.reason === 'verify-failed') {
            // NEW: log verification errors for non-browser origins too (debugging)
            if (firebaseAuthResult.error) {
              console.log(
                `🔍 Firebase verify error (non-browser, id=${requestId}):`,
                JSON.stringify(safeErrorSummary(firebaseAuthResult.error))
              )
            }
          }

          let matchedStaticToken = null
          if (WRITE_TOKENS.length > 0) {
            const bearerToken = extractBearer(bearer)
            for (const token of WRITE_TOKENS) {
              if (!token) continue
              if (headerToken === token || bearerToken === token) {
                matchedStaticToken = token
                resolvedBrokerageId = TOKEN_TENANCY[token] || null
                break
              }
            }
          }

          const hasValidStaticToken = Boolean(matchedStaticToken)

          if (!firebaseUser && !hasValidStaticToken) {
            setCors(res, origin)
            console.log(`🔒 No valid auth for ${req.method} ${originalPath} from ${origin || 'no-origin'}`)
            return res.status(401).json({
              success: false,
              error: 'Unauthorized: Missing or invalid authentication',
              detail: 'Provide valid Firebase ID token in Authorization header or static token in x-flypost-write-token header',
              requestId
            })
          }

          if (hasValidStaticToken) {
            console.log(`✅ Static write token validated for ${req.method} ${originalPath}`)
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

      // SSE streaming endpoints must not be buffered — pipe directly to client
      const isStreamEndpoint = originalPath === '/api/chat/stream'

      if (isStreamEndpoint) {
        const backendRes = await axios({
          url: targetUrl,
          method: req.method,
          headers,
          data,
          responseType: 'stream',
          validateStatus: () => true
        })

        const status = backendRes.status
        const color =
          status >= 500
            ? '\x1b[31m'
            : status >= 400
            ? '\x1b[33m'
            : '\x1b[32m'

        Object.entries(backendRes.headers || {}).forEach(([k, v]) => {
          if (!k) return
          if (hopByHop.includes(k.toLowerCase())) return
          try {
            res.setHeader(k, v)
          } catch (_) {}
        })

        setCors(res, origin)
        res.status(status)

        backendRes.data.on('end', () => {
          const durationMs = Date.now() - start
          console.log(
            `[backend → proxy] ${color}${status}\x1b[0m ` +
              `${req.method} ${req.originalUrl} ` +
              `(stream ended, ${durationMs}ms, id=${requestId})`
          )
        })

        backendRes.data.pipe(res)
        return
      }

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
