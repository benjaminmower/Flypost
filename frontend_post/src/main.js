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

// DOM elements - Developer Access
const developerSection = document.getElementById('developer-section')
const generateTokenBtn = document.getElementById('generate-token-btn')
const tokenOutput = document.getElementById('token-output')
const writeTokenInput = document.getElementById('write-token-input')
const copyTokenBtn = document.getElementById('copy-token-btn')
const tokenStatus = document.getElementById('token-status')

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

  // Generate write token
  if (generateTokenBtn) {
    generateTokenBtn.addEventListener('click', handleGenerateToken)
  }

  // Copy token
  if (copyTokenBtn) {
    copyTokenBtn.addEventListener('click', async () => {
      const token = writeTokenInput?.value
      if (!token) return
      try {
        await navigator.clipboard.writeText(token)
        copyTokenBtn.textContent = '✓ Copied!'
        setTimeout(() => { copyTokenBtn.textContent = 'Copy Token' }, 2000)
      } catch {
        if (tokenStatus) tokenStatus.textContent = 'Failed to copy.'
      }
    })
  }
}

// Update UI based on auth state
function updateAuthUI() {
  if (currentUser) {
    // User is signed in
    if (authSection) authSection.classList.add('hidden')
    if (publishSection) publishSection.classList.remove('hidden')
    if (developerSection) developerSection.classList.remove('hidden')
    if (authStatus) authStatus.textContent = `Signed in as ${currentUser.email}`
    loadListings(currentUser)
  } else {
    // User is signed out
    if (authSection) authSection.classList.remove('hidden')
    if (publishSection) publishSection.classList.add('hidden')
    if (developerSection) developerSection.classList.add('hidden')
    if (authStatus) authStatus.textContent = 'Not signed in.'
  }
}

