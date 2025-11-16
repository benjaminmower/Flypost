/*
 * Flypost v4 - Hash Utility
 * Computes cryptographic hashes for event data integrity and DLT anchoring
 */

import crypto from 'crypto'

/**
 * Compute SHA-256 hash of an event object
 * 
 * The canonical representation is created by:
 * 1. Taking the event object after validation and Flypost enrichment (eventId, submissionTimestamp)
 * 2. Excluding the hash field itself (if present)
 * 3. Converting to JSON string with stable field ordering (JavaScript objects maintain insertion order in ES2015+)
 * 4. Hashing the UTF-8 bytes of this JSON string
 * 
 * canonicalVersion: 1 indicates this specific canonicalization approach
 * Future versions may use different serialization strategies for compatibility with DLT anchoring
 * 
 * @param {object} event - The event object to hash (without the hash field)
 * @returns {object} - Hash object with algorithm, encoding, value, and canonicalVersion
 */
export function computeEventHash(event) {
  // Create a copy without the hash field to avoid circular references
  const { hash, _firestoreMetadata, id, storedAt, ...eventToHash } = event

  // Create canonical JSON representation
  // Note: JSON.stringify in modern JavaScript (ES2015+) preserves object property order
  // This is sufficient for v4's canonical version 1
  // For production DLT anchoring, consider using a deterministic JSON library like json-stable-stringify
  const canonicalJson = JSON.stringify(eventToHash)

  // Compute SHA-256 hash
  const hashBuffer = crypto.createHash('sha256')
    .update(canonicalJson, 'utf8')
    .digest()

  // Convert to hex string
  const hashValue = hashBuffer.toString('hex')

  return {
    algorithm: 'SHA-256',
    encoding: 'hex',
    value: hashValue,
    canonicalVersion: 1
  }
}

/**
 * Verify a hash against an event
 * @param {object} event - The event object (may include hash field)
 * @param {object} expectedHash - The hash object to verify against
 * @returns {boolean} - True if hash matches
 */
export function verifyEventHash(event, expectedHash) {
  const computedHash = computeEventHash(event)
  return computedHash.value === expectedHash.value &&
         computedHash.algorithm === expectedHash.algorithm &&
         computedHash.encoding === expectedHash.encoding &&
         computedHash.canonicalVersion === expectedHash.canonicalVersion
}
