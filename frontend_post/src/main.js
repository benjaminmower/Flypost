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
    const shareUrl = result.data?.event?.shareUrl
    
    showStatus(`✅ Success! Event "${event?.name || 'Untitled'}" published with ID: ${eventId}`, 'success')
    showResult(JSON.stringify(result, null, 2))
    
    // Display share URL if available
    if (shareUrl) {
      displayShareUrl(shareUrl)
    }

      /**
       * Display share URL with copy button (improved styling)
       */
      function displayShareUrl(url) {
        // Remove any existing share URL display
        const existing = document.getElementById('share-url-container')
        if (existing) {
          existing.remove()
        }

        // Create share URL container with glassmorphic styling
        const container = document.createElement('div')
        container.id = 'share-url-container'
        container.className = 'glass-card mt-4'
        container.style.padding = '24px'
        container.style.borderRadius = '24px'
        container.style.border = '1px solid rgba(64, 201, 162, 0.2)'
        
        container.innerHTML = `
          <h3 style="
            color: #40c9a2;
            font-size: 16px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 16px;
          ">
            📋 Share this event
          </h3>
          <div style="
            display: flex;
            flex-direction: column;
            gap: 12px;
          " class="share-input-wrapper">
            <input 
              type="text" 
              id="share-url-input"
              value="${escapeHtml(url)}" 
              readonly 
              style="
                background: rgba(6, 8, 16, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #f7f7f7;
                font-family: monospace;
                font-size: 14px;
                padding: 12px 16px;
                border-radius: 12px;
                outline: none;
                transition: border-color 0.2s;
              "
              onfocus="this.style.borderColor='rgba(64, 201, 162, 0.5)'"
              onblur="this.style.borderColor='rgba(255, 255, 255, 0.1)'"
            />
            <button 
              id="copy-share-url-btn"
              style="
                background: #40c9a2;
                color: #060810;
                font-weight: 700;
                font-size: 14px;
                padding: 12px 24px;
                border-radius: 12px;
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(64, 201, 162, 0.3);
                transition: all 0.2s;
              "
              onmouseover="this.style.background='#f7f7f7'"
              onmouseout="if(!this.dataset.copied){this.style.background='#40c9a2'}"
              onmousedown="this.style.transform='scale(0.98)'"
              onmouseup="this.style.transform='scale(1)'"
            >
              Copy Link
            </button>
          </div>
          <div 
            id="copy-feedback" 
            style="
              color: #40c9a2;
              font-size: 14px;
              font-weight: 600;
              margin-top: 12px;
              min-height: 24px;
              opacity: 0;
              transition: opacity 0.3s;
            "
          ></div>
        `
        
        // Apply responsive styles using media query (only if not already added)
        if (!document.getElementById('share-url-responsive-styles')) {
          const style = document.createElement('style')
          style.id = 'share-url-responsive-styles'
          style.textContent = `
            @media (min-width: 768px) {
              #share-url-container {
                padding: 32px !important;
                border-radius: 32px !important;
              }
              #share-url-container h3 {
                font-size: 18px !important;
              }
              #share-url-container .share-input-wrapper {
                flex-direction: row !important;
              }
              #share-url-container input {
                font-size: 16px !important;
              }
              #share-url-container button {
                font-size: 16px !important;
                white-space: nowrap;
              }
            }
          `
          document.head.appendChild(style)
        }
        
        // Insert after publish status
        const publishStatus = document.getElementById('publish-status')
        if (publishStatus && publishStatus.parentNode) {
          publishStatus.parentNode.insertBefore(container, publishStatus.nextSibling)
        }
        
        // Add event listener for copy button
        const copyBtn = document.getElementById('copy-share-url-btn')
        const copyFeedback = document.getElementById('copy-feedback')
        
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(url)
              
              // Show feedback with animation
              if (copyFeedback) {
                copyFeedback.textContent = '✓ Copied to clipboard!'
                copyFeedback.style.opacity = '1'
                
                // Fade out after 2 seconds
                setTimeout(() => {
                  copyFeedback.style.opacity = '0'
                }, 2000)
              }
              
              // Visual button feedback
              copyBtn.textContent = '✓ Copied!'
              copyBtn.style.background = '#f7f7f7'
              copyBtn.dataset.copied = 'true'
              
              setTimeout(() => {
                copyBtn.textContent = 'Copy Link'
                copyBtn.style.background = '#40c9a2'
                delete copyBtn.dataset.copied
              }, 2000)
            } catch (err) {
              console.error('Failed to copy:', err)
              if (copyFeedback) {
                copyFeedback.textContent = '✗ Failed to copy'
                copyFeedback.style.color = '#d82e7e' // hot_berry
                copyFeedback.style.opacity = '1'
                
                setTimeout(() => {
                  copyFeedback.style.opacity = '0'
                  copyFeedback.style.color = '#40c9a2' // mint_leaf
                }, 2000)
              }
            }
          })
        }
      }
  } catch (e) {
    console.error('❌ Publish failed:', e)
    
    const errorMsg = e.message || 'Unknown error'
    
    // Best-effort error hints (UX layer only, not a backend contract)
    if (errorMsg.toLowerCase().includes('geo') || errorMsg.toLowerCase().includes('address') || errorMsg.toLowerCase().includes('location')) {
      showStatus(`❌ Couldn't find that address. Please include: street number, street name, city, state, and zip code.`, 'error')
    } else if (errorMsg.toLowerCase().includes('date') || errorMsg.toLowerCase().includes('time')) {
      showStatus(`❌ Please include complete date/time info: "Sunday, Feb 1st, 2026 from 1:00 PM to 4:00 PM"`, 'error')
    } else if (errorMsg.toLowerCase().includes('required')) {
      showStatus(`❌ Please make sure to include: property address, date, start time, and end time.`, 'error')
    } else {
      // Generic fallback for any other error
      showStatus(`❌ ${errorMsg}`, 'error')
    }
    
    // Re-enable button
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

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Display share URL with copy button
 */
function displayShareUrl(url) {
  // Remove any existing share URL display
  const existing = document.getElementById('share-url-container')
  if (existing) {
    existing.remove()
  }

  // Create share URL container
  const container = document.createElement('div')
  container.id = 'share-url-container'
  container.className = 'glass-card'
  container.style.marginTop = '20px'
  
  container.innerHTML = `
    <div style="padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Share this event</h3>
      <div style="display: flex; gap: 8px; align-items: center;">
        <input 
          type="text" 
          id="share-url-input"
          value="${escapeHtml(url)}" 
          readonly 
          style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 14px;"
        />
        <button 
          id="copy-share-url-btn"
          class="bg-mint_leaf"
          style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; white-space: nowrap;"
        >
          Copy
        </button>
      </div>
      <div id="copy-feedback" style="margin-top: 8px; color: #28a745; font-size: 14px; min-height: 20px;"></div>
    </div>
  `
  
  // Insert after publish status
  const publishStatus = document.getElementById('publish-status')
  if (publishStatus && publishStatus.parentNode) {
    publishStatus.parentNode.insertBefore(container, publishStatus.nextSibling)
  }
  
  // Add event listener for copy button (NO inline onclick)
  const copyBtn = document.getElementById('copy-share-url-btn')
  const copyFeedback = document.getElementById('copy-feedback')
  
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url)
        
        // Show feedback
        if (copyFeedback) {
          copyFeedback.textContent = '✓ Copied!'
          
          // Clear feedback after 2 seconds
          setTimeout(() => {
            copyFeedback.textContent = ''
          }, 2000)
        }
      } catch (err) {
        console.error('Failed to copy:', err)
        if (copyFeedback) {
          copyFeedback.textContent = 'Failed to copy'
          copyFeedback.style.color = '#dc3545'
          
          setTimeout(() => {
            copyFeedback.textContent = ''
            copyFeedback.style.color = '#28a745'
          }, 2000)
        }
      }
    })
  }
}

// Start app
init()
