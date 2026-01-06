/**
 * Flypost Presence - Main Application Logic
 * Check-in and feedback interface for open houses
 */
import { checkIn, submitFeedback } from './api.js'

const CHECK_IN_CACHE_DURATION = 2 * 60 * 60 * 1000
let currentAttendanceId = null
let feedbackUrl = null

// DOM elements
let viewCheckIn, viewSuccess, viewFeedback
let btnCheckIn, statusMsg, smsLink
let buyYes, buyMaybe, buyNo, wouldBuyInput
let similarYes, similarNo, wantsSimilarInput

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
  [viewCheckIn, viewSuccess, viewFeedback].forEach(v => v?.classList.add('hidden'))
  if (viewName === 'check-in') viewCheckIn.classList.remove('hidden')
  else if (viewName === 'success') viewSuccess.classList.remove('hidden')
  else if (viewName === 'feedback') viewFeedback.classList.remove('hidden')
}

async function handleCheckIn() {
  statusMsg.innerText = 'Requesting location...'
  btnCheckIn.disabled = true
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      statusMsg.innerText = 'Checking in...'
      const response = await checkIn(pos.coords.latitude, pos.coords.longitude, getBuyerToken())
      if (response.success && response.attendance) {
        currentAttendanceId = response.attendance.attendanceId
        feedbackUrl = `https://presence.goflypost.com/f/${currentAttendanceId}`
        smsLink.href = `sms:&body=${encodeURIComponent('Feedback link: ' + feedbackUrl)}`
        showView('success')
      }
    } catch (e) { statusMsg.innerText = e.message; btnCheckIn.disabled = false; }
  }, () => { statusMsg.innerText = 'Location required.'; btnCheckIn.disabled = false; })
}

async function handleFeedbackSubmit() {
  const liked = document.getElementById('feedback-liked')?.value || ''
  const disliked = document.getElementById('feedback-disliked')?.value || ''
  const wouldBuy = wouldBuyInput?.value || null
  const wantsSimilar = wantsSimilarInput?.value === "true" ? true : 
                       wantsSimilarInput?.value === "false" ? false : null

  if (!currentAttendanceId) return showNotification('Check in first', 'error')

  try {
    const btn = document.getElementById('btn-submit-feedback')
    btn.disabled = true; btn.textContent = 'Sending...'
    const res = await submitFeedback(currentAttendanceId, { 
      liked, 
      disliked, 
      wantsSimilar,
      wouldBuy
    })
    if (res.success) {
      showNotification('Thank you!', 'success')
      setTimeout(() => window.location.href = 'https://ask.goflypost.com', 1500)
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
  btnCheckIn = document.getElementById('btn-checkin')
  statusMsg = document.getElementById('status-msg')
  smsLink = document.getElementById('sms-link')
  
  // wouldBuy elements (3-way)
  buyYes = document.getElementById('buy-yes')
  buyMaybe = document.getElementById('buy-maybe')
  buyNo = document.getElementById('buy-no')
  wouldBuyInput = document.getElementById('feedback-wouldBuy')
  
  // wantsSimilar elements (2-way)
  similarYes = document.getElementById('similar-yes')
  similarNo = document.getElementById('similar-no')
  wantsSimilarInput = document.getElementById('feedback-wantsSimilar')

  btnCheckIn?.addEventListener('click', handleCheckIn)
  document.getElementById('btn-copy-link')?.addEventListener('click', () => {
    navigator.clipboard.writeText(feedbackUrl); showNotification('Copied!', 'success')
  })
  document.getElementById('btn-open-feedback')?.addEventListener('click', () => showView('feedback'))
  document.getElementById('btn-submit-feedback')?.addEventListener('click', handleFeedbackSubmit)

  // wouldBuy emoji toggle logic (3-way)
  buyYes?.addEventListener('click', () => {
    if (wouldBuyInput) wouldBuyInput.value = "yes"
    buyYes.classList.add('thumb-active')
    buyMaybe.classList.remove('thumb-active')
    buyNo.classList.remove('thumb-active')
  })
  buyMaybe?.addEventListener('click', () => {
    if (wouldBuyInput) wouldBuyInput.value = "maybe"
    buyYes.classList.remove('thumb-active')
    buyMaybe.classList.add('thumb-active')
    buyNo.classList.remove('thumb-active')
  })
  buyNo?.addEventListener('click', () => {
    if (wouldBuyInput) wouldBuyInput.value = "no"
    buyYes.classList.remove('thumb-active')
    buyMaybe.classList.remove('thumb-active')
    buyNo.classList.add('thumb-active')
  })
  
  // wantsSimilar emoji toggle logic (2-way)
  similarYes?.addEventListener('click', () => {
    if (wantsSimilarInput) wantsSimilarInput.value = "true"
    similarYes.classList.add('thumb-active')
    similarNo.classList.remove('thumb-active')
  })
  similarNo?.addEventListener('click', () => {
    if (wantsSimilarInput) wantsSimilarInput.value = "false"
    similarYes.classList.remove('thumb-active')
    similarNo.classList.add('thumb-active')
  })

  const feedbackMatch = window.location.pathname.match(/^\/f\/([^/]+)$/)
  if (feedbackMatch) { currentAttendanceId = feedbackMatch[1]; showView('feedback') }
  else { showView('check-in') }
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init()
