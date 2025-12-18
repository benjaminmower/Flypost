/**
 * Runtime Anti-Drift Sanitizer
 * 
 * Recursively strips forbidden Layer 2 (Intelligence) keys from discovery responses
 * to enforce the Two-Layer North Star at runtime.
 * 
 * Behavior: Strip forbidden keys and log warnings, but continue (do not fail request)
 */

/**
 * Forbidden keys that must never appear in Layer 1 (Registry/Discovery) responses
 * These represent Layer 2 (Intelligence) data
 */
const FORBIDDEN_KEYS = new Set([
  // Attendance & presence data
  'attendance',
  'attendees',
  'buyerToken',
  'presenceProof',
  
  // Feedback & sentiment data
  'feedback',
  'sentiment',
  'insights',
  
  // Brokerage intelligence
  'brokerageAffiliation',
  
  // Any intelligence-prefixed keys will be caught by pattern matching
])

/**
 * Check if a key is forbidden (case-insensitive)
 * @param {string} key - The key to check
 * @returns {boolean} True if forbidden
 */
function isForbiddenKey(key) {
  if (typeof key !== 'string') {
    return false
  }
  
  const lowerKey = key.toLowerCase()
  
  // Check against lowercase forbidden keys
  for (const forbiddenKey of FORBIDDEN_KEYS) {
    if (lowerKey === forbiddenKey.toLowerCase()) {
      return true
    }
  }
  
  // Check for intelligence-prefixed keys (case-insensitive)
  if (lowerKey.startsWith('intelligence')) {
    return true
  }
  
  return false
}

/**
 * Recursively sanitizes an object by removing forbidden keys
 * 
 * @param {any} obj - The object to sanitize
 * @param {string} path - Current path for logging (default: 'root')
 * @param {array} strippedKeys - Accumulator for stripped keys
 * @returns {any} Sanitized object
 */
function sanitizeRecursive(obj, path = 'root', strippedKeys = []) {
  // Handle null, undefined, primitives
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      sanitizeRecursive(item, `${path}[${index}]`, strippedKeys)
    )
  }
  
  // Handle objects
  const sanitized = {}
  
  for (const [key, value] of Object.entries(obj)) {
    if (isForbiddenKey(key)) {
      // Log the stripped key with its path
      strippedKeys.push(`${path}.${key}`)
      // Skip this key (strip it)
      continue
    }
    
    // Recursively sanitize nested objects
    sanitized[key] = sanitizeRecursive(value, `${path}.${key}`, strippedKeys)
  }
  
  return sanitized
}

/**
 * Sanitizes a discovery response payload by stripping forbidden keys
 * Logs a warning if any keys were stripped
 * 
 * @param {object} payload - The response payload to sanitize
 * @returns {object} Sanitized payload
 */
export function sanitizeDiscoveryResponse(payload) {
  const strippedKeys = []
  const sanitized = sanitizeRecursive(payload, 'response', strippedKeys)
  
  if (strippedKeys.length > 0) {
    console.warn(
      `⚠️  DRIFT DETECTED: Stripped ${strippedKeys.length} forbidden key(s) from discovery response:`,
      strippedKeys.join(', ')
    )
  }
  
  return sanitized
}

/**
 * Exports for testing
 */
export const _internal = {
  isForbiddenKey,
  sanitizeRecursive,
  FORBIDDEN_KEYS
}
