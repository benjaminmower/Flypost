/**
 * Flypost Presence - Main Application Logic
 * Check-in and feedback interface for open houses
 */
import { checkIn, submitFeedback } from './api.js'

const CHECK_IN_CACHE_DURATION = 2 * 60 * 60 * 1000
let currentAttendanceId = null
let feedbackUrl = null
let currentEvent = null

// DOM elements
let viewCheckIn, viewSuccess, viewFeedback, viewThankyou
let btnCheckIn, statusMsg
let buyYes, buyMaybe, buyNo, wouldBuyInput

function showNotification(message, type = 'info') {
  const notification = document.createElement('div')
  notification.className = `fixed top-4 right-4 px-6 py-4 rounded-xl font-bold shadow-lg z-50 transition-all ${
    type === 'success' ? 'bg-mint_leaf text-ink_black' : 
    type === 'error' ? 'bg-hot_berry text-bright_snow' : 'bg-lemon_lime text-ink_black'
  }`
  notification.textContent = message
  document.body.appendChild(notification)
  setTimeout(() => {
    notification.style.opacity = '0'
    setTimeout(() => notification.remove(), 300)
  }, 3000)
}

function getBuyerToken() {
  let token = localStorage.getItem('buyerToken')
  if (!token) {
    token = 'ulid_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
    localStorage.setItem('buyerToken', token)
  }
  return token
}

function showView(viewName) {
  [viewCheckIn, viewSuccess, viewFeedback, viewThankyou].forEach(v => v?.classList.add('hidden'))
  if (viewName === 'check-in') viewCheckIn.classList.remove('hidden')
  else if (viewName === 'success') viewSuccess.classList.remove('hidden')
  else if (viewName === 'feedback') viewFeedback.classList.remove('hidden')
  else if (viewName === 'thankyou') viewThankyou.classList.remove('hidden')
}

function updateSuccessScreen(event) {
  const heroImg = document.getElementById('success-hero-image')
  const addressEl = document.getElementById('success-address')

  if (heroImg) {
    if (event?.heroImageUrl) {
      heroImg.src = event.heroImageUrl
      heroImg.classList.remove('hidden')
    } else {
      heroImg.classList.add('hidden')
    }
  }

  if (addressEl) {
    if (event?.address) {
      addressEl.textContent = event.address
      addressEl.classList.remove('hidden')
    } else {
      addressEl.classList.add('hidden')
    }
  }

  setTimeout(() => showView('feedback'), 2000)
}

async function handleCheckIn() {
  statusMsg.innerText = 'Requesting location...'
  btnCheckIn.disabled = true
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      statusMsg.innerText = 'Verifying location...'
      const response = await checkIn(pos.coords.latitude, pos.coords.longitude, getBuyerToken())
      if (response.success && response.attendance) {
        currentAttendanceId = response.attendance.attendanceId
        feedbackUrl = `https://presence.goflypost.com/f/${currentAttendanceId}`
        currentEvent = response.event || null
        showView('success')
        updateSuccessScreen(currentEvent)
      }
    } catch (e) {
      const msg = e.message?.includes('proximity')
        ? "You don't appear to be at the open house. Make sure you're inside the property and try again."
        : e.message
      statusMsg.innerText = msg
      btnCheckIn.disabled = false
    }
  }, () => {
    statusMsg.innerText = 'Location access is required. Tap AA in your address bar → Website Settings → Location → Allow, then try again.'
    btnCheckIn.disabled = false
  })
}

async function handleFeedbackSubmit() {
  const different = document.getElementById('feedback-different')?.value || ''
  const wouldBuy = wouldBuyInput?.value || null

  if (!currentAttendanceId) return showNotification('Verify your location first', 'error')

  try {
    const btn = document.getElementById('btn-submit-feedback')
    btn.disabled = true; btn.textContent = 'Sending...'
    const res = await submitFeedback(currentAttendanceId, {
      different,
      wouldBuy
    })
    if (res.success) {
      showView('thankyou')
    }
  } catch (e) {
      showNotification(e.message, 'error')
      document.getElementById('btn-submit-feedback').disabled = false
  }
}

function init() {
  viewCheckIn = document.getElementById('view-checkin')
  viewSuccess = document.getElementById('view-success')
  viewFeedback = document.getElementById('view-feedback')
  viewThankyou = document.getElementById('view-thankyou')
  btnCheckIn = document.getElementById('btn-checkin')
  statusMsg = document.getElementById('status-msg')
  
  // wouldBuy elements (3-way)
  buyYes = document.getElementById('buy-yes')
  buyMaybe = document.getElementById('buy-maybe')
  buyNo = document.getElementById('buy-no')
  wouldBuyInput = document.getElementById('feedback-wouldBuy')
  
  btnCheckIn?.addEventListener('click', handleCheckIn)
  document.getElementById('btn-submit-feedback')?.addEventListener('click', handleFeedbackSubmit)

  // wouldBuy emoji toggle logic (3-way)
  buyYes?.addEventListener('click', () => {
    if (wouldBuyInput) wouldBuyInput.value = "yes"
    document.getElementById('feedback-question-label').textContent = 'What did you like most?'
    buyYes.classList.add('thumb-active')
    buyMaybe.classList.remove('thumb-active')
    buyNo.classList.remove('thumb-active')
  })
  buyMaybe?.addEventListener('click', () => {
    if (wouldBuyInput) wouldBuyInput.value = "maybe"
    document.getElementById('feedback-question-label').textContent = 'What would make this the one?'
    buyYes.classList.remove('thumb-active')
    buyMaybe.classList.add('thumb-active')
    buyNo.classList.remove('thumb-active')
  })
  buyNo?.addEventListener('click', () => {
    if (wouldBuyInput) wouldBuyInput.value = "no"
    document.getElementById('feedback-question-label').textContent = 'What would it take for you to write an offer?'
    buyYes.classList.remove('thumb-active')
    buyMaybe.classList.remove('thumb-active')
    buyNo.classList.add('thumb-active')
  })
  
  const feedbackMatch = window.location.pathname.match(/^\/f\/([^/]+)$/)
  if (feedbackMatch) { currentAttendanceId = feedbackMatch[1]; showView('feedback') }
  else { showView('check-in') }
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init()
