/* v1
 * Timezone Utility for Flypost v4
 * 
 * Provides offline timezone inference from geo coordinates with caching.
 * No network calls, no paid APIs - uses geo-tz for offline IANA timezone lookup.
 */

import { find } from 'geo-tz'

// In-memory cache for timezone lookups
// Key format: "lat,lng" (rounded to 3 decimals)
const timezoneCache = new Map()

/**
 * Round coordinate to 3 decimal places (~111m precision)
 * This provides adequate precision for city-level timezone inference
 * while maximizing cache hit rate
 */
function roundCoordinate(coord) {
  return Math.round(coord * 1000) / 1000
}

/**
 * Generate cache key from coordinates
 */
function getCacheKey(latitude, longitude) {
  const lat = roundCoordinate(latitude)
  const lng = roundCoordinate(longitude)
  return `${lat},${lng}`
}

/**
 * Infer IANA timezone from geographic coordinates
 * Uses offline geo-tz library with in-memory caching
 * 
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @returns {string|null} IANA timezone string (e.g., "America/Los_Angeles") or null if inference fails
 */
export function inferTimezoneFromCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.error('❌ Invalid coordinates for timezone inference')
    return null
  }

  // Check cache first
  const cacheKey = getCacheKey(latitude, longitude)
  if (timezoneCache.has(cacheKey)) {
    const cached = timezoneCache.get(cacheKey)
    console.log(`🗺️  Timezone cache hit for ${cacheKey}: ${cached}`)
    return cached
  }

  try {
    // Use geo-tz to find timezone (offline lookup)
    const timezones = find(latitude, longitude)
    
    if (!timezones || timezones.length === 0) {
      console.error(`❌ No timezone found for coordinates: ${latitude}, ${longitude}`)
      timezoneCache.set(cacheKey, null)
      return null
    }

    // Use first timezone result (most specific)
    const timezone = timezones[0]
    console.log(`✅ Inferred timezone for ${cacheKey}: ${timezone}`)
    
    // Cache the result
    timezoneCache.set(cacheKey, timezone)
    
    return timezone
  } catch (error) {
    console.error(`❌ Error inferring timezone for ${latitude}, ${longitude}:`, error.message)
    timezoneCache.set(cacheKey, null)
    return null
  }
}

/**
 * Detect if raw input text contains explicit timezone markers
 * Returns true if text contains:
 * - ISO timezone (Z, +HH:MM, -HH:MM)
 * - Named timezone markers (PT, PST, PDT, ET, EST, EDT, CT, CST, CDT, MT, MST, MDT, etc.)
 * 
 * @param {string} text - Raw input text to analyze
 * @returns {boolean} True if explicit timezone markers are present
 */
export function hasExplicitTimezone(text) {
  if (typeof text !== 'string') {
    return false
  }

  // Check for ISO timezone markers (Z or offset)
  // Look for patterns like: "2025-01-15T10:00:00Z" or "2025-01-15T10:00:00+08:00"
  const isoTimezonePattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{3})?([Z]|[+-]\d{2}:\d{2})/i
  if (isoTimezonePattern.test(text)) {
    return true
  }

  // Check for named timezone abbreviations (common US/international markers)
  // Word boundary ensures we match whole tokens (e.g., not "PT" in "ACCEPT")
  const namedTimezonePattern = /\b(PT|PST|PDT|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|AT|AST|ADT|HST|AKST|AKDT|GMT|UTC|BST|CET|CEST|JST|IST)\b/i
  if (namedTimezonePattern.test(text)) {
    return true
  }

  return false
}

/**
 * Clear the timezone cache (useful for testing)
 */
export function clearTimezoneCache() {
  timezoneCache.clear()
  console.log('🗑️  Timezone cache cleared')
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getTimezoneCache() {
  return {
    size: timezoneCache.size,
    entries: Array.from(timezoneCache.entries())
  }
}
