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

/**
 * Send a chat message with streaming response (SSE)
 * @param {string} message - User's question/query
 * @param {object|null} location - Optional location object with {lat, lng}
 * @param {array} history - Conversation history [{role, content}]
 * @param {function} onToken - Callback for each token received
 * @param {function} onError - Callback for errors
 * @param {function} onDone - Callback when streaming completes
 * @returns {Promise<void>}
 */
export async function sendChatMessageStream(message, location = null, history = [], onToken, onError, onDone) {
  const requestBody = { message, history }
  
  // Include lat/lng only if location is available
  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    requestBody.lat = location.lat
    requestBody.lng = location.lng
  }

  try {
    const response = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `API request failed: ${response.status}`)
    }

    // Parse SSE stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      
      // Process complete SSE messages
      const lines = buffer.split('\n')
      buffer = lines.pop() // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6) // Remove 'data: ' prefix
          
          try {
            const event = JSON.parse(data)
            
            if (event.type === 'token') {
              onToken(event.content)
            } else if (event.type === 'done') {
              onDone()
            } else if (event.type === 'error') {
              onError(new Error(event.message || 'Streaming error'))
            }
          } catch (e) {
            console.error('Failed to parse SSE message:', data, e)
          }
        }
      }
    }
  } catch (error) {
    onError(error)
  }
}
