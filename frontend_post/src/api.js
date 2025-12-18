/**
 * Flypost Post - API Service
 * Authenticated publishing interface
 */

// API configuration from environment variables
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.goflypost.com'

/**
 * Parse and publish an event (requires Firebase ID token)
 * @param {string} naturalLanguageInput - Event description
 * @param {object} userContext - Additional context
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<object>}
 */
export async function parseAndPublishEvent(naturalLanguageInput, userContext = {}, idToken) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`
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
