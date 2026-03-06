import { generateShareUrl, validateExternalUrl } from './shareUrl.js'

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Render share page HTML with Open Graph tags
 */
export function renderSharePageHtml(event) {
  // Extract event data
  const eventName = event.name || 'Event'
  const eventId = event.flypost?.eventId || event.id || 'unknown'
  const shareUrl = generateShareUrl(event) || `https://goflypost.com`

  // Extract and validate external listing URL
  let externalUrl = event.url || event.flypost?.externalUrl || event.flypost?.url
  externalUrl = validateExternalUrl(externalUrl)

  // Build description from event data
  let description = event.description || ''

  // Format a single date/time slot: "Saturday, Mar 7 · 2:00 PM – 4:00 PM PST"
  const timezone = event.flypost?.timezone || 'America/Los_Angeles'
  const occurrences = event.occurrences || []

  const formatSlot = (startDate, endDate) => {
    try {
      const startObj = new Date(startDate)
      const datePart = new Intl.DateTimeFormat('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone
      }).format(startObj)
      const startTimePart = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: timezone
      }).format(startObj)
      if (!endDate) return `${datePart} · ${startTimePart}`
      const endTimePart = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: timezone
      }).format(new Date(endDate))
      return `${datePart} · ${startTimePart} – ${endTimePart}`
    } catch (err) {
      console.error('Error formatting slot:', err)
      return null
    }
  }

  // Build one slot string per occurrence (sorted chronologically), falling back to event dates
  let slotStrings = []
  if (occurrences.length > 0) {
    const sorted = [...occurrences].sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    slotStrings = sorted.map(occ => formatSlot(occ.startDate, occ.endDate)).filter(Boolean)
  } else if (event.startDate) {
    const slot = formatSlot(event.startDate, event.endDate)
    if (slot) slotStrings = [slot]
  }

  // For OG description: use first/soonest upcoming occurrence (social crawlers read one tag)
  const now = Date.now()
  let ogSlot = slotStrings[0] || ''
  if (occurrences.length > 0) {
    const sorted = [...occurrences].sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    const upcoming = sorted.find(occ => new Date(occ.startDate).getTime() >= now) || sorted[0]
    ogSlot = formatSlot(upcoming.startDate, upcoming.endDate) || ogSlot
  }

  // Build full description (metadata fallback)
  if (!description && ogSlot) {
    description = ogSlot
  } else if (ogSlot) {
    description = `${ogSlot} • ${description}`
  }

  // Extract address
  const address = event.location?.address
  let formattedAddress = ''
  if (address) {
    const parts = []
    if (address.streetAddress) parts.push(address.streetAddress)
    if (address.addressLocality) parts.push(address.addressLocality)
    if (address.addressRegion) parts.push(address.addressRegion)
    formattedAddress = parts.join(', ')
  }

  // Generate concise description for OG tags (optimized for social media)
  let ogDescription = ''
  if (ogSlot) {
    ogDescription = ogSlot
    if (formattedAddress) {
      ogDescription += ` • Open house at ${formattedAddress}. Explore this beautiful property in person.`
    }
  } else if (formattedAddress) {
    ogDescription = `Open house at ${formattedAddress}`
  }

  // Get image URL (if available)
  // Note: Default image should be hosted at goflypost.com or use an environment variable
  const imageUrl = event.flypost?.heroImageUrl || event.image || event.flypost?.imageUrl || process.env.OG_DEFAULT_IMAGE || 'https://cdn.prod.website-files.com/641b71cdf89f2834a1aff9a6/6683234a1ee80c5f2891597e_Flypost%20Logo-256px.png'

  // Escape all dynamic content
  const safeTitle = escapeHtml(eventName)
  const safeOgDescription = escapeHtml(ogDescription || 'View event details')
  const safeUrl = escapeHtml(shareUrl)
  const safeImageUrl = escapeHtml(imageUrl)
  const safeAddress = escapeHtml(formattedAddress)
  const safeSlots = slotStrings.map(s => escapeHtml(s))

  // Generate calendar download URL
  const slug = shareUrl.split('/').slice(-2, -1)[0] || 'event'
  const fpid = shareUrl.split('/').pop() || eventId + '_fpid'
  const calendarDownloadUrl = `/e/${slug}/${fpid}/calendar.ics`

  // Generate maps URL using address (not coordinates)
  let mapsUrl = null
  if (formattedAddress) {
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}`
  }

  // Build action buttons HTML with Check In as primary CTA
  let actionButtonsHtml = '<div class="actions">'

  // Check In button (PRIMARY - Lemon Lime matching Presence)
  actionButtonsHtml += `
    <a href="https://presence.goflypost.com" class="btn btn-checkin" rel="noopener noreferrer" target="_blank">
      🎯 Check In to This Event
    </a>`

  // Secondary actions row
  actionButtonsHtml += '<div class="secondary-actions">'

  // Add to Calendar button (Secondary)
  if (event.startDate || occurrences.length > 0) {
    actionButtonsHtml += `
      <a href="${escapeHtml(calendarDownloadUrl)}" class="btn btn-secondary" download>
        📅 Add to Calendar
      </a>`
  }

  // Get Directions button (Secondary)
  if (mapsUrl) {
    actionButtonsHtml += `
      <a href="${escapeHtml(mapsUrl)}" class="btn btn-secondary" rel="noopener noreferrer" target="_blank">
        🗺️ Get Directions
      </a>`
  }

  actionButtonsHtml += '</div>' // Close secondary-actions

  // View Full Details button (Tertiary)
  if (externalUrl) {
    actionButtonsHtml += `
      <a href="${escapeHtml(externalUrl)}" class="btn btn-tertiary" rel="noopener noreferrer" target="_blank">
        🏠 View Full Details
      </a>`
  }

  actionButtonsHtml += '</div>' // Close actions

  console.log(`[renderSharePageHtml] event.flypost?.heroImageUrl = ${event.flypost?.heroImageUrl}`)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} | Flypost</title>

  <!-- Canonical URL -->
  <link rel="canonical" href="${safeUrl}">

  <!-- Open Graph tags -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeOgDescription}">
  <meta property="og:image" content="${safeImageUrl}">
  <meta property="og:image:width" content="256">
  <meta property="og:image:height" content="256">

  <!-- Twitter Card tags -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${safeUrl}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeOgDescription}">
  <meta name="twitter:image" content="${safeImageUrl}">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
      background: #060810;
      color: #f7f7f7;
      -webkit-font-smoothing: antialiased;
      position: relative;
    }

    /* Background gradient */
    .bg-glow {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100vw;
      height: 100vh;
      background: radial-gradient(circle at 50% 15%, #1e1b4b 0%, #060810 80%);
      z-index: -1;
    }

    /* Main container */
    .page-wrapper {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 680px;
      width: 100%;
      margin: auto;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      border-radius: 32px;
      padding: 32px 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    /* Typography */
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 24px;
      color: #f7f7f7;
      line-height: 1.2;
    }

    .meta {
      margin-bottom: 32px;
    }

    .meta-item {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      color: #628395;
      font-size: 15px;
    }

    .meta-item:last-child {
      margin-bottom: 0;
    }

    /* Button styles */
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-decoration: none;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
      width: 100%;
      text-align: center;
    }

    .btn-checkin {
      /* PRIMARY - Lemon Lime matching Presence */
      background: #e0e03e;
      color: #060810;
      padding: 20px 32px;
      border-radius: 24px;
      font-size: 20px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      box-shadow: 0 8px 20px rgba(224, 224, 62, 0.25);
    }

    .btn-checkin:hover {
      background: #f7f7f7;
      transform: translateY(-2px);
      box-shadow: 0 12px 24px rgba(224, 224, 62, 0.35);
    }

    .btn-checkin:active {
      transform: scale(0.95);
    }

    .btn-secondary {
      /* SECONDARY - Glass effect */
      background: rgba(255, 255, 255, 0.03);
      color: #f7f7f7;
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 16px 24px;
      border-radius: 16px;
      font-size: 16px;
      font-weight: 700;
      backdrop-filter: blur(12px);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(224, 224, 62, 0.3);
      transform: translateY(-1px);
    }

    .btn-tertiary {
      /* TERTIARY - Subtle */
      background: transparent;
      color: #628395;
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }

    .btn-tertiary:hover {
      color: #e0e03e;
      border-color: rgba(224, 224, 62, 0.2);
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 500px;
      margin: 32px auto 0;
    }

    .secondary-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    /* Footer */
    .footer {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      text-align: center;
    }

    .footer a {
      color: #628395;
      text-decoration: none;
      font-size: 14px;
      transition: color 0.2s ease;
    }

    .footer a:hover {
      color: #e0e03e;
    }

    /* Mobile responsive */
    @media (max-width: 640px) {
      .container {
        padding: 24px;
        border-radius: 24px;
      }

      .btn-checkin {
        padding: 18px 24px;
        font-size: 18px;
        border-radius: 20px;
      }

      .btn-secondary {
        padding: 14px 20px;
        font-size: 15px;
      }

      .btn-tertiary {
        padding: 10px 16px;
        font-size: 12px;
      }

      .secondary-actions {
        grid-template-columns: 1fr;
      }
    }

    /* Hero image */
    .hero-image-container {
      width: 100%;
      overflow: hidden;
      border-radius: 12px 12px 0 0;
      margin-bottom: 24px;
    }
    .hero-image {
      width: 100%;
      max-height: 300px;
      object-fit: cover;
      display: block;
      border-radius: 12px 12px 0 0;
    }

    /* Desktop styles */
    @media (min-width: 640px) {
      .page-wrapper {
        padding: 40px;
      }

      .container {
        border-radius: 32px;
        padding: 48px 40px;
      }

      h1 {
        font-size: 36px;
        margin-bottom: 28px;
      }

      .meta-item {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="page-wrapper">
    <div class="container">
      ${event.flypost?.heroImageUrl ? `
      <div class="hero-image-container">
        <img src="${escapeHtml(event.flypost.heroImageUrl)}" alt="Property photo" class="hero-image">
      </div>` : ''}
      <h1>${safeTitle}</h1>
      <div class="meta">
        ${safeSlots.map(s => `<div class="meta-item">📅 ${s}</div>`).join('\n        ')}
        ${safeAddress ? `<div class="meta-item">📍 ${safeAddress}</div>` : ''}
      </div>
      ${actionButtonsHtml}
      <div class="footer">
        <a href="https://goflypost.com">← Back to Flypost</a>
      </div>
    </div>
  </div>
</body>
</html>`
}

/**
 * Render 404 error page
 */
export function render404Page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event Not Found | Flypost</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px;
      background: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 48px;
      margin: 0;
      color: #1a1a1a;
    }
    p {
      font-size: 18px;
      color: #666;
      margin: 20px 0;
    }
    a {
      color: #007bff;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>Event not found</p>
    <p><a href="https://goflypost.com">← Back to Flypost</a></p>
  </div>
</body>
</html>`
}

/**
 * Render 500 error page
 */
export function render500Page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Server Error | Flypost</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      padding: 50px;
      background: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 48px;
      margin: 0;
      color: #1a1a1a;
    }
    p {
      font-size: 18px;
      color: #666;
      margin: 20px 0;
    }
    a {
      color: #007bff;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>500</h1>
    <p>Something went wrong</p>
    <p><a href="https://goflypost.com">← Back to Flypost</a></p>
  </div>
</body>
</html>`
}
