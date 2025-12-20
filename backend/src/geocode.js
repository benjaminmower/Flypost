/**
 * Geocoding Helper
 * Converts address strings to latitude/longitude coordinates
 * Supports Google Maps and Nominatim providers
 */

import dotenv from 'dotenv'

dotenv.config()

// Configuration from environment
const GEOCODER_PROVIDER = process.env.GEOCODER_PROVIDER || 'nominatim'
const GEOCODER_API_KEY = process.env.GEOCODER_API_KEY || ''
const GEOCODER_CACHE_TTL_SECONDS = parseInt(process.env.GEOCODER_CACHE_TTL_SECONDS || '86400', 10)

// In-memory cache: { address: { latitude, longitude, timestamp } }
const geocodeCache = new Map()

/**
 * Clean expired entries from cache
 */
function cleanCache() {
  const now = Date.now()
  const ttlMs = GEOCODER_CACHE_TTL_SECONDS * 1000
  
  for (const [address, entry] of geocodeCache.entries()) {
    if (now - entry.timestamp > ttlMs) {
      geocodeCache.delete(address)
    }
  }
}

/**
 * Geocode an address using Google Maps API
 * @param {string} address - Address string to geocode
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
async function geocodeWithGoogle(address) {
  if (!GEOCODER_API_KEY) {
    console.warn('⚠️  Google Maps API key not configured')
    return null
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('address', address)
    url.searchParams.set('key', GEOCODER_API_KEY)

    const response = await fetch(url.toString())
    const data = await response.json()

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location
      return {
        latitude: location.lat,
        longitude: location.lng
      }
    }

    console.warn(`⚠️  Google Maps geocoding failed: ${data.status}`)
    return null
  } catch (error) {
    console.error('❌ Google Maps geocoding error:', error.message)
    return null
  }
}

/**
 * Geocode an address using Nominatim (OpenStreetMap)
 * @param {string} address - Address string to geocode
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
async function geocodeWithNominatim(address) {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', address)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')

    // Polite delay to respect Nominatim usage policy (max 1 request per second)
    await new Promise(resolve => setTimeout(resolve, 1000))

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Flypost/4.0 (https://goflypost.com)'
      }
    })
    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      }
    }

    console.warn('⚠️  Nominatim geocoding returned no results')
    return null
  } catch (error) {
    console.error('❌ Nominatim geocoding error:', error.message)
    return null
  }
}

/**
 * Geocode an address string to latitude/longitude coordinates
 * Uses configured provider and caches results
 * 
 * @param {string} addressString - Full address string to geocode
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export async function geocodeAddress(addressString) {
  if (!addressString || typeof addressString !== 'string') {
    return null
  }

  const normalizedAddress = addressString.trim().toLowerCase()
  if (!normalizedAddress) {
    return null
  }

  // Check cache first
  cleanCache()
  const cached = geocodeCache.get(normalizedAddress)
  if (cached) {
    console.log(`🗺️  Geocode cache hit for: ${addressString.substring(0, 50)}...`)
    return { latitude: cached.latitude, longitude: cached.longitude }
  }

  console.log(`🗺️  Geocoding address with ${GEOCODER_PROVIDER}: ${addressString.substring(0, 50)}...`)

  let result = null
  if (GEOCODER_PROVIDER === 'google') {
    result = await geocodeWithGoogle(addressString)
  } else if (GEOCODER_PROVIDER === 'nominatim') {
    result = await geocodeWithNominatim(addressString)
  } else {
    console.warn(`⚠️  Unknown geocoder provider: ${GEOCODER_PROVIDER}`)
    return null
  }

  // Cache successful results
  if (result) {
    geocodeCache.set(normalizedAddress, {
      latitude: result.latitude,
      longitude: result.longitude,
      timestamp: Date.now()
    })
    console.log(`✅ Geocoded to: ${result.latitude}, ${result.longitude}`)
  }

  return result
}

/**
 * Get cache statistics (for debugging/monitoring)
 * @returns {{ size: number, ttl: number }}
 */
export function getCacheStats() {
  cleanCache()
  return {
    size: geocodeCache.size,
    ttl: GEOCODER_CACHE_TTL_SECONDS
  }
}
