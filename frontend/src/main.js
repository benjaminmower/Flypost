/*
 * Flypost v4 Frontend - Main Application Logic
 * Under 200 lines - handles parse, publish, and result display
 */

import { parseAndPublishEvent, getEventsNear, getHealth } from './api.js'

// DOM elements
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

// App state
let lastParsedEvent = null

// Initialize app
async function init() {
  console.log('🚀 Flypost v4 Frontend Starting...')
  
  // Check backend health
  try {
    const health = await getHealth()
    showStatus(`✅ Connected to backend (${health.storage.events} events in store)`, 'success')
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

// Setup event handlers
function setupEventListeners() {
  // Form submission
  eventForm.addEventListener('submit', handleFormSubmit)
  
  // Copy button
  copyBtn.addEventListener('click', copyJsonToClipboard)
  
  // Refresh events
  refreshBtn.addEventListener('click', refreshEvents)
  
  // Auto-resize textarea
  eventText.addEventListener('input', autoResizeTextarea)
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault()
  
  const text = eventText.value.trim()
  if (!text) {
    showStatus('❌ Please enter an event description', 'error')
    return
  }
  
  // Show loading state
  parseBtn.disabled = true
  parseBtn.textContent = '🤖 Processing...'
  hideResult()
  showStatus('🤖 Parsing event with AI...', 'info')
  
  try {
    // Parse and publish event
    const result = await parseAndPublishEvent(text)
    
    console.log('✅ Event processed:', result)
    
    // Show success
    lastParsedEvent = result.data.event
    showResult('✅ Event Parsed & Published', result.data.event, 'success')
    showStatus(`✅ Success! Event "${result.data.event.name}" stored with ID: ${result.data.eventId}`, 'success')
    
    // Clear form and refresh events
    eventText.value = ''
    setTimeout(refreshEvents, 1000)
    
  } catch (error) {
    console.error('❌ Parse error:', error)
    showResult('❌ Parse Error', { error: error.message }, 'error')
    showStatus(`❌ Error: ${error.message}`, 'error')
  } finally {
    // Reset button
    parseBtn.disabled = false
    parseBtn.textContent = '🤖 Parse & Publish Event'
  }
}

// Show result panel
function showResult(title, data, type = 'success') {
  resultTitle.textContent = title
  resultContent.textContent = JSON.stringify(data, null, 2)
  resultPanel.className = `result-panel ${type === 'error' ? 'error' : ''}`
  resultPanel.classList.remove('hidden')
}

// Hide result panel
function hideResult() {
  resultPanel.classList.add('hidden')
}

// Copy JSON to clipboard
async function copyJsonToClipboard() {
  try {
    await navigator.clipboard.writeText(resultContent.textContent)
    copyBtn.textContent = '✅ Copied!'
    setTimeout(() => {
      copyBtn.textContent = '📋 Copy JSON'
    }, 2000)
  } catch (error) {
    console.error('Copy failed:', error)
    copyBtn.textContent = '❌ Failed'
    setTimeout(() => {
      copyBtn.textContent = '📋 Copy JSON'
    }, 2000)
  }
}

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message
  statusDiv.className = `status ${type}`
  statusDiv.classList.remove('hidden')
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusDiv.classList.add('hidden')
  }, 5000)
}

// Refresh events list
async function refreshEvents() {
  try {
    refreshBtn.disabled = true
    refreshBtn.textContent = '🔄 Loading...'
    
    const result = await getEventsNear()
    const events = result.data.events
    
    console.log(`📋 Loaded ${events.length} events`)
    
    if (events.length === 0) {
      eventsList.innerHTML = '<p style="color: #666; font-style: italic;">No events yet. Parse your first event above!</p>'
    } else {
      eventsList.innerHTML = events.map(event => `
        <div class="event-item">
          <h4>${escapeHtml(event.name)}</h4>
          <p><strong>Category:</strong> ${escapeHtml(event.flypost.category)}</p>
          <p><strong>Location:</strong> ${escapeHtml(event.location.address.streetAddress)}</p>
          <p><strong>Date:</strong> ${new Date(event.startDate).toLocaleDateString()}</p>
          <p><strong>Organizer:</strong> ${escapeHtml(event.organizer.name)}</p>
          <p style="font-size: 12px; color: #999;"><strong>ID:</strong> ${event.flypost.eventId}</p>
        </div>
      `).join('')
    }
    
  } catch (error) {
    console.error('❌ Failed to refresh events:', error)
    eventsList.innerHTML = `<p style="color: #dc3545;">Failed to load events: ${error.message}</p>`
  } finally {
    refreshBtn.disabled = false
    refreshBtn.textContent = '🔄 Refresh Events'
  }
}

// Auto-resize textarea
function autoResizeTextarea() {
  eventText.style.height = 'auto'
  eventText.style.height = Math.min(eventText.scrollHeight, 300) + 'px'
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Start the app
init()