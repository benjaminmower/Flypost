export const DEFAULT_COORDS = { lat: 34.0195, lng: -118.4912 }

export function getUserPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve({ ...DEFAULT_COORDS, source: 'default' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: 'device'
      }),
      () => resolve({ ...DEFAULT_COORDS, source: 'default' }),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 5 * 60 * 1000 }
    )
  })
}

export function distanceMiles(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const toRad = deg => (deg * Math.PI) / 180
  const earthMiles = 3958.8
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return earthMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function formatDistance(miles) {
  if (miles == null || Number.isNaN(miles)) return ''
  if (miles < 1) return '~1 mi'
  return `~${Math.round(miles)} mi`
}

export function formatRelativeTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = date.getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const hours = Math.round(absMs / 36e5)
  if (diffMs < 0) return 'now'
  if (hours < 1) return 'soon'
  if (hours < 24) return `in ${hours}h`
  const days = Math.round(hours / 24)
  return `in ${days}d`
}

export function formatDateTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