// Generate or retrieve a write token for the current user
async function handleGenerateToken() {
  if (!currentUser) return

  if (generateTokenBtn) {
    generateTokenBtn.disabled = true
    generateTokenBtn.textContent = 'Generating...'
  }
  if (tokenStatus) tokenStatus.textContent = ''

  try {
    const idToken = await currentUser.getIdToken()
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.goflypost.com'
    const response = await fetch(`${API_BASE}/v1/tokens/generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` }
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Request failed: ${response.status}`)

    if (writeTokenInput) writeTokenInput.value = result.token
    if (tokenOutput) tokenOutput.classList.remove('hidden')
    if (tokenStatus) tokenStatus.textContent = 'Token ready. Keep this secret.'
  } catch (e) {
    if (tokenStatus) tokenStatus.textContent = 'Error: ' + (e.message || 'Unknown error')
  } finally {
    if (generateTokenBtn) {
      generateTokenBtn.disabled = false
      generateTokenBtn.textContent = 'Generate Write Token'
    }
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

    // Reset button and clear textarea
    if (publishBtn) {
      publishBtn.disabled = false
      publishBtn.textContent = 'Publish Event'
    }
    if (eventInput) eventInput.value = ''

    // Add "Post Another" button below result
    const existingPostAnother = document.getElementById('post-another-btn')
    if (existingPostAnother) existingPostAnother.remove()
    const postAnotherBtn = document.createElement('button')
    postAnotherBtn.id = 'post-another-btn'
    postAnotherBtn.textContent = 'Post Another'
    postAnotherBtn.style.cssText = 'margin-top:16px;width:100%;background:transparent;border:1px solid rgba(255,255,255,0.15);color:#f7f7f7;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;cursor:pointer;'
    postAnotherBtn.addEventListener('click', resetForm)
    if (publishResult && publishResult.parentNode) {
      publishResult.parentNode.insertBefore(postAnotherBtn, publishResult.nextSibling)
    }

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

// Reset form to initial state
function resetForm() {
  if (eventInput) eventInput.value = ''
  hideResult()
  if (publishStatus) {
    publishStatus.textContent = ''
    publishStatus.classList.add('hidden')
  }
  document.getElementById('share-url-container')?.remove()
  document.getElementById('post-another-btn')?.remove()
  if (publishBtn) {
    publishBtn.disabled = false
    publishBtn.textContent = 'Publish Event'
  }
}

// ─── Agent Listings Dashboard ───────────────────────────────────────────────

async function loadListings(user) {
  const section = document.getElementById('listings-section')
  if (section) {
    section.innerHTML = `
      <details class="faq-details mb-6 glass-card rounded-2xl border-mint_leaf/10 overflow-hidden">
        <summary class="cursor-pointer p-5 md:p-6 font-bold text-base md:text-lg text-mint_leaf hover:text-bright_snow transition-colors flex justify-between items-center">
          <span>YOUR LISTINGS (...)</span>
        </summary>
        <div class="px-5 md:px-6 pb-5 md:pb-6 pt-2">
          <div class="glass-card rounded-2xl animate-pulse" style="height:82px;"></div>
        </div>
      </details>
    `
  }
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.goflypost.com'
    const data = await fetch(`${API_BASE}/v1/agents/${encodeURIComponent(user.email)}/events`)
      .then(r => r.json())
    const events = data.events
    if (!events?.length) return

    const stats = await Promise.all(
      events.map(ev =>
        fetch(`${API_BASE}/v1/events/${ev.flypost.eventId}/stats`)
          .then(r => r.json())
          .catch(() => ({ attendanceCount: 0, feedbackCount: 0 }))
      )
    )

    renderListings(events, stats)
    scheduleStatsRefresh(events)
  } catch (err) {
    console.warn('[Flypost] loadListings error:', err)
  }
}

function getEventStatus(event) {
  const now = Date.now()
  const occurrences = event.occurrences?.length ? event.occurrences : null

  if (occurrences) {
    for (const occ of occurrences) {
      const start = new Date(occ.startDate).getTime()
      const end = new Date(occ.endDate).getTime()
      if (now >= start && now <= end) return 'live'
    }
    const anyUpcoming = occurrences.some(occ => new Date(occ.startDate).getTime() > now)
    if (anyUpcoming) return 'upcoming'
    return 'ended'
  }

  const start = new Date(event.startDate).getTime()
  const end = new Date(event.endDate).getTime()
  if (now >= start && now <= end) return 'live'
  if (start > now) return 'upcoming'
  return 'ended'
}

function formatAddress(event) {
  const loc = event.location?.address
  if (!loc) return event.location?.name || ''
  const { streetAddress, addressLocality, addressRegion, postalCode } = loc
  return [streetAddress, addressLocality, addressRegion, postalCode]
    .filter(Boolean)
    .join(', ')
    .replace(/, ([A-Z]{2}), /, ', $1 ')
}

function formatOccurrenceWindow(event) {
  const occurrences = event.occurrences?.length ? event.occurrences : null
  const now = Date.now()

  let occ = null
  if (occurrences) {
    // Prefer next upcoming; fall back to most recent
    occ = occurrences.find(o => new Date(o.startDate).getTime() > now)
      || occurrences[occurrences.length - 1]
  }

  if (occ?.local) {
    const { date, startTime, endTime } = occ.local
    if (date && startTime && endTime) {
      const d = new Date(date + 'T00:00:00')
      const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const startD = new Date(`${date}T${startTime}`)
      const endD = new Date(`${date}T${endTime}`)
      const startFmt = startD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const endFmt = endD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      return `${dayStr} · ${startFmt}–${endFmt}`
    }
  }

  const startIso = occ?.startDate || event.startDate
  const endIso = occ?.endDate || event.endDate
  if (!startIso) return ''

  const startD = new Date(startIso)
  const endD = endIso ? new Date(endIso) : null
  const dayStr = startD.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const startTime = startD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const endTime = endD ? endD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
  return endTime ? `${dayStr} · ${startTime}–${endTime}` : `${dayStr} · ${startTime}`
}

function renderListings(events, stats) {
  const section = document.getElementById('listings-section')
  if (!section) return

  // Pair each event with its stats and computed status
  const tagged = events.map((ev, i) => ({
    ev,
    stats: stats[i] || {},
    status: getEventStatus(ev)
  }))

  const live     = tagged.filter(t => t.status === 'live')
  const upcoming = tagged.filter(t => t.status === 'upcoming')
    .sort((a, b) => new Date(a.ev.startDate) - new Date(b.ev.startDate))
  const ended    = tagged.filter(t => t.status === 'ended')
    .sort((a, b) => new Date(b.ev.endDate) - new Date(a.ev.endDate))

  const activeGroups = [live, upcoming, ended].filter(g => g.length > 0)
  const showDividers = activeGroups.length > 1

  const dividerLabel = (label) =>
    `<div class="px-1 mt-4 mb-2"><span class="text-[10px] font-bold uppercase tracking-widest text-white/20">${label}</span></div>`

  function buildCard({ ev, stats, status }) {
    const address = formatAddress(ev)
    const window = formatOccurrenceWindow(ev)
    const heroUrl = ev.flypost?.heroImageUrl
    const eventId = ev.flypost?.eventId
    const { attendanceCount = 0, feedbackCount = 0 } = stats

    const statusBadge = status === 'live'
      ? `<span class="text-mint_leaf font-bold text-[10px] uppercase tracking-widest flex items-center gap-1"><span class="animate-pulse">●</span> LIVE</span>`
      : status === 'upcoming'
      ? `<span class="text-air_force_blue-700 font-bold text-[10px] uppercase tracking-widest opacity-70">Upcoming</span>`
      : `<span class="text-white/30 font-bold text-[10px] uppercase tracking-widest">Ended</span>`

    const thumb = heroUrl
      ? `<img src="${escapeHtml(heroUrl)}" alt="" class="w-14 h-14 object-cover rounded-xl flex-shrink-0" />`
      : ''

    return `
      <div class="glass-card rounded-2xl p-4 flex gap-3 items-start" data-event-id="${escapeHtml(eventId || '')}">
        ${thumb}
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm leading-tight truncate">${escapeHtml(address)}</div>
          <div class="text-xs text-air_force_blue-700 opacity-70 mt-0.5">${escapeHtml(window)}</div>
          <div class="mt-1.5">${statusBadge}</div>
          <div class="stats-row text-[10px] text-air_force_blue-700 mt-1.5">👥 ${attendanceCount} checked in · 💬 ${feedbackCount} feedback</div>
        </div>
      </div>
    `
  }

  const groups = [
    { items: live,     label: 'Live' },
    { items: upcoming, label: 'Upcoming' },
    { items: ended,    label: 'Ended' },
  ]

  const body = groups
    .filter(g => g.items.length > 0)
    .map(g => `
      ${showDividers ? dividerLabel(g.label) : ''}
      <div class="space-y-3">${g.items.map(buildCard).join('')}</div>
    `)
    .join('')

  const total = tagged.length

  section.innerHTML = `
    <details class="faq-details mb-6 glass-card rounded-2xl border-mint_leaf/10 overflow-hidden">
      <summary class="cursor-pointer p-5 md:p-6 font-bold text-base md:text-lg text-mint_leaf hover:text-bright_snow transition-colors flex justify-between items-center">
        <span>YOUR LISTINGS (${total})</span>
      </summary>
      <div class="px-5 md:px-6 pb-5 md:pb-6 pt-2">${body}</div>
    </details>
  `
}

function scheduleStatsRefresh(events) {
  const liveEvents = events.filter(ev => getEventStatus(ev) === 'live')
  if (!liveEvents.length) return

  setInterval(async () => {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.goflypost.com'
    for (const ev of liveEvents) {
      const res = await fetch(`${API_BASE}/v1/events/${ev.flypost.eventId}/stats`)
        .then(r => r.json())
        .catch(() => null)
      if (!res) continue
      const card = document.querySelector(`[data-event-id="${ev.flypost.eventId}"]`)
      if (card) {
        card.querySelector('.stats-row').textContent =
          `👥 ${res.attendanceCount} checked in · 💬 ${res.feedbackCount} feedback`
      }
    }
  }, 60_000)
}

// Start app
init()
