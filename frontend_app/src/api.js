const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.goflypost.com'

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  const result = contentType.includes('application/json')
    ? await response.json()
    : { success: false, error: await response.text() }

  if (!response.ok) {
    const error = new Error(result.error || result.message || `API request failed: ${response.status}`)
    error.details = result.details
    error.response = result
    throw error
  }

  return result
}

export async function getEventsNear({ lat, lng, radiusMi = 10, categories = [], start = new Date() }) {
  const params = new URLSearchParams()
  if (lat != null) params.set('lat', String(lat))
  if (lng != null) params.set('lng', String(lng))
  if (radiusMi != null) params.set('radius_mi', String(radiusMi))
  if (start) params.set('start', start instanceof Date ? start.toISOString() : String(start))
  if (categories.length) params.set('category', categories.join(','))

  const response = await fetch(`${API_BASE}/v1/events/near?${params}`)
  return parseResponse(response)
}

export async function getEventById(eventId) {
  const response = await fetch(`${API_BASE}/v1/events/${encodeURIComponent(eventId)}`)
  return parseResponse(response)
}

export async function parseAndPublishEvent({ naturalLanguageInput, userContext, idToken }) {
  const response = await fetch(`${API_BASE}/api/parse-and-publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ naturalLanguageInput, userContext })
  })

  return parseResponse(response)
}

export async function getMyFlyers(email) {
  const response = await fetch(`${API_BASE}/v1/agents/${encodeURIComponent(email)}/events`)
  return parseResponse(response)
}
