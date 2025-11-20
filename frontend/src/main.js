// *v3
// * Flypost v4 Frontend - Main Application Logic

import { parseAndPublishEvent, getEventsNear, getHealth } from './api.js'
import {
  startEmailLinkSignIn,
  completeEmailLinkSignIn,
  subscribeToAuth,
  auth
} from './firebase.js'

// DOM elements (existing)
const eventForm = document.getElementById('event-form')
const eventText = document.getElementById('event-text')
const parseBtn = document.getElementById('parse-btn')
const resultPanel = document.getElementById('result-panel')
const resultTitle = document.getElementById('result-title')
const resultContent = document.getElementById('result-content')
const copyBtn = document.getElementById('copy-btn')
const statusDiv = document.getElementById('status')
const eventsList = document.getElementById('events-list')
const refreshBtn = document.getElementById('refresh-events')

// New auth elements
const authEmailInput = document.getElementById('auth-email')
const sendLinkBtn = document.getElementById('send-link-btn')
const signOutBtn = document.getElementById('signout-btn')
const authStatusDiv = document.getElementById('auth-status')

// App state
let lastParsedEvent = null
let currentUser = null

// Initialize app
async function init() {
  console.log('🚀 Flypost v4 Frontend Starting...')

  // Attempt to complete email link sign-in if on finish route
  await maybeCompleteEmailLinkSignIn()

  // Subscribe to auth changes
  subscribeToAuth(user => {
    currentUser = user
    updateAuthUI()
  })

  // Check backend health
  try {
    const health = await getHealth()
    showStatus(
      `✅ Connected to backend (${health.storage?.events ?? 'unknown'} events in store)`,
      'success'
    )
    console.log('Backend health:', health)
  } catch (error) {
    showStatus(`❌ Backend connection failed: ${error.message}`, 'error')
    console.error('Backend health check failed:', error)
  }

  // Load existing events
  refreshEvents()

  // Setup event listeners
  setupEventListeners()
}

// Complete email link sign-in if URL matches pattern
async function maybeCompleteEmailLinkSignIn() {
  if (window.location.pathname === '/finishSignIn') {
    if (!authStatusDiv) return

    authStatusDiv.textContent = 'Completing sign-in...'
    try {
      const user = await completeEmailLinkSignIn()
      if (user) {
        authStatusDiv.textContent = `Signed in as ${user.email}. Redirecting...`
        setTimeout(() => {
          window.location.href = '/'
        }, 1200)
      } else {
        authStatusDiv.textContent = 'Link invalid or already used.'
      }
    } catch (e) {
      authStatusDiv.textContent = 'Sign-in failed: ' + (e?.message || 'Unknown error')
    }
  }
}

// Setup event handlers
function setupEventListeners() {
  // Form submission
  if (eventForm) {
    eventForm.addEventListener('submit', handleFormSubmit)
  }

  // Copy button
  if (copyBtn) {
    copyBtn.addEventListener('click', copyJsonToClipboard)
  }

  // Refresh events
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshEvents)
  }

  // Auto-resize textarea
  if (eventText) {
    eventText.addEventListener('input', autoResizeTextarea)
  }

  // Auth send link
  if (sendLinkBtn) {
    sendLinkBtn.addEventListener('click', async () => {
      const email = (authEmailInput?.value || '').trim()
      if (!email) {
        if (authStatusDiv) {
          authStatusDiv.textContent = 'Enter an email first.'
        }
        return
      }
      sendLinkBtn.disabled = true
      if (authStatusDiv) authStatusDiv.textContent = 'Sending magic link...'
      try {
        await startEmailLinkSignIn(email)
        if (authStatusDiv) authStatusDiv.textContent = 'Link sent. Check your inbox.'
      } catch (e) {
        if (authStatusDiv) {
          authStatusDiv.textContent = 'Failed: ' + (e?.message || 'Unknown error')
        }
      } finally {
        sendLinkBtn.disabled = false
      }
    })
  }

  // Sign out
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      if (!auth.currentUser) return
      await auth.signOut()
      if (authStatusDiv) authStatusDiv.textContent = 'Signed out.'
    })
  }
}

