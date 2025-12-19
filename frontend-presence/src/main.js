/**
 * Flypost Presence - Main Application Logic
 * Check-in and feedback interface for open houses
 */

import { checkIn, submitFeedback } from './api.js'

// Constants
const CHECK_IN_CACHE_DURATION = 2 * 60 * 60 * 1000 // 2 hours in milliseconds

// State
let currentAttendanceId = null
let feedbackUrl = null

// DOM elements (will be initialized after DOM loads)
let viewCheckIn, viewSuccess, viewFeedback
let btnCheckIn, statusMsg, feedbackText, smsLink

/**
 * Get or generate buyer token
 */
function getBuyerToken() {
  let token = localStorage.getItem('buyerToken')
  if (!token) {
    // Generate a simple ULID-like token
    token = 'ulid_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
    localStorage.setItem('buyerToken', token)
  }
  return token
}

/**
 * Get cached check-in data
 */
function getCachedCheckIn() {
  const cached = localStorage.getItem('recentCheckIn')
  if (!cached) return null

  const data = JSON.parse(cached)
  const now = Date.now()
  
  // Check if cache is still valid (within 2 hours)
  if (now - data.timestamp < CHECK_IN_CACHE_DURATION) {
    return data
  }
  
  // Cache expired, remove it
  localStorage.removeItem('recentCheckIn')
  return null
}

/**
 * Cache check-in data
 */
function cacheCheckIn(attendanceId, feedbackLink) {
  const data = {
    attendanceId,
    feedbackUrl: feedbackLink,
    timestamp: Date.now()
  }
  localStorage.setItem('recentCheckIn', JSON.stringify(data))
}

/**
 * Show a specific view
 */
function showView(viewName) {
  viewCheckIn.classList.add('hidden')
  viewSuccess.classList.add('hidden')
  viewFeedback.classList.add('hidden')

  if (viewName === 'check-in') {
    viewCheckIn.classList.remove('hidden')
  } else if (viewName === 'success') {
    viewSuccess.classList.remove('hidden')
  } else if (viewName === 'feedback') {
    viewFeedback.classList.remove('hidden')
  }
}

/**
 * Handle check-in button click
 */
async function handleCheckIn() {
  statusMsg.innerText = 'Requesting location...'
  btnCheckIn.disabled = true
  btnCheckIn.style.opacity = '0.5'

  // Request geolocation
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        statusMsg.innerText = 'Checking in...'
        
        const buyerToken = getBuyerToken()
        const response = await checkIn(
          position.coords.latitude,
          position.coords.longitude,
          buyerToken,
          'geo_time'
        )

        if (response.success && response.attendance) {
          const { attendanceId } = response.attendance
          
          // Generate feedback URL
          feedbackUrl = `https://presence.goflypost.com/f/${attendanceId}`
          currentAttendanceId = attendanceId
          
          // Cache the check-in
          cacheCheckIn(attendanceId, feedbackUrl)
          
          // Update SMS link
          const smsBody = encodeURIComponent(`Here is your Flypost feedback link: ${feedbackUrl}`)
          smsLink.href = `sms:&body=${smsBody}`
          
          // Show success view
          showView('success')
        } else {
          statusMsg.innerText = 'Check-in failed. Try again.'
          btnCheckIn.disabled = false
          btnCheckIn.style.opacity = '1'
        }
      } catch (error) {
        console.error('Check-in error:', error)
        statusMsg.innerText = error.message || 'API Error. Please refresh.'
        btnCheckIn.disabled = false
        btnCheckIn.style.opacity = '1'
      }
    },
    (error) => {
      console.error('Geolocation error:', error)
      statusMsg.innerText = 'Location access required.'
      btnCheckIn.disabled = false
      btnCheckIn.style.opacity = '1'
    }
  )
}

/**
 * Copy feedback link to clipboard
 */
function copyFeedbackLink() {
  if (feedbackUrl) {
    navigator.clipboard.writeText(feedbackUrl).then(
      () => {
        alert('Link copied to clipboard!')
      },
      (err) => {
        console.error('Failed to copy:', err)
        alert('Failed to copy link')
      }
    )
  }
}

/**
 * Open feedback form in same page
 */
function openFeedbackForm() {
  if (currentAttendanceId) {
    window.location.href = `/f/${currentAttendanceId}`
  }
}

/**
 * Handle feedback submission
 */
async function handleFeedbackSubmit() {
  const liked = document.getElementById('feedback-liked')?.value || ''
  const disliked = document.getElementById('feedback-disliked')?.value || ''
  const wantsSimilar = document.getElementById('feedback-wants-similar')?.checked || false

  if (!currentAttendanceId) {
    alert('No attendance ID found. Please check in first.')
    return
  }

  try {
    const response = await submitFeedback(currentAttendanceId, {
      liked,
      disliked,
      wantsSimilar
    })

    if (response.success) {
      alert('Feedback sent! Thank you.')
      // Redirect to ask site
      window.location.href = 'https://ask.goflypost.com'
    } else {
      alert('Failed to submit feedback. Please try again.')
    }
  } catch (error) {
    console.error('Feedback submission error:', error)
    alert(error.message || 'Failed to submit feedback')
  }
}

/**
 * Handle routing on page load
 */
function handleRouting() {
  const path = window.location.pathname
  
  // Check for feedback route: /f/:attendanceId
  const feedbackMatch = path.match(/^\/f\/([^/]+)$/)
  
  if (feedbackMatch) {
    const attendanceId = feedbackMatch[1]
    currentAttendanceId = attendanceId
    showView('feedback')
    return
  }

  // Check for cached check-in
  const cached = getCachedCheckIn()
  if (cached) {
    currentAttendanceId = cached.attendanceId
    feedbackUrl = cached.feedbackUrl
    
    // Update SMS link
    const smsBody = encodeURIComponent(`Here is your Flypost feedback link: ${feedbackUrl}`)
    smsLink.href = `sms:&body=${smsBody}`
    
    showView('success')
  } else {
    showView('check-in')
  }
}

/**
 * Initialize the application
 */
function init() {
  console.log('🚀 Flypost Presence - Starting...')

  // Get DOM elements
  viewCheckIn = document.getElementById('view-checkin')
  viewSuccess = document.getElementById('view-success')
  viewFeedback = document.getElementById('view-feedback')
  btnCheckIn = document.getElementById('btn-checkin')
  statusMsg = document.getElementById('status-msg')
  feedbackText = document.getElementById('feedback-text')
  smsLink = document.getElementById('sms-link')

  // Set up event listeners
  if (btnCheckIn) {
    btnCheckIn.addEventListener('click', handleCheckIn)
  }

  const copyBtn = document.getElementById('btn-copy-link')
  if (copyBtn) {
    copyBtn.addEventListener('click', copyFeedbackLink)
  }

  const feedbackFormBtn = document.getElementById('btn-open-feedback')
  if (feedbackFormBtn) {
    feedbackFormBtn.addEventListener('click', openFeedbackForm)
  }

  const submitFeedbackBtn = document.getElementById('btn-submit-feedback')
  if (submitFeedbackBtn) {
    submitFeedbackBtn.addEventListener('click', handleFeedbackSubmit)
  }

  // Handle routing
  handleRouting()
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
