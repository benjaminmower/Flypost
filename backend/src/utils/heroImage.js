import { isFirestoreEnabled, getFirestoreClient } from '../firestoreClient.js'

/**
 * Scrape og:image from a URL (5s timeout)
 */
export async function scrapeHeroImageUrl(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
    clearTimeout(timeout)
    const html = await res.text()
    const match = html.match(/<meta property="og:image" content="([^"]+)"/i)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Write flypost.heroImageUrl to Firestore (fire-and-forget safe)
 */
export async function setHeroImageUrl(eventId, heroImageUrl) {
  if (!isFirestoreEnabled()) return
  try {
    const db = getFirestoreClient()
    await db.collection('events').doc(eventId).update({ 'flypost.heroImageUrl': heroImageUrl ?? null })
  } catch (err) {
    console.warn(`⚠️ Hero image Firestore update failed for ${eventId}:`, err.message)
  }
}

/**
 * Fire-and-forget: scrape hero image after publish
 */
export function triggerHeroImageScrape(storedEvent) {
  const eventId = storedEvent.flypost?.eventId
  const url = storedEvent.url
  if (!eventId || !url) return
  scrapeHeroImageUrl(url)
    .then(heroImageUrl => setHeroImageUrl(eventId, heroImageUrl))
    .catch(() => setHeroImageUrl(eventId, null))
}
