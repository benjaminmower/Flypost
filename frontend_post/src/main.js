/**
 * Flypost Post - Main Application Logic
 * Authenticated publishing with Firebase Email Link
 */

import { parseAndPublishEvent } from './api.js'
import {
  startEmailLinkSignIn,
  completeEmailLinkSignIn,
  subscribeToAuth,
  auth
} from './firebase.js'

// DOM elements - Auth
const authSection = document.getElementById('auth-section')
const authEmailInput = document.getElementById('auth-email')
const sendLinkBtn = document.getElementById('send-link-btn')
const authStatus = document.getElementById('auth-status')
const signOutBtn = document.getElementById('signout-btn')

// DOM elements - Publishing
const publishSection = document.getElementById('publish-section')
const eventForm = document.getElementById('event-form')
const eventInput = document.getElementById('event-input')
const publishBtn = document.getElementById('publish-btn')
const publishStatus = document.getElementById('publish-status')
const publishResult = document.getElementById('publish-result')

// App state
let currentUser = null

// Initialize app
async function init() {
  console.log('🚀 Flypost Post - Publisher Interface Starting...')

  // Attempt to complete email link sign-in if on finish route
  await maybeCompleteEmailLinkSignIn()

  // Subscribe to auth changes
  subscribeToAuth(user => {
    currentUser = user
    updateAuthUI()
  })

  // Setup event listeners
  setupEventListeners()
}

// Complete email link sign-in if URL matches pattern
async function maybeCompleteEmailLinkSignIn() {
  if (window.location.pathname === '/finishSignIn') {
    if (authStatus) authStatus.textContent = 'Completing sign-in...'
    
    try {
      const user = await completeEmailLinkSignIn()
      if (user) {
        if (authStatus) authStatus.textContent = `Signed in as ${user.email}. Redirecting...`
        setTimeout(() => {
          window.location.href = '/'
        }, 1200)
      } else {
        if (authStatus) authStatus.textContent = 'Link invalid or already used.'
      }
    } catch (e) {
      if (authStatus) authStatus.textContent = 'Sign-in failed: ' + (e?.message || 'Unknown error')
    }
  }
}

// Setup event handlers
function setupEventListeners() {
  // Auth send link
  if (sendLinkBtn) {
    sendLinkBtn.addEventListener('click', async () => {
      const email = authEmailInput?.value.trim()
      if (!email) {
        if (authStatus) authStatus.textContent = 'Enter an email first.'
        return
      }
      
      sendLinkBtn.disabled = true
      if (authStatus) authStatus.textContent = 'Sending magic link...'
      
      try {
        await startEmailLinkSignIn(email)
        if (authStatus) authStatus.textContent = 'Magic link sent! Check your inbox.'
      } catch (e) {
        if (authStatus) authStatus.textContent = 'Failed: ' + (e?.message || 'Unknown error')
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
      if (authStatus) authStatus.textContent = 'Signed out.'
    })
  }

  // Event form submission
  if (eventForm) {
    eventForm.addEventListener('submit', handleEventSubmit)
  }
}

// Update UI based on auth state
function updateAuthUI() {
  if (currentUser) {
    // User is signed in
    if (authSection) authSection.classList.add('hidden')
    if (publishSection) publishSection.classList.remove('hidden')
    if (authStatus) authStatus.textContent = `Signed in as ${currentUser.email}`
  } else {
    // User is signed out
    if (authSection) authSection.classList.remove('hidden')
    if (publishSection) publishSection.classList.add('hidden')
    if (authStatus) authStatus.textContent = 'Not signed in.'
  }
}

// Handle event form submission
async function handleEventSubmit(e) {
  e.preventDefault()

  const eventText = eventInput?.value.trim()
  if (!eventText) {
    showStatus('Please enter an event description.', 'error')
    return
  }

  if (!currentUser) {
    showStatus('Please sign in first.', 'error')
    return
  }

  if (publishBtn) {
    publishBtn.disabled = true
    publishBtn.textContent = 'Publishing...'
  }

  showStatus('🤖 Processing event with AI...', 'info')
  hideResult()

  try {
    const idToken = await currentUser.getIdToken()
    const result = await parseAndPublishEvent(eventText, {}, idToken)
    console.log('✅ Event published:', result)

    const event = result.data?.event
    const eventId = result.data?.eventId
    
    showStatus(`✅ Success! Event "${event?.name || 'Untitled'}" published with ID: ${eventId}`, 'success')
    showResult(JSON.stringify(result, null, 2))

    // Clear input
    if (eventInput) eventInput.value = ''
  } catch (error) {
    console.error('❌ Publish error:', error)
    showStatus(`❌ Error: ${error.message}`, 'error')
  } finally {
    if (publishBtn) {
      publishBtn.disabled = false
      publishBtn.textContent = 'Publish Event'
    }
  }
}

// Show status message
function showStatus(message, type = 'info') {
  if (!publishStatus) return
  publishStatus.textContent = message
  publishStatus.className = `status ${type}`
  publishStatus.classList.remove('hidden')
}

// Show result
function showResult(jsonText) {
  if (!publishResult) return
  publishResult.textContent = jsonText
  publishResult.classList.remove('hidden')
}

// Hide result
function hideResult() {
  if (!publishResult) return
  publishResult.classList.add('hidden')
  publishResult.textContent = ''
}

// Start app
init()
