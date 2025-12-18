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

// Initialize app
function init() {
  console.log('🚀 Flypost Ask - Chat Interface Starting...')
  
  if (chatForm) {
    chatForm.addEventListener('submit', handleChatSubmit)
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
    const result = await sendChatMessage(message)
    console.log('✅ Chat response:', result)

    // Display the response
    const responseContent = result.response || result.message || JSON.stringify(result, null, 2)
    showResponse(responseContent, 'success')

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
