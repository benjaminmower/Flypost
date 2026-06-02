import './styles.css'
import { getEventById, getEventsNear, getMyFlyers, parseAndPublishEvent } from './api.js'
import { auth, completeEmailLinkSignIn, startEmailLinkSignIn, subscribeToAuth, uploadFlyerImage } from './firebase.js'
import { distanceMiles, formatDateTime, formatDistance, formatRelativeTime, getUserPosition } from './geo.js'
import { imagePreviewUrl, validateAndCompressImage } from './image.js'

const appEl = document.getElementById('app')

const DISCOVERY_CATEGORIES = [
  { value: 'garage_sale', storage: 'garage-sales', label: 'Garage sales' },
  { value: 'live_event', storage: 'live-events', label: 'Live events' },
  { value: 'happy_hour', storage: 'happy-hours', label: 'Happy hours' },
  { value: 'community_alert', storage: 'community-alerts', label: 'Alerts' },
  { value: 'missing_pet', storage: 'missing-pets', label: 'Missing pets' },
  { value: 'job_posting', storage: 'job-postings', label: 'Jobs' },
  { value: 'apartment', storage: 'apartments', label: 'Apartments' },
  { value: 'open_house', storage: 'open-houses', label: 'Open houses' }
]

let currentUser = null
let authReadyResolve
const authReady = new Promise(resolve => {
  authReadyResolve = resolve
})

subscribeToAuth(user => {
  currentUser = user
  authReadyResolve?.()
  updateUserBadge()
})

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function storageGet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function storageAdd(key, eventId) {
  const values = storageGet(key)
  if (!values.includes(eventId)) {
    values.push(eventId)
    localStorage.setItem(key, JSON.stringify(values))
  }
}

function storageRemove(key, eventId) {
  const values = storageGet(key).filter(value => value !== eventId)
  localStorage.setItem(key, JSON.stringify(values))
}

function categoryLabel(value) {
  return DISCOVERY_CATEGORIES.find(cat => cat.value === value || cat.storage === value)?.label || 'Flyer'
}

function storageCategory(value) {
  return DISCOVERY_CATEGORIES.find(cat => cat.value === value)?.storage || value
}

function slugify(value) {
  return String(value || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 100) || 'event'
}

function shareUrlForStoredEvent(event) {
  if (event.shareUrl) return event.shareUrl
  const eventId = event.flypost?.eventId || event.id
  if (!eventId) return ''
  const address = event.location?.address
  const slug = slugify([
    event.name,
    address?.streetAddress,
    address?.addressLocality
  ].filter(Boolean).join(' '))
  return `https://goflypost.com/e/${slug}/${eventId}_fpid`
}

