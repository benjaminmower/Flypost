/*
 * Flypost v4 - North Star Enforcement
 * Strips Layer 2 (Intelligence) fields from events during ingestion
 * 
 * Layer 1 (Discovery): Event data - what/where/when
 * Layer 2 (Intelligence): Post-visit data - attendance, feedback, sentiment
 * 
 * This enforces the architectural separation: intelligence data is collected
 * separately via presence/feedback endpoints, not embedded in event objects.
 */

/**
 * List of forbidden keys that should not be stored via the ingestion endpoint.
 * These are Layer 2 (Intelligence) fields that should only be collected post-visit.
 */
const FORBIDDEN_KEYS = [
  'attendance',
  'attendees',
  'buyerToken',
  'presenceProof',
  'feedback',
  'sentiment',
  'insights',
  'brokerageAffiliation'
]

/**
 * Check if a key is forbidden (Layer 2 intelligence field or starts with "intelligence").
 * Case-insensitive matching to catch variations like "Attendance", "FEEDBACK", etc.
 * @param {string} key - The key to check
 * @returns {boolean} - True if the key is forbidden
 */
function isForbiddenKey(key) {
  if (typeof key !== 'string') {
    return false
  }
  
  const lowerKey = key.toLowerCase()
  
  // Check exact matches (case-insensitive)
  for (const forbiddenKey of FORBIDDEN_KEYS) {
    if (lowerKey === forbiddenKey.toLowerCase()) {
      return true
    }
  }
  
  // Check for keys starting with "intelligence" (case-insensitive)
  if (lowerKey.startsWith('intelligence')) {
    return true
  }
  
  return false
}

/**
 * Recursively strip forbidden keys from an object.
 * @param {object} obj - The object to sanitize
 * @param {string} path - Current path in object (for logging)
 * @returns {object} - Sanitized object with forbidden keys removed
 */
function stripForbiddenKeysRecursive(obj, path = '') {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      stripForbiddenKeysRecursive(item, `${path}[${index}]`)
    )
  }
  
  // Handle objects
  const sanitized = {}
  const strippedKeys = []
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key
    
    if (isForbiddenKey(key)) {
      strippedKeys.push(currentPath)
      continue
    }
    
    // Recursively sanitize nested objects/arrays
    sanitized[key] = stripForbiddenKeysRecursive(value, currentPath)
  }
  
  // Log stripped keys if any
  if (strippedKeys.length > 0) {
    console.log(`🛡️  North Star: Stripped forbidden keys: ${strippedKeys.join(', ')}`)
  }
  
  return sanitized
}

/**
 * Sanitize an event object by removing Layer 2 intelligence fields.
 * This enforces the North Star architecture: events are Layer 1 (discovery),
 * intelligence is Layer 2 (collected separately post-visit).
 * 
 * @param {object} event - The event object to sanitize
 * @returns {object} - Sanitized event with forbidden keys removed
 */
export function sanitizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return event
  }
  
  console.log('🛡️  North Star: Enforcing Layer 1/Layer 2 separation...')
  return stripForbiddenKeysRecursive(event)
}

/**
 * Get the list of forbidden keys for documentation/reference.
 * @returns {string[]} - Array of forbidden key names
 */
export function getForbiddenKeys() {
  return [...FORBIDDEN_KEYS, 'intelligence*']
}
