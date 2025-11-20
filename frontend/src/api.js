/*
 * Flypost v4 Frontend - API Service v2
 * Wrapper functions for backend endpoints
 */

// Backend configuration (Vite-style env var with fallback)
const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://proxyv4-a7jlfl42zq-uw.a.run.app'

/**
 * Parse and publish an event (authenticated write)
 * @param {string} naturalLanguageInput
 * @param {object} userContext
 * @param {string|null} idToken
 * @returns {Promise<object>}
 */
export async function parseAndPublishEvent(
  naturalLanguageInput,
  userContext = {},
  idToken = null
) {
  const headers = { 'Content-Type': 'application/json' }

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`
  }

  const response = await fetch(`${API_BASE}/api/parse-and-publish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      naturalLanguageInput,
      userContext
    })
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || `API request failed: ${response.status}`)
  }

  return result
}

/**
 * Get events near a location (or all events in MVP)
 */
export async function getEventsNear(lat = null, lng = null, radius = 10) {
  const params = new URLSearchParams()
  if (lat !== null) params.append('lat', lat)
  if (lng !== null) params.append('lng', lng)
  if (radius !== null) params.append('radius', radius)

  const url = `${API_BASE}/v1/events/near${params.toString() ? '?' + params : ''}`

  const response = await fetch(url)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || `API request failed: ${response.status}`)
  }

  return result
}

/**
 * Check backend health
 */
export async function getHealth() {
  const response = await fetch(`${API_BASE}/api/health`)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`)
  }

  return result
}

/**
 * Get storage statistics
 */
export async function getStats() {
  const response = await fetch(`${API_BASE}/api/stats`)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.status}`)
  }

  return result
}