function shell(content, options = {}) {
  const path = window.location.pathname
  appEl.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Flypost home">FLYPOST</a>
        <nav class="nav">
          <a class="${path === '/' ? 'active' : ''}" href="/">Deck</a>
          <a class="${path === '/saved' ? 'active' : ''}" href="/saved">Saved</a>
          <a class="${path === '/post' ? 'active' : ''}" href="/post">Post</a>
          <a class="${path === '/my' ? 'active' : ''}" href="/my">My Flyers</a>
        </nav>
        <div class="user-badge" id="user-badge"></div>
      </header>
      <main class="${options.mainClass || ''}">${content}</main>
      <div id="install-banner" class="install-banner hidden">
        <span>Add Flypost to your home screen.</span>
        <button type="button" id="dismiss-install">Dismiss</button>
      </div>
    </div>
  `
  updateUserBadge()
  setupInstallBanner()
}

function updateUserBadge() {
  const badge = document.getElementById('user-badge')
  if (!badge) return
  if (currentUser) {
    badge.innerHTML = `
      <span>${escapeHtml(currentUser.email || 'Signed in')}</span>
      <button type="button" class="link-button" id="signout-btn">Sign out</button>
    `
    document.getElementById('signout-btn')?.addEventListener('click', async () => {
      await auth.signOut()
      route()
    })
  } else {
    badge.innerHTML = '<a class="signin-link" href="/login">Sign in</a>'
  }
}

function setupInstallBanner() {
  const banner = document.getElementById('install-banner')
  if (!banner) return
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
  const isIosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent)
  if (isStandalone || !isIosSafari || localStorage.getItem('flypost.install.dismissed')) return
  banner.classList.remove('hidden')
  document.getElementById('dismiss-install')?.addEventListener('click', () => {
    localStorage.setItem('flypost.install.dismissed', '1')
    banner.classList.add('hidden')
  })
}

async function renderHome() {
  const params = new URLSearchParams(window.location.search)
  const selected = new Set((params.get('category') || '').split(',').filter(Boolean))
  shell(`
    <section class="deck-screen">
      <div class="deck-heading">
        <h1>Nearby flyers</h1>
        <a class="primary-link" href="/post">Post flyer</a>
      </div>
      <div class="chips" id="category-chips">
        ${DISCOVERY_CATEGORIES.map(cat => `
          <button type="button" class="chip ${selected.has(cat.value) ? 'selected' : ''}" data-category="${cat.value}">
            ${escapeHtml(cat.label)}
          </button>
        `).join('')}
      </div>
      <div id="deck-status" class="status-line">Finding flyers near you...</div>
      <div id="deck" class="deck"></div>
    </section>
  `, { mainClass: 'deck-main' })

  document.getElementById('category-chips')?.addEventListener('click', event => {
    const button = event.target.closest('[data-category]')
    if (!button) return
    const value = button.dataset.category
    if (selected.has(value)) selected.delete(value)
    else selected.add(value)
    const next = new URLSearchParams(window.location.search)
    if (selected.size) next.set('category', Array.from(selected).join(','))
    else next.delete('category')
    history.pushState({}, '', `${window.location.pathname}${next.toString() ? '?' + next : ''}`)
    renderHome()
  })

  try {
    const coords = await getUserPosition()
    const data = await getEventsNear({
      lat: coords.lat,
      lng: coords.lng,
      categories: Array.from(selected)
    })
    const dismissed = new Set(storageGet('flypost.dismissed'))
    const events = (data.events || [])
      .filter(event => event.imageUrl)
      .filter(event => !dismissed.has(event.eventId))

    renderDeck(events, coords)
  } catch (error) {
    document.getElementById('deck-status').textContent = error.message || 'Could not load nearby flyers.'
  }
}

function renderDeck(events, coords) {
  const deck = document.getElementById('deck')
  const status = document.getElementById('deck-status')
  if (!deck || !status) return

  if (!events.length) {
    status.textContent = ''
    deck.innerHTML = `
      <div class="empty-state">
        <h2>No image-backed flyers nearby.</h2>
        <p>Try another category, expand your area later, or post the first flyer.</p>
        <a class="primary-link" href="/post">Post flyer</a>
      </div>
    `
    return
  }

  status.textContent = `${events.length} image-backed flyer${events.length === 1 ? '' : 's'} nearby`
  deck.innerHTML = events.slice(0, 3).map((event, index) => cardTemplate(event, coords, index)).join('')
  setupTopCard(events, coords)
}

function cardTemplate(event, coords, index) {
  const eventCoords = { lat: event.where?.latitude, lng: event.where?.longitude }
  const distance = formatDistance(distanceMiles(coords, eventCoords))
  const relative = formatRelativeTime(event.when?.start)
  const offset = index * 10
  const rotation = index === 0 ? 0 : index % 2 ? -2 : 2
  return `
    <article class="flyer-card" data-event-id="${escapeHtml(event.eventId)}" data-share-url="${escapeHtml(event.shareUrl || '')}" style="--offset:${offset}px; --rotation:${rotation}deg; z-index:${10 - index}">
      <img src="${escapeHtml(event.imageUrl)}" alt="" draggable="false">
      <div class="card-scrim"></div>
      <div class="card-chip left">${escapeHtml([distance, relative].filter(Boolean).join(' · '))}</div>
      <div class="card-chip right">${escapeHtml(categoryLabel(event.what?.type))}</div>
      <div class="card-copy">
        <h2>${escapeHtml(event.what?.label || categoryLabel(event.what?.type))}</h2>
        <p>${escapeHtml(event.where?.address || formatDateTime(event.when?.start))}</p>
      </div>
    </article>
  `
}

function setupTopCard(events, coords) {
  const card = document.querySelector('.flyer-card')
  if (!card) return
  let startX = 0
  let startY = 0
  let dx = 0
  let dragging = false

  card.addEventListener('pointerdown', event => {
    dragging = true
    startX = event.clientX
    startY = event.clientY
    dx = 0
    card.setPointerCapture(event.pointerId)
    card.classList.add('dragging')
  })

  card.addEventListener('pointermove', event => {
    if (!dragging) return
    dx = event.clientX - startX
    const dy = event.clientY - startY
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`
  })

  card.addEventListener('pointerup', () => {
    if (!dragging) return
    dragging = false
    card.classList.remove('dragging')
    if (Math.abs(dx) > 90) {
      completeSwipe(card, dx > 0 ? 'right' : 'left', events, coords)
      return
    }
    if (Math.abs(dx) < 8) {
      const url = card.dataset.shareUrl
      if (url) window.open(url, '_blank', 'noopener')
    }
    card.style.transform = ''
  })
}

