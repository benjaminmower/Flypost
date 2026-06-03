import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanceKm, distanceMi, getEventGeo } from '../src/utils/geo.js'

// Known-coordinate fixtures. Distances verified against an independent
// Haversine calculator; the formula itself is copied from routes/presence.js.
test('distanceKm: identical points are zero', () => {
  assert.equal(distanceKm(34.0195, -118.4912, 34.0195, -118.4912), 0)
})

test('distanceKm: Santa Monica Pier to LAX (~12.5 km)', () => {
  // SM Pier 34.0083,-118.4988 ; LAX 33.9416,-118.4085
  const d = distanceKm(34.0083, -118.4988, 33.9416, -118.4085)
  assert.ok(Math.abs(d - 10.5) < 1.0, `expected ~10.5km, got ${d}`)
})

test('distanceMi: ~1.25mi corresponds to ~2km', () => {
  // Build two points ~2km apart and confirm the mi conversion.
  const km = distanceKm(34.0, -118.5, 34.018, -118.5) // ~2km north
  const mi = distanceMi(34.0, -118.5, 34.018, -118.5)
  assert.ok(Math.abs(mi - km / 1.60934) < 1e-9)
  assert.ok(Math.abs(km - 2.0) < 0.1, `expected ~2km, got ${km}`)
})

test('getEventGeo: precedence location.geo > flypost.geo > where', () => {
  const ev = {
    location: { geo: { latitude: 1, longitude: 2 } },
    flypost: { geo: { latitude: 3, longitude: 4 } },
    where: { latitude: 5, longitude: 6 },
  }
  assert.deepEqual(getEventGeo(ev), { lat: 1, lng: 2 })
})

test('getEventGeo: falls back to flypost.geo then where', () => {
  assert.deepEqual(
    getEventGeo({ flypost: { geo: { latitude: 3, longitude: 4 } } }),
    { lat: 3, lng: 4 }
  )
  assert.deepEqual(
    getEventGeo({ where: { latitude: 5, longitude: 6 } }),
    { lat: 5, lng: 6 }
  )
})

test('getEventGeo: valid zero coordinates are NOT dropped', () => {
  assert.deepEqual(
    getEventGeo({ location: { geo: { latitude: 0, longitude: 0 } } }),
    { lat: 0, lng: 0 }
  )
})

test('getEventGeo: returns null for missing/invalid geo', () => {
  assert.equal(getEventGeo(null), null)
  assert.equal(getEventGeo({}), null)
  assert.equal(getEventGeo({ location: { geo: { latitude: 'x', longitude: 2 } } }), null)
  assert.equal(getEventGeo({ location: { geo: { latitude: null } } }), null)
})

test('getEventGeo: explicit null coordinates are NOT coerced to (0,0)', () => {
  // Number(null) === 0 would otherwise place a coordinate-less event in the
  // Gulf of Guinea; both null and empty-string must be rejected as no-geo.
  assert.equal(getEventGeo({ location: { geo: { latitude: null, longitude: null } } }), null)
  assert.equal(getEventGeo({ location: { geo: { latitude: '', longitude: '' } } }), null)
  // ...but a genuine 0 (valid coordinate) still resolves.
  assert.deepEqual(getEventGeo({ location: { geo: { latitude: 0, longitude: 0 } } }), { lat: 0, lng: 0 })
})

test('getEventGeo: null in one shape falls through to the next', () => {
  // location.geo has null lat → must fall through to flypost.geo, not bail.
  assert.deepEqual(
    getEventGeo({
      location: { geo: { latitude: null, longitude: null } },
      flypost: { geo: { latitude: 34.01, longitude: -118.49 } },
    }),
    { lat: 34.01, lng: -118.49 }
  )
})
