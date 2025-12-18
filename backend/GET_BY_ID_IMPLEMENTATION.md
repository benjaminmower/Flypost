# GET /v1/events/{event_id} Implementation

## Overview
This document describes the implementation of Firestore-backed event retrieval for the Discovery API's get-by-id endpoint.

## Problem Fixed
Previously, `GET /v1/events/{event_id}` only checked the in-memory store, causing 404s for events that existed in Firestore. This was particularly problematic after cold starts in production.

## Solution
Implemented hybrid storage with Firestore-first retrieval and memory fallback.

## Architecture

### Flow Diagram
```
Client Request
    ↓
Proxy (cloudrun-proxy.js) - forwards /v1/events/:event_id
    ↓
Server (server.js) - GET /v1/events/:event_id handler
    ↓
Storage (storage.js) - getEventByIdAny(eventId, useFirestore)
    ↓
    ├─→ Firestore (firestoreClient.js) - getEventByIdFromFirestore()
    │       ↓
    │   [Event found] → Return event
    │       ↓
    │   [Not found] → Try memory
    │
    └─→ Memory Store (eventStore Map)
            ↓
        [Event found] → Return event
            ↓
        [Not found] → Return null (404)
```

### Key Components

#### 1. firestoreClient.js
**New Function**: `getEventByIdFromFirestore(eventId)`
- Fetches event directly by document ID
- Returns null if Firestore is disabled or event not found
- Strips internal `_firestoreMetadata` from response
- Safe destructuring: `const { _firestoreMetadata, ...eventData } = data || {}`

#### 2. storage.js
**New Function**: `getEventByIdAny(eventId, useFirestore)`
- Hybrid getter with Firestore-first strategy
- Falls back to memory if Firestore query fails
- Maintains backward compatibility

**Existing Function**: `getEventById(eventId)` - unchanged
- Memory-only retrieval
- Still used by other parts of the codebase

#### 3. server.js
**Updated Handler**: `GET /v1/events/:event_id`
- Changed from: `event = getEventById(event_id)`
- Changed to: `event = await getEventByIdAny(event_id, useFirestore)`
- All other behavior unchanged (access tiers, brokerage isolation, sanitization)

#### 4. cloudrun-proxy.js
**Existing Route**: `app.get('/v1/events/:event_id', forward)` (line 77)
- No changes needed - route already exists

## Testing

### Unit Tests
Run: `node backend/test-get-by-id.js`

Tests:
1. Returns null for non-existent events
2. Detects Firestore configuration
3. Memory fallback works correctly

### Manual Testing

#### 1. Start Server
```bash
cd backend
npm start
```

#### 2. Create Test Event
```bash
curl -X POST http://localhost:3001/api/test-add-event \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Event",
    "category": "open-houses",
    "description": "Testing get-by-id",
    "startDate": "2025-01-20T14:00:00Z",
    "streetAddress": "123 Test St",
    "city": "Los Angeles",
    "state": "CA",
    "postalCode": "90001",
    "latitude": 34.0522,
    "longitude": -118.2437,
    "organizer": "Test Agent",
    "email": "test@example.com"
  }'
```

#### 3. Get Event by ID
```bash
# Replace EVENT_ID with the eventId from step 2
curl http://localhost:3001/v1/events/EVENT_ID | python3 -m json.tool
```

Expected Response (200):
```json
{
  "success": true,
  "schemaVersion": "discovery.v1",
  "event": {
    "eventId": "evt_...",
    "eventIdentity": "...",
    "category": "open-houses",
    "name": "Test Event",
    "startDate": "2025-01-20T14:00:00Z",
    "address": {...},
    "geo": {...}
  },
  "meta": {
    "accessTier": "public"
  }
}
```

#### 4. Test 404
```bash
curl http://localhost:3001/v1/events/evt_nonexistent_12345 | python3 -m json.tool
```

Expected Response (404):
```json
{
  "success": false,
  "error": "Event not found",
  "eventId": "evt_nonexistent_12345"
}
```

## Deployment

### Environment Variables
No new environment variables required. Uses existing Firestore configuration:
- `GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT` - enables Firestore
- `FIRESTORE_EMULATOR_HOST` - for local development

### Firestore Configuration
Events are stored with document ID = `flypost.eventId`

Example:
```
Firestore Collection: events
Document ID: evt_20250120_abc123
Document Data: { full event object }
```

### Production Behavior
- **Firestore Enabled**: Checks Firestore first, falls back to memory
- **Firestore Disabled**: Uses memory-only (dev mode)

## Verification Checklist

After deployment, verify:
- [ ] GET /v1/events/{event_id} returns 200 for existing events
- [ ] GET /v1/events/{nonexistent} returns 404
- [ ] Response matches Discovery V1 format (check openapi.yaml)
- [ ] No Layer-2 fields leaked (brokerageId, hash, storedAt, _firestoreMetadata)
- [ ] Sanitization applied (check logs for sanitizer messages)
- [ ] Access tier logic working (public vs brokerage)
- [ ] Proxy forwards requests correctly

## Troubleshooting

### Event returns 404 but exists in Firestore
1. Check Firestore is enabled: `isFirestoreEnabled()` should return true
2. Verify document ID matches: Document ID must equal `flypost.eventId`
3. Check logs for Firestore errors
4. Verify GOOGLE_CLOUD_PROJECT environment variable is set

### Memory fallback not working
1. Check logs for "Firestore getEventById failed, falling back to memory"
2. Verify event exists in memory store
3. Check memory store size: GET /api/stats

### Performance Issues
The hybrid getter adds one Firestore query per get-by-id request. This is acceptable for the Discovery API's read-only use case, but consider:
- Adding caching layer for high-traffic scenarios
- Monitoring Firestore read costs
- Using memory store for frequently accessed events

## Security

### CodeQL Scan
✅ 0 vulnerabilities found

### Sanitization
- Uses existing `toDiscoveryEventV1()` mapper
- Applies `sanitizeDiscoveryResponse()` runtime sanitizer
- No Layer-2 fields exposed in public API

## Related Files
- `/backend/src/firestoreClient.js` - Firestore operations
- `/backend/src/storage.js` - Storage abstraction layer
- `/backend/src/server.js` - API handlers
- `/proxy/cloudrun-proxy.js` - Proxy configuration
- `/frontend_ask/public/openapi.yaml` - API specification
- `/backend/test-get-by-id.js` - Test script
