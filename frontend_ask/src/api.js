/**
 * Flypost Ask - API Service
 * Anonymous chat interface for querying events
 */

// API configuration from environment variables
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.goflypost.com'

/**
 * Send a chat message to the AI (anonymous, no auth required)
 * @param {string} message - User's question/query
 * @returns {Promise<object>}
 */
export async function sendChatMessage(message) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || `API request failed: ${response.status}`)
  }

  return result
}