function completeSwipe(card, direction, events, coords) {
  const eventId = card.dataset.eventId
  storageAdd(direction === 'right' ? 'flypost.saved' : 'flypost.dismissed', eventId)
  card.classList.add(direction === 'right' ? 'swiped-right' : 'swiped-left')
  setTimeout(() => {
    const remaining = events.filter(event => event.eventId !== eventId)
    renderDeck(remaining, coords)
  }, 220)
}

async function renderSaved() {
  shell(`
    <section class="list-screen">
      <div class="section-heading">
        <h1>Saved flyers</h1>
        <a class="secondary-link" href="/">Back to deck</a>
      </div>
      <div id="saved-list" class="flyer-list">Loading saved flyers...</div>
    </section>
  `)

  const ids = storageGet('flypost.saved')
  const list = document.getElementById('saved-list')
  if (!ids.length) {
    list.innerHTML = '<div class="empty-state small"><h2>Nothing saved yet.</h2><p>Swipe right on the deck to save flyers here.</p></div>'
    return
  }

  const results = await Promise.all(ids.map(id => getEventById(id).catch(() => null)))
  const events = results
    .map(result => result?.events?.[0])
    .filter(Boolean)
    .sort((a, b) => new Date(a.when?.start) - new Date(b.when?.start))

  list.innerHTML = events.map(event => savedRow(event)).join('') || '<div class="empty-state small"><h2>No saved flyers found.</h2></div>'
  list.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove]')
    if (remove) {
      storageRemove('flypost.saved', remove.dataset.remove)
      renderSaved()
      return
    }
    const row = event.target.closest('[data-share-url]')
    if (row?.dataset.shareUrl) window.open(row.dataset.shareUrl, '_blank', 'noopener')
  })
}

function savedRow(event) {
  return `
    <article class="list-row" data-share-url="${escapeHtml(event.shareUrl || '')}">
      ${event.imageUrl ? `<img src="${escapeHtml(event.imageUrl)}" alt="">` : '<div class="thumb-placeholder"></div>'}
      <div>
        <h2>${escapeHtml(event.what?.label || categoryLabel(event.what?.type))}</h2>
        <p>${escapeHtml(formatDateTime(event.when?.start))}</p>
        <p>${escapeHtml(event.where?.address || categoryLabel(event.what?.type))}</p>
      </div>
      <button type="button" class="remove-btn" data-remove="${escapeHtml(event.eventId)}">Remove</button>
    </article>
  `
}

async function renderLogin() {
  const params = new URLSearchParams(window.location.search)
  const next = params.get('next') || sessionStorage.getItem('flypost.next') || '/'
  shell(`
    <section class="auth-screen">
      <h1>Sign in</h1>
      <form id="login-form" class="panel">
        <label>Email
          <input id="login-email" type="email" autocomplete="email" required>
        </label>
        <button class="primary-button" type="submit">Send magic link</button>
        <p id="login-status" class="form-status"></p>
      </form>
    </section>
  `)
  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault()
    const status = document.getElementById('login-status')
    const email = document.getElementById('login-email').value.trim()
    sessionStorage.setItem('flypost.next', next)
    status.textContent = 'Sending link...'
    try {
      await startEmailLinkSignIn(email)
      status.textContent = 'Check your inbox for the sign-in link.'
    } catch (error) {
      status.textContent = error.message || 'Could not send sign-in link.'
    }
  })
}

