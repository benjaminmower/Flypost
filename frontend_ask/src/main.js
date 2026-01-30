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

/**
 * Enhance property markdown with visual cards, badges, and animations
 * Detects property sections (### 🏠 headers) and transforms them
 */

// Distance thresholds (in miles)
const DISTANCE_CLOSE_THRESHOLD = 0.5
const DISTANCE_MEDIUM_THRESHOLD = 1.5

// Price thresholds (in dollars)
const PRICE_LOW_THRESHOLD = 1000000
const PRICE_MID_THRESHOLD = 2000000

// Animation stagger delay (in milliseconds)
const STAGGER_DELAY_MS = 120

function enhancePropertyCards(html) {
  // Track property card count for stagger animation
  let propertyCardIndex = 0
  
  // Split content by property headers (### 🏠)
  const propertyPattern = /(<h3[^>]*>\s*🏠[^<]*<\/h3>)/g
  const parts = html.split(propertyPattern)
  
  let result = ''
  let inPropertyCard = false
  let currentCard = ''
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    
    // Check if this is a property header
    if (part.match(/^<h3[^>]*>\s*🏠/)) {
      // If we were building a card, close it
      if (inPropertyCard && currentCard) {
        result += wrapPropertyCard(currentCard, propertyCardIndex)
        propertyCardIndex++
        currentCard = ''
      }
      // Start new card
      inPropertyCard = true
      currentCard = part
    } else if (inPropertyCard) {
      // Check if we hit a separator (hr tag) or another heading
      if (part.includes('<hr>') || part.match(/<h[1-6][^>]*>/)) {
        // End of this property card
        const beforeSeparator = part.split(/<hr>|<h[1-6][^>]*>/)[0]
        currentCard += beforeSeparator
        result += wrapPropertyCard(currentCard, propertyCardIndex)
        propertyCardIndex++
        
        // Add the separator/heading and remaining content
        result += part.substring(beforeSeparator.length)
        inPropertyCard = false
        currentCard = ''
      } else {
        // Continue building current card
        currentCard += part
      }
    } else {
      // Not in a property card, add as-is
      result += part
    }
  }
  
  // Close any remaining open card
  if (inPropertyCard && currentCard) {
    result += wrapPropertyCard(currentCard, propertyCardIndex)
  }
  
  return result
}

/**
 * Wrap property content in a card div with enhancements
 */
function wrapPropertyCard(content, index) {
  // Add icons and badges to the content
  let enhanced = content
  
  // Transform distance with color-coded badge
  enhanced = enhanced.replace(
    /(<strong>Distance<\/strong>:\s*)([0-9.]+)\s*miles?/gi,
    (match, prefix, distance) => {
      const dist = parseFloat(distance)
      let badgeClass = 'distance-far'
      let badgeLabel = 'Far'
      
      if (dist < DISTANCE_CLOSE_THRESHOLD) {
        badgeClass = 'distance-close'
        badgeLabel = 'Very Close'
      } else if (dist <= DISTANCE_MEDIUM_THRESHOLD) {
        badgeClass = 'distance-medium'
        badgeLabel = 'Nearby'
      }
      
      return `${prefix}<span class="property-detail"><span class="property-detail-icon">📍</span>${distance} mi</span><span class="distance-badge ${badgeClass}">${badgeLabel}</span>`
    }
  )
  
  // Transform price with color-coded badge (only when M/Million/K/Thousand is present)
  enhanced = enhanced.replace(
    /\$([0-9,]+(?:\.[0-9]{2})?)\s*(M|Million|K|Thousand)/gi,
    (match) => {
      // Extract numeric value
      const numMatch = match.match(/\$([0-9,]+(?:\.[0-9]{2})?)/)
      if (!numMatch) return match
      
      const value = parseFloat(numMatch[1].replace(/,/g, ''))
      let priceValue = value
      
      // Check if it's in millions or thousands
      if (match.match(/M|Million/i)) {
        priceValue = value * 1000000
      } else if (match.match(/K|Thousand/i)) {
        priceValue = value * 1000
      }
      
      // Determine badge class and label
      let badgeClass = 'price-high'
      let badgeLabel = 'Premium'
      
      if (priceValue < PRICE_LOW_THRESHOLD) {
        badgeClass = 'price-low'
        badgeLabel = 'Affordable'
      } else if (priceValue <= PRICE_MID_THRESHOLD) {
        badgeClass = 'price-mid'
        badgeLabel = 'Mid-Range'
      }
      
      return `<span class="property-detail"><span class="property-detail-icon">💰</span>${match}</span><span class="price-badge ${badgeClass}">${badgeLabel}</span>`
    }
  )
  
  // Add bed icon
  enhanced = enhanced.replace(
    /([0-9]+)\s*bed(?:room)?s?/gi,
    '<span class="property-detail"><span class="property-detail-icon">🛏️</span>$1 bed</span>'
  )
  
  // Add bath icon
  enhanced = enhanced.replace(
    /([0-9.]+)\s*bath(?:room)?s?/gi,
    '<span class="property-detail"><span class="property-detail-icon">🚿</span>$1 bath</span>'
  )
  
  // Add sqft icon
  enhanced = enhanced.replace(
    /([0-9,]+)\s*sq\.?\s*ft\.?/gi,
    '<span class="property-detail"><span class="property-detail-icon">📐</span>$1 sqft</span>'
  )
  
  // Add time/when icon
  enhanced = enhanced.replace(
    /(<strong>When<\/strong>:)/gi,
    '<strong><span class="property-detail-icon">⏰</span>When</strong>:'
  )
  
  // Add address icon
  enhanced = enhanced.replace(
    /(<strong>Address<\/strong>:)/gi,
    '<strong><span class="property-detail-icon">📍</span>Address</strong>:'
  )
  
  // Stagger animation delay between cards
  const animationDelay = index * STAGGER_DELAY_MS
  
  return `<div class="property-card" style="animation-delay: ${animationDelay}ms;">${enhanced}</div>`
}

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
        const renderedHtml = marked.parse(assistantContent)
        const enhancedHtml = enhancePropertyCards(renderedHtml)
        assistantBubble.innerHTML = enhancedHtml
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
