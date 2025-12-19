/**
 * Flypost Presence - API Module
 * Handles communication with the backend API
 */

const API_BASE_URL = 'https://api.goflypost.com'

/**
 * Check in to an event
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} buyerToken - Buyer token from localStorage
 * @param {string} method - Check-in method (default: 'geo_time')
 * @returns {Promise<object>} - Check-in response
 */
export async function checkIn(lat, lng, buyerToken, method = 'geo_time') {
  const response = await fetch(`${API_BASE_URL}/v1/presence/check-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      lat,
      lng,
      buyerToken,
      method
    })
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Check-in failed')
  }

  return response.json()
}

/**
 * Submit feedback for an attendance
 * @param {string} attendanceId - Attendance ID
 * @param {object} answers - Feedback answers { liked, disliked, wantsSimilar }
 * @returns {Promise<object>} - Feedback response
 */
export async function submitFeedback(attendanceId, answers) {
  const response = await fetch(`${API_BASE_URL}/v1/feedback/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      attendanceId,
      answers: {
        liked: answers.liked || '',
        disliked: answers.disliked || '',
        wantsSimilar: Boolean(answers.wantsSimilar)
      }
    })
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Feedback submission failed')
  }

  return response.json()
}
