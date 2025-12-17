/**
 * HMAC request signing verification for machine-to-machine authentication
 * 
 * Signature scheme:
 * 1. Canonical string: `${timestamp}.${method}.${path}.${sha256(rawBody)}`
 * 2. Signature: base64(hmac_sha256(secret, canonicalString))
 * 
 * Required headers:
 * - x-flypost-client-id: Client identifier
 * - x-flypost-timestamp: Unix timestamp in seconds
 * - x-flypost-signature: Base64-encoded HMAC signature
 */

import crypto from 'crypto'

// Default timestamp skew tolerance: 5 minutes
const DEFAULT_SKEW_SECONDS = 300

/**
 * Load HMAC secrets from environment variable
 * Expected format: JSON object mapping clientId -> secret
 * Example: {"mls-adapter":"secret123","scraper":"secret456"}
 * 
 * @returns {object} Map of clientId to secret
 */
export function loadHmacSecrets() {
  const secretsJson = process.env.FLYPOST_HMAC_SECRETS_JSON || '{}'
  
  try {
    const secrets = JSON.parse(secretsJson)
    if (typeof secrets !== 'object' || secrets === null || Array.isArray(secrets)) {
      console.warn('⚠️  FLYPOST_HMAC_SECRETS_JSON is not a valid object, using empty secrets')
      return {}
    }
    return secrets
  } catch (error) {
    console.error('❌ Failed to parse FLYPOST_HMAC_SECRETS_JSON:', error.message)
    return {}
  }
}

/**
 * Compute SHA-256 hash of request body
 * @param {Buffer|string} body - Request body (raw bytes)
 * @returns {string} Hex-encoded hash
 */
export function computeBodyHash(body) {
  if (!body) {
    return crypto.createHash('sha256').update('').digest('hex')
  }
  
  // Ensure we're working with Buffer
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Build canonical string for signing
 * Format: `${timestamp}.${method}.${path}.${bodyHash}`
 * 
 * @param {string} timestamp - Unix timestamp in seconds
 * @param {string} method - HTTP method (uppercase)
 * @param {string} path - Request path
 * @param {string} bodyHash - SHA-256 hash of request body (hex)
 * @returns {string} Canonical string
 */
export function buildCanonicalString(timestamp, method, path, bodyHash) {
  return `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`
}

/**
 * Compute HMAC signature
 * @param {string} secret - Client secret
 * @param {string} canonicalString - Canonical string to sign
 * @returns {string} Base64-encoded signature
 */
export function computeSignature(secret, canonicalString) {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalString)
    .digest('base64')
}

/**
 * Verify HMAC signature
 * @param {object} options
 * @param {string} options.clientId - Client identifier
 * @param {string} options.timestamp - Unix timestamp (seconds)
 * @param {string} options.signature - Base64-encoded signature
 * @param {string} options.method - HTTP method
 * @param {string} options.path - Request path
 * @param {Buffer} options.rawBody - Raw request body
 * @returns {object} { valid: boolean, error?: string }
 */
export function verifyHmacSignature({ clientId, timestamp, signature, method, path, rawBody }) {
  // Load secrets
  const secrets = loadHmacSecrets()
  
  // Check if clientId is known
  if (!secrets[clientId]) {
    return {
      valid: false,
      error: `Unknown client ID: ${clientId}`
    }
  }
  
  // Verify timestamp (replay protection)
  const timestampSeconds = parseInt(timestamp, 10)
  if (isNaN(timestampSeconds)) {
    return {
      valid: false,
      error: 'Invalid timestamp format (must be Unix seconds)'
    }
  }
  
  const nowSeconds = Math.floor(Date.now() / 1000)
  const skewSeconds = parseInt(process.env.HMAC_TIMESTAMP_SKEW_SECONDS || DEFAULT_SKEW_SECONDS, 10)
  const timeDiff = Math.abs(nowSeconds - timestampSeconds)
  
  if (timeDiff > skewSeconds) {
    return {
      valid: false,
      error: `Timestamp out of range (skew: ${timeDiff}s, max: ${skewSeconds}s)`
    }
  }
  
  // Compute expected signature
  const bodyHash = computeBodyHash(rawBody)
  const canonicalString = buildCanonicalString(timestamp, method, path, bodyHash)
  const expectedSignature = computeSignature(secrets[clientId], canonicalString)
  
  // Constant-time comparison to prevent timing attacks
  const actualBuffer = Buffer.from(signature, 'base64')
  const expectedBuffer = Buffer.from(expectedSignature, 'base64')
  
  if (actualBuffer.length !== expectedBuffer.length) {
    return {
      valid: false,
      error: 'Invalid signature'
    }
  }
  
  const isValid = crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  
  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid signature'
    }
  }
  
  return { valid: true }
}

/**
 * Extract HMAC headers from request
 * @param {object} req - Express request object
 * @returns {object|null} { clientId, timestamp, signature } or null if headers missing
 */
export function extractHmacHeaders(req) {
  const clientId = req.get('x-flypost-client-id')
  const timestamp = req.get('x-flypost-timestamp')
  const signature = req.get('x-flypost-signature')
  
  if (!clientId || !timestamp || !signature) {
    return null
  }
  
  return { clientId, timestamp, signature }
}
