/**
 * Flypost Ask - Main Application Logic
 * Anonymous chat interface for querying events
 */

import { sendChatMessage } from './api.js'

// DOM elements
const chatForm = document.getElementById('chat-form')
const chatInput = document.getElementById('chat-input')
const chatButton = document.getElementById('chat-button')
const chatResponse = document.getElementById('chat-response')
const responseText = document.getElementById('response-text')

// Location state
let userLocation = null
let locationRequested = false

// Constants
const LOCATION_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds

// Initialize app
function init() {
  console.log('🚀 Flypost Ask - Chat Interface Starting...')
  
  if (chatForm) {
    chatForm.addEventListener('submit', handleChatSubmit)
  }
}

// Request geolocation permission
async function requestLocation() {
  if (locationRequested) {
    return // Only request once
  }
  locationRequested = true

  if (!('geolocation' in navigator)) {
    console.log('ℹ️ Geolocation not supported')
    return
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: LOCATION_CACHE_DURATION
      })
    })
    
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    }
    console.log('✅ Location obtained:', userLocation)
  } catch (error) {
    console.log('ℹ️ Location not available:', error.message)
    // Don't set userLocation - will proceed without coords
  }
}

// Handle chat form submission
async function handleChatSubmit(e) {
  e.preventDefault()

  const message = chatInput?.value.trim()
  if (!message) {
    showResponse('Please enter a question.', 'error')
    return
  }

  // Request location on first submission
  if (!locationRequested) {
    await requestLocation()
  }

  // Disable input during processing
  if (chatButton) {
    chatButton.disabled = true
    chatButton.textContent = 'Thinking...'
  }
  if (chatInput) {
    chatInput.disabled = true
  }

  showResponse('🤔 Asking Flypost AI...', 'info')

  try {
    const result = await sendChatMessage(message, userLocation)
    console.log('✅ Chat response:', result)

    // Display the response
    const responseContent = result.response || result.message || JSON.stringify(result, null, 2)
    showResponse(responseContent, 'success')

    // Show hint if location wasn't available
    if (!userLocation && !/zip/i.test(responseContent)) {
      showResponse(responseContent + '\n\n💡 Tip: For better results, include a ZIP code like 90254.', 'success')
    }

    // Clear input
    if (chatInput) chatInput.value = ''
  } catch (error) {
    console.error('❌ Chat error:', error)
    showResponse(`Error: ${error.message}`, 'error')
  } finally {
    // Re-enable input
    if (chatButton) {
      chatButton.disabled = false
      chatButton.textContent = 'Ask AI'
    }
    if (chatInput) {
      chatInput.disabled = false
      chatInput.focus()
    }
  }
}

// Show response message
function showResponse(message, type = 'info') {
  if (!chatResponse || !responseText) return

  responseText.textContent = message
  chatResponse.className = `response ${type}`
  chatResponse.classList.remove('hidden')
}

// Start app
init()
