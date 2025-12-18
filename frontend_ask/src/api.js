/**
 * Flypost Ask - API Service
 * Anonymous chat interface for querying events
 */

// API configuration from environment variables
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.goflypost.com'

/**
 * Send a chat message to the AI (anonymous, no auth required)
 * @param {string} message - User's question/query
 * @param {object|null} location - Optional location object with {lat, lng}
 * @returns {Promise<object>}
 */
export async function sendChatMessage(message, location = null) {
  const requestBody = { message }
  
  // Include lat/lng only if location is available
  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    requestBody.lat = location.lat
    requestBody.lng = location.lng
  }

  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || `API request failed: ${response.status}`)
  }

  return result
}
