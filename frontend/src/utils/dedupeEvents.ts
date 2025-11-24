//v1 
//frontend/src/utils/dedupeEvents.ts
// ------------------------------------------------------
// Front-end deduper for Flypost v4 events
//
// Strategies:
// - 'hash':
//     Collapse exact duplicates by event.hash.value.
// - 'locationDate':
//     Collapse republished/edited items by
//     address + postal + startDate(day) + brokerage.
// - 'location':
//     Collapse by address + postal (+geo) + brokerage regardless of date.
//     Newest event wins. Use this if you want one card per property,
//     even when multiple open house dates exist.
// - 'auto' (default):
//     Prefer 'hash' when available, else 'locationDate'.
//
// "Newest" is determined by parseFreshness(), which prefers:
// flypost.submissionTimestamp -> storedAt -> Firestore updatedAt ->
// Firestore createdAt -> startDate.
// ------------------------------------------------------

import { parseFreshness, toLocalDateOnly } from './timeHelpers'

export type DedupeStrategy = 'auto' | 'hash' | 'locationDate' | 'location'

export interface DedupeOptions {
  strategy?: DedupeStrategy
}

// Normalize string-ish fields for key construction
function norm(s?: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// Round lat/lng to reduce floating-point noise in keys
function round(n?: number | string, places = 5): string {
  const f = typeof n === 'string' ? parseFloat(n) : n
  if (typeof f !== 'number' || Number.isNaN(f)) return ''
  const p = Math.pow(10, places)
  return String(Math.round(f * p) / p)
}

function pickBrokerageId(evt: any): string {
  return String(evt?.brokerageId || evt?.flypost?.brokerageId || '')
}

function computeHashKey(evt: any): string | null {
  const val = evt?.hash?.value
  return typeof val === 'string' && val.length ? `hash:${val}` : null
}

function computeLocationParts(evt: any) {
  const loc = evt?.location || {}
  const address = loc?.address || {}

  const street =
    norm(loc?.streetAddress) || norm(address?.streetAddress) || ''
  const postal =
    norm(loc?.postalCode) || norm(address?.postalCode) || ''
  const city =
    norm(loc?.city) || norm(address?.addressLocality) || ''
  const region =
    norm(loc?.region) || norm(address?.addressRegion) || ''
  const lat = round(loc?.latitude ?? loc?.geo?.latitude)
  const lng = round(loc?.longitude ?? loc?.geo?.longitude)
  const brokerage = norm(pickBrokerageId(evt))

  return { street, postal, city, region, lat, lng, brokerage }
}

// Key for “same listing on the same calendar day”
// Used for 'locationDate' strategy
function computeLocationDateKey(evt: any): string {
  const { street, postal, city, region, lat, lng, brokerage } =
    computeLocationParts(evt)

  // For Vista/South Bay demo, hard-code Pacific time;
// you can make this configurable later if you support multiple regions.
  const startDateDay =
    toLocalDateOnly(evt?.startDate, 'America/Los_Angeles') || ''

  return [
    'locdate',
    street,
    postal,
    city,
    region,
    lat,
    lng,
    startDateDay,
    brokerage
  ].join('|')
}

// Key for “same listing regardless of date”
// Used for 'location' strategy
function computeLocationKey(evt: any): string {
  const { street, postal, city, region, lat, lng, brokerage } =
    computeLocationParts(evt)

  return ['loc', street, postal, city, region, lat, lng, brokerage].join('|')
}

export function dedupeEvents(
  events: any[],
  opts: DedupeOptions = {}
): any[] {
  const strategy: DedupeStrategy = opts.strategy || 'auto'
  const map = new Map<string, any>()

  for (const evt of events || []) {
    let key: string | null = null

    if (strategy === 'hash') {
      key = computeHashKey(evt)
      if (!key) {
        // If there is no hash, treat this as unique in strict hash mode.
        // If you ever want hash+location fallback, replace this with:
        // key = computeLocationDateKey(evt)
        key = `unique:${evt?.flypost?.eventId || evt?.id || Math.random()}`
      }
    } else if (strategy === 'locationDate') {
      key = computeLocationDateKey(evt)
    } else if (strategy === 'location') {
      key = computeLocationKey(evt)
    } else {
      // 'auto': prefer hash when present, otherwise fallback to location+date
      key = computeHashKey(evt) || computeLocationDateKey(evt)
    }

    const existing = map.get(key)
    if (!existing) {
      map.set(key, evt)
      continue
    }

    // Newest wins
    const existingT = parseFreshness(existing)
    const incomingT = parseFreshness(evt)

    if (incomingT > existingT) {
      map.set(key, evt)
    }
  }

  return Array.from(map.values())
}
