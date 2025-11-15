/*
 * Flypost v4 Frontend - API Service
 * Wrapper functions for backend endpoints
 */

// Backend configuration
const API_BASE = import.meta.env.VITE_API_BASE || 'https://flypostv4-a7jlfl42zq-uw.a.run.app'

/**
 * Parse and publish an event
 * @param {string} naturalLanguageInput - The event description
 * @param {object} userContext - Optional user context
 * @returns {Promise<object>} - API response
 */
export async function parseAndPublishEvent(naturalLanguageInput, userContext = {}) {
  const response = await fetch(`${API_BASE}/api/parse-and-publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude  
 * @param {number} radius - Search radius
 * @returns {Promise<object>} - API response with events
 */
export async function getEventsNear(lat = null, lng = null, radius = 10) {
  const params = new URLSearchParams()
  if (lat !== null) params.append('lat', lat)
  if (lng !== null) params.append('lng', lng)
  if (radius !== null) params.append('radius', radius)
  
  const url = `${API_BASE}/api/v1/events/near${params.toString() ? '?' + params.toString() : ''}`
  
  const response = await fetch(url)
  const result = await response.json()
  
  if (!response.ok) {
    throw new Error(result.error || `API request failed: ${response.status}`)
  }
  
  return result
}

/**
 * Get the event schema
 * @returns {Promise<object>} - The JSON schema
 */
export async function getSchema() {
  const response = await fetch(`${API_BASE}/api/schema`)
  const result = await response.json()
  
  if (!response.ok) {
    throw new Error(`Failed to fetch schema: ${response.status}`)
  }
  
  return result
}

/**
 * Check backend health
 * @returns {Promise<object>} - Health status
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
 * @returns {Promise<object>} - Storage stats
 */
export async function getStats() {
  const response = await fetch(`${API_BASE}/api/stats`)
  const result = await response.json()
  
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.status}`)
  }
  
  return result
}