async function renderFinishSignIn() {
  shell('<section class="auth-screen"><h1>Completing sign-in</h1><p class="status-line">Checking your magic link...</p></section>')
  try {
    await completeEmailLinkSignIn()
    const next = sessionStorage.getItem('flypost.next') || '/'
    sessionStorage.removeItem('flypost.next')
    window.location.href = next
  } catch (error) {
    shell(`<section class="auth-screen"><h1>Sign-in failed</h1><p class="status-line">${escapeHtml(error.message || 'The link could not be used.')}</p><a class="primary-link" href="/login">Try again</a></section>`)
  }
}

async function renderPost() {
  await authReady
  if (!currentUser) {
    sessionStorage.setItem('flypost.next', '/post')
    window.location.href = '/login?next=/post'
    return
  }

  shell(`
    <section class="post-screen">
      <div class="section-heading">
        <h1>Post flyer</h1>
        <a class="secondary-link" href="/my">My Flyers</a>
      </div>
      <form id="post-form" class="post-form">
        <label class="image-drop">
          <span id="image-label">Take or choose a flyer image</span>
          <input id="flyer-image" type="file" accept="image/*" capture="environment" required>
          <img id="image-preview" alt="" class="hidden">
        </label>
        <label>Title
          <input id="flyer-title" maxlength="60" required placeholder="Backyard show tonight">
        </label>
        <label>Description
          <textarea id="flyer-description" maxlength="500" rows="4" required placeholder="What should people know?"></textarea>
        </label>
        <label>Category
          <select id="flyer-category" required>
            ${DISCOVERY_CATEGORIES.map(cat => `<option value="${cat.storage}">${escapeHtml(cat.label)}</option>`).join('')}
          </select>
        </label>
        <label>Address
          <input id="flyer-address" required placeholder="123 Main St, Santa Monica, CA">
        </label>
        <label>Start time
          <input id="flyer-start" type="datetime-local" required>
        </label>
        <label>Duration
          <select id="flyer-duration" required>
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
          </select>
        </label>
        <div class="progress hidden" id="upload-progress"><span></span></div>
        <button class="primary-button" type="submit">Publish flyer</button>
        <p id="post-status" class="form-status"></p>
      </form>
    </section>
  `)

  let compressedFile = null
  let uploaded = null
  const fileInput = document.getElementById('flyer-image')
  const preview = document.getElementById('image-preview')
  const label = document.getElementById('image-label')

  fileInput.addEventListener('change', async () => {
    uploaded = null
    compressedFile = null
    const status = document.getElementById('post-status')
    status.textContent = 'Preparing image...'
    try {
      compressedFile = await validateAndCompressImage(fileInput.files[0])
      preview.src = imagePreviewUrl(compressedFile)
      preview.classList.remove('hidden')
      label.textContent = 'Flyer image ready'
      status.textContent = ''
    } catch (error) {
      status.textContent = error.message || 'Image could not be used.'
      fileInput.value = ''
    }
  })

  document.getElementById('post-form').addEventListener('submit', async event => {
    event.preventDefault()
    const status = document.getElementById('post-status')
    const button = event.submitter
    button.disabled = true
    status.textContent = 'Publishing...'
    try {
      if (!compressedFile) throw new Error('Choose a flyer image first.')
      if (!uploaded) {
        const progress = document.getElementById('upload-progress')
        progress.classList.remove('hidden')
        uploaded = await uploadFlyerImage({
          uid: currentUser.uid,
          file: compressedFile,
          onProgress: pct => {
            progress.querySelector('span').style.width = `${pct}%`
          }
        })
      }

      const title = document.getElementById('flyer-title').value.trim()
      const description = document.getElementById('flyer-description').value.trim()
      const category = document.getElementById('flyer-category').value
      const categoryText = categoryLabel(category)
      const address = document.getElementById('flyer-address').value.trim()
      const startValue = document.getElementById('flyer-start').value
      const durationHours = Number(document.getElementById('flyer-duration').value)
      const start = new Date(startValue)
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
      const idToken = await currentUser.getIdToken()

      const naturalLanguageInput = [
        `${title}.`,
        description,
        `Category: ${categoryText}.`,
        `Address: ${address}.`,
        `Starts: ${start.toISOString()}.`,
        `Ends: ${end.toISOString()}.`
      ].join(' ')

      const result = await parseAndPublishEvent({
        naturalLanguageInput,
        idToken,
        userContext: {
          currentDate: new Date().toISOString(),
          channel: 'app-pwa',
          flyer: {
            title,
            description,
            category,
            heroImageUrl: uploaded.url,
            heroImageStoragePath: uploaded.path,
            createdByUid: currentUser.uid,
            createdByEmail: currentUser.email
          }
        }
      })

      const shareUrl = result.data?.event?.shareUrl || result.data?.event?.flypost?.shareUrl
      status.innerHTML = `Published. ${shareUrl ? `<a href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener">Open flyer</a>` : '<a href="/my">View My Flyers</a>'}`
      event.target.reset()
      preview.classList.add('hidden')
      compressedFile = null
      uploaded = null
    } catch (error) {
      status.textContent = error.message || 'Could not publish flyer.'
    } finally {
      button.disabled = false
    }
  })
}

