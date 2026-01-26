const DEFAULT_OG_IMAGE =
  'https://cdn.prod.website-files.com/641b71cdf89f2834a1aff9a6/695eaeeb6687c3be030ba5dd_18b73476aee032fb50bb9425fec40462_flypost-ground-truth-registry-og.png.png'

function escapeHtml(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeDescription(value) {
  if (typeof value !== 'string') {
    return 'View this event on Flypost.'
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return 'View this event on Flypost.'
  }
  const sliced = trimmed.substring(0, 200)
  return sliced.length < trimmed.length ? `${sliced}...` : sliced
}

export function buildShareOgHtml({ title, description, imageUrl, pageUrl }) {
  const safeTitle = escapeHtml(title || 'Flypost Event')
  const safeDescription = escapeHtml(
    description || 'View this event on Flypost.'
  )
  const safeImageUrl = escapeHtml(imageUrl || DEFAULT_OG_IMAGE)
  const safePageUrl = escapeHtml(pageUrl || 'https://goflypost.com')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <link rel="canonical" href="${safePageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:url" content="${safePageUrl}" />
    <meta property="og:image" content="${safeImageUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImageUrl}" />
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeDescription}</p>
      <p>View this event on Flypost.</p>
    </main>
  </body>
</html>`
}

export function buildEventShareMeta(event) {
  const eventId = event?.flypost?.eventId || event?.id
  const title = event?.name || 'Flypost Event'
  const description = normalizeDescription(event?.description)
  const imageUrl =
    event?.flypost?.shareImageUrl ||
    event?.image ||
    event?.imageUrl ||
    event?.flypost?.imageUrl ||
    DEFAULT_OG_IMAGE
  const pageUrl = eventId
    ? `https://goflypost.com/e/${encodeURIComponent(String(eventId))}`
    : 'https://goflypost.com'

  return {
    title,
    description,
    imageUrl,
    pageUrl
  }
}
