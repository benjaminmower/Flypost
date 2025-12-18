/**
 * Flypost Ask - Main Application Logic
 * Anonymous chat interface for querying events
 */

import { sendChatMessageStream } from './api.js'
import { marked } from 'marked'

// Configure marked to disable raw HTML for security
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false
})
// Disable HTML rendering for XSS protection
marked.use({
  renderer: {
    html: () => ''
  }
})

// DOM elements
const chatForm = document.getElementById('chat-form')
const chatInput = document.getElementById('chat-input')
const chatButton = document.getElementById('chat-button')
const chatTranscript = document.getElementById('chat-transcript')

// State
let userLocation = null
let locationRequested = false
let conversationHistory = [] // In-memory history: [{role, content}]
let isStreaming = false

// Constants
const LOCATION_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds
const MAX_HISTORY_LENGTH = 10 // Trim to last 10 messages

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
    addSystemMessage('💡 Tip: Include your ZIP code or city for location-based results.')
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
    addSystemMessage('💡 Tip: Include your ZIP code or city for location-based results.')
  }
}

// Handle chat form submission
async function handleChatSubmit(e) {
  e.preventDefault()

  if (isStreaming) {
    return // Prevent multiple submissions while streaming
  }

  const message = chatInput?.value.trim()
  if (!message) {
    addErrorMessage('Please enter a question.')
    return
  }

  // Request location on first submission
  if (!locationRequested) {
    await requestLocation()
  }

  // Add user message to transcript
  addUserMessage(message)
  
  // Clear input and disable form
  if (chatInput) chatInput.value = ''
  setFormDisabled(true)
  isStreaming = true

  // Create assistant message bubble for streaming
  const assistantBubble = createMessageBubble('assistant')
  let assistantContent = ''

  try {
    // Trim history to last 10 messages before sending
    const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_LENGTH)

    await sendChatMessageStream(
      message,
      userLocation,
      trimmedHistory,
      // onToken
      (token) => {
        assistantContent += token
        assistantBubble.innerHTML = marked.parse(assistantContent)
        scrollToBottom()
      },
      // onError
      (error) => {
        console.error('❌ Streaming error:', error)
        if (assistantContent.length === 0) {
          // No content yet, show error in the bubble
          assistantBubble.textContent = `Error: ${error.message}`
          assistantBubble.classList.add('error')
          assistantBubble.classList.remove('assistant')
        } else {
          // Had partial content, add error as separate message
          addErrorMessage(`Error: ${error.message}`)
        }
      },
      // onDone
      () => {
        console.log('✅ Streaming completed')
        
        // Add to conversation history
        conversationHistory.push({ role: 'user', content: message })
        conversationHistory.push({ role: 'assistant', content: assistantContent })
        
        // Re-enable form
        isStreaming = false
        setFormDisabled(false)
        if (chatInput) chatInput.focus()
      }
    )
  } catch (error) {
    console.error('❌ Chat error:', error)
    addErrorMessage(`Error: ${error.message}`)
    isStreaming = false
    setFormDisabled(false)
    if (chatInput) chatInput.focus()
  }
}

// Add user message to transcript
function addUserMessage(content) {
  const bubble = createMessageBubble('user')
  bubble.textContent = content
  scrollToBottom()
}

// Add system message to transcript
function addSystemMessage(content) {
  const bubble = createMessageBubble('system')
  bubble.textContent = content
  scrollToBottom()
}

// Add error message to transcript
function addErrorMessage(content) {
  const bubble = createMessageBubble('error')
  bubble.textContent = content
  scrollToBottom()
}

// Create a message bubble and append to transcript
function createMessageBubble(type) {
  if (!chatTranscript) return null
  
  const bubble = document.createElement('div')
  bubble.className = `message ${type}`
  chatTranscript.appendChild(bubble)
  return bubble
}

// Scroll transcript to bottom
function scrollToBottom() {
  if (!chatTranscript) return
  chatTranscript.scrollTop = chatTranscript.scrollHeight
}

// Enable/disable form during streaming
function setFormDisabled(disabled) {
  if (chatInput) chatInput.disabled = disabled
  if (chatButton) {
    chatButton.disabled = disabled
    chatButton.textContent = disabled ? 'Thinking...' : 'Ask AI'
  }
}

// Start app
init()
