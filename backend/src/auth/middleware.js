/**
 * Authentication middleware for write endpoints
 * Supports two authentication methods:
 * 1. Firebase ID Token: Authorization: Bearer <token>
 * 2. HMAC request signing: x-flypost-client-id, x-flypost-timestamp, x-flypost-signature
 */

import { verifyFirebaseToken, isFirebaseAuthEnabled } from './firebaseAdmin.js'
import { verifyHmacSignature, extractHmacHeaders } from './hmac.js'

/**
 * Authentication middleware for write endpoints
 * Tries Firebase ID token first, then HMAC signing
 * Attaches req.auth with authentication details on success
 * 
 * @returns {Function} Express middleware function
 */
export function requireWriteAuth() {
  return async (req, res, next) => {
    // Check for Authorization header (Firebase ID token)
    const authHeader = req.get('authorization')
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return await handleFirebaseAuth(req, res, next, authHeader)
    }
    
    // Check for HMAC headers
    const hmacHeaders = extractHmacHeaders(req)
    if (hmacHeaders) {
      return await handleHmacAuth(req, res, next, hmacHeaders)
    }
    
    // No authentication provided
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Provide either Authorization: Bearer <firebase_token> or HMAC signature headers (x-flypost-client-id, x-flypost-timestamp, x-flypost-signature)'
    })
  }
}

/**
 * Handle Firebase ID token authentication
 */
async function handleFirebaseAuth(req, res, next, authHeader) {
  const idToken = authHeader.substring(7) // Remove 'Bearer ' prefix
  
  // Check if Firebase Auth is enabled
  if (!isFirebaseAuthEnabled()) {
    return res.status(503).json({
      success: false,
      error: 'Firebase authentication not available',
      message: 'Firebase Admin SDK is not initialized. Set GOOGLE_CLOUD_PROJECT to enable.'
    })
  }
  
  try {
    const decoded = await verifyFirebaseToken(idToken)
    
    // Check for optional custom claims (e.g., flypostPublisher: true)
    // For MVP, allow all verified users
    const hasPublisherClaim = decoded.claims.flypostPublisher === true
    
    // Attach auth context to request
    req.auth = {
      type: 'firebase',
      uid: decoded.uid,
      email: decoded.email,
      claims: decoded.claims,
      hasPublisherClaim
    }
    
    console.log(`🔐 Authenticated via Firebase: ${decoded.email || decoded.uid}`)
    next()
  } catch (error) {
    console.error('❌ Firebase auth failed:', error.message)
    return res.status(401).json({
      success: false,
      error: 'Invalid Firebase ID token',
      details: error.message
    })
  }
}

/**
 * Handle HMAC signature authentication
 */
async function handleHmacAuth(req, res, next, hmacHeaders) {
  const { clientId, timestamp, signature } = hmacHeaders
  
  // Verify we have rawBody available
  if (!req.rawBody) {
    console.error('❌ rawBody not available for HMAC verification')
    return res.status(503).json({
      success: false,
      error: 'Authentication service temporarily unavailable',
      message: 'Unable to process HMAC authentication at this time'
    })
  }
  
  // Verify signature
  const verification = verifyHmacSignature({
    clientId,
    timestamp,
    signature,
    method: req.method,
    path: req.path,
    rawBody: req.rawBody
  })
  
  if (!verification.valid) {
    console.error(`❌ HMAC verification failed for client ${clientId}: ${verification.error}`)
    return res.status(401).json({
      success: false,
      error: 'HMAC signature verification failed',
      details: verification.error
    })
  }
  
  // Attach auth context to request
  req.auth = {
    type: 'hmac',
    clientId
  }
  
  console.log(`🔐 Authenticated via HMAC: ${clientId}`)
  next()
}