async function renderMyFlyers() {
  await authReady
  if (!currentUser) {
    sessionStorage.setItem('flypost.next', '/my')
    window.location.href = '/login?next=/my'
    return
  }

  shell(`
    <section class="list-screen">
      <div class="section-heading">
        <h1>My Flyers</h1>
        <a class="primary-link" href="/post">Post flyer</a>
      </div>
      <div id="my-list" class="flyer-list">Loading your flyers...</div>
    </section>
  `)

  const list = document.getElementById('my-list')
  try {
    const data = await getMyFlyers(currentUser.email)
    const events = data.events || []
    if (!events.length) {
      list.innerHTML = '<div class="empty-state small"><h2>No flyers posted yet.</h2><p>Your published flyers will appear here.</p></div>'
      return
    }
    list.innerHTML = events.map(myFlyerRow).join('')
  } catch (error) {
    list.innerHTML = `<div class="empty-state small"><h2>Could not load My Flyers.</h2><p>${escapeHtml(error.message || '')}</p></div>`
  }
}

function myFlyerRow(event) {
  const shareUrl = shareUrlForStoredEvent(event)
  const eventId = event.flypost?.eventId || event.id || ''
  const imageUrl = event.flypost?.heroImageUrl
  const address = event.location?.address
  const addressText = [
    address?.streetAddress,
    address?.addressLocality,
    address?.addressRegion
  ].filter(Boolean).join(', ')
  return `
    <article class="list-row">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : '<div class="thumb-placeholder"></div>'}
      <div>
        <h2>${escapeHtml(event.name || 'Flyer')}</h2>
        <p>${escapeHtml(formatDateTime(event.startDate))}</p>
        <p>${escapeHtml(addressText || event.flypost?.category || '')}</p>
        <a href="mailto:support@goflypost.com?subject=Remove%20Flypost%20flyer%20${encodeURIComponent(eventId)}">Request removal</a>
      </div>
      ${shareUrl ? `<a class="row-action" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener">Open</a>` : ''}
    </article>
  `
}

async function route() {
  await authReady
  const path = window.location.pathname
  if (path === '/saved') return renderSaved()
  if (path === '/login') return renderLogin()
  if (path === '/finishSignIn') return renderFinishSignIn()
  if (path === '/post') return renderPost()
  if (path === '/my') return renderMyFlyers()
  return renderHome()
}

window.addEventListener('popstate', route)
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="/"]')
  if (!link || link.target || event.metaKey || event.ctrlKey) return
  event.preventDefault()
  history.pushState({}, '', link.getAttribute('href'))
  route()
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('[Flypost App] Service worker registration failed:', error)
    })
  })
}

route()
