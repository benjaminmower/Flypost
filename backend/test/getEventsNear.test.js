import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterAndSortByDistance } from '../src/storage.js'

// Origin: a point in 90405 (Santa Monica).
const ORIGIN = { lat: 34.0089, lng: -118.4716 }

function ev(id, lat, lng, shape = 'location') {
  if (lat === null) return { id } // no geo
  if (shape === 'flypost') return { id, flypost: { geo: { latitude: lat, longitude: lng } } }
  if (shape === 'where') return { id, where: { latitude: lat, longitude: lng } }
  return { id, location: { geo: { latitude: lat, longitude: lng } } }
}

test('filters out events beyond the radius', () => {
  const events = [
    ev('near', 34.010, -118.472), // ~0.2km
    ev('far', 34.20, -118.20),    // way outside 2km
  ]
  const result = filterAndSortByDistance(events, ORIGIN.lat, ORIGIN.lng, 2)
  assert.deepEqual(result.map(e => e.id), ['near'])
})

test('sorts results nearest-first (ascending _distanceKm)', () => {
  const events = [
    ev('mid', 34.015, -118.472),
    ev('closest', 34.009, -118.4717),
    ev('edge', 34.020, -118.472),
  ]
  const result = filterAndSortByDistance(events, ORIGIN.lat, ORIGIN.lng, 5)
  assert.deepEqual(result.map(e => e.id), ['closest', 'mid', 'edge'])
  // _distanceKm attached and monotonically increasing
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i]._distanceKm >= result[i - 1]._distanceKm)
  }
})

test('excludes events with no resolvable geo', () => {
  const events = [
    ev('has-geo', 34.009, -118.4717),
    ev('no-geo', null),
  ]
  const result = filterAndSortByDistance(events, ORIGIN.lat, ORIGIN.lng, 5)
  assert.deepEqual(result.map(e => e.id), ['has-geo'])
})

test('all-no-geo input yields empty result (not return-all)', () => {
  const events = [ev('a', null), ev('b', null)]
  const result = filterAndSortByDistance(events, ORIGIN.lat, ORIGIN.lng, 5)
  assert.deepEqual(result, [])
})

test('resolves flypost.geo and where shapes, not just location.geo', () => {
  const events = [
    ev('legacy', 34.009, -118.4717, 'flypost'),
    ev('mapped', 34.0095, -118.4717, 'where'),
  ]
  const result = filterAndSortByDistance(events, ORIGIN.lat, ORIGIN.lng, 5)
  assert.equal(result.length, 2)
})

test('does NOT mutate source event objects (no _distanceKm leak)', () => {
  // Regression: stored objects are shared references; attaching _distanceKm to
  // them leaks a stale, query-contextual distance into later by-id responses.
  const source = ev('shared', 34.009, -118.4717)
  const result = filterAndSortByDistance([source], ORIGIN.lat, ORIGIN.lng, 5)

  assert.equal(result.length, 1)
  assert.ok(Number.isFinite(result[0]._distanceKm), 'result carries distance')
  assert.ok(result[0] !== source, 'result is a copy, not the source reference')
  assert.equal('_distanceKm' in source, false, 'source object is left untouched')
})

test('excludes explicit-null-geo events (not coerced to 0,0)', () => {
  const events = [
    ev('real', 34.009, -118.4717),
    { id: 'nullgeo', location: { geo: { latitude: null, longitude: null } } },
  ]
  const result = filterAndSortByDistance(events, ORIGIN.lat, ORIGIN.lng, 5)
  assert.deepEqual(result.map(e => e.id), ['real'])
})