// Update auth UI based on currentUser
function updateAuthUI() {
  if (!authStatusDiv || !sendLinkBtn || !signOutBtn || !authEmailInput) return

  if (currentUser) {
    signOutBtn.style.display = 'inline-block'
    sendLinkBtn.style.display = 'none'
    authEmailInput.style.display = 'none'
    authStatusDiv.textContent = `Signed in as ${currentUser.email}`
  } else {
    signOutBtn.style.display = 'none'
    sendLinkBtn.style.display = 'inline-block'
    authEmailInput.style.display = 'inline-block'
    authStatusDiv.textContent = 'Not signed in. Sign up to Flypost to post events.'
  }
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault()

  const text = eventText?.value.trim()
  if (!text) {
    showStatus('❌ Please enter an event description', 'error')
    return
  }

  // Do not allow anonymous posting
  if (!currentUser) {
    showStatus('⚠️ Please sign up / sign in before posting an event.', 'error')
    if (authEmailInput) authEmailInput.focus()
    return
  }

  if (parseBtn) {
    parseBtn.disabled = true
    parseBtn.textContent = '🤖 Processing...'
  }
  hideResult()
  showStatus('🤖 Parsing event with AI...', 'info')

  try {
    const idToken = await currentUser.getIdToken()
    const result = await parseAndPublishEvent(text, {}, idToken)
    console.log('✅ Event processed:', result)

    lastParsedEvent = result.data.event
    showResult('✅ Event Parsed & Published', result.data.event, 'success')
    showStatus(
      `✅ Success! Event "${result.data.event.name}" stored with ID: ${result.data.eventId}`,
      'success'
    )

    if (eventText) eventText.value = ''
    setTimeout(refreshEvents, 1000)
  } catch (error) {
    console.error('❌ Parse error:', error)
    showResult('❌ Parse Error', { error: error.message }, 'error')
    showStatus(`❌ Error: ${error.message}`, 'error')
  } finally {
    if (parseBtn) {
      parseBtn.disabled = false
      parseBtn.textContent = '🤖 Parse & Publish Event'
    }
  }
}

// Show result panel
function showResult(title, data, type = 'success') {
  if (!resultPanel || !resultTitle || !resultContent) return

  resultTitle.textContent = title
  resultContent.textContent = JSON.stringify(data, null, 2)
  resultPanel.className = `result-panel ${type === 'error' ? 'error' : ''}`
  resultPanel.classList.remove('hidden')
}

// Hide result panel
function hideResult() {
  if (!resultPanel || !resultContent) return
  resultPanel.classList.add('hidden')
  resultContent.textContent = ''
}

// Status message
function showStatus(message, type = 'info') {
  if (!statusDiv) return
  statusDiv.textContent = message
  statusDiv.className = `status ${type}`
  statusDiv.classList.remove('hidden')
}

// Copy JSON
function copyJsonToClipboard() {
  if (!resultContent) return
  const text = resultContent.textContent
  if (!text) return
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showStatus('📋 Copied JSON to clipboard', 'success')
    })
    .catch(err => {
      showStatus('❌ Copy failed', 'error')
      console.error('Clipboard error:', err)
    })
}

// Refresh events
async function refreshEvents() {
  if (!eventsList) return

  eventsList.innerHTML =
    '<p style="color:#666;font-style:italic;">Loading events...</p>'
  try {
    const data = await getEventsNear()
    const events = data?.data?.events || []
    if (!events.length) {
      eventsList.innerHTML =
        '<p style="color:#666;font-style:italic;">No events yet. Parse your first event above!</p>'
      return
    }
    eventsList.innerHTML = events
      .map(ev => {
        return `<div class="event-item">
          <h4>${escapeHtml(ev.name || '(no name)')}</h4>
          <p>${escapeHtml(ev.description || '')}</p>
          <p style="font-size:12px;color:#999;">ID: ${escapeHtml(
            ev.flypost?.eventId || ''
          )}</p>
        </div>`
      })
      .join('')
  } catch (e) {
    eventsList.innerHTML = `<p style="color:#c00;">Failed to load events: ${escapeHtml(
      e.message || 'error'
    )}</p>`
  }
}

// Auto-resize textarea
function autoResizeTextarea() {
  if (!eventText) return
  eventText.style.height = 'auto'
  eventText.style.height = eventText.scrollHeight + 2 + 'px'
}

// Escape HTML utility
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Start app
init()
