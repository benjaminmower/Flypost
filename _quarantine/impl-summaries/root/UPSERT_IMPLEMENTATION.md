# Canonical Machine Ingestion Upsert Workflow Implementation

## Overview
Implemented the canonical structured ingestion endpoint `POST /v1/events/upsert` for machine sources (MLS, calendar, scraper, manual, LLM adapter) as specified in PR #50.

## Implementation Summary

### 1. New Endpoint: POST /v1/events/upsert

**Location**: `backend/src/server.js`

**Request Body**:
```json
{
  "event": {
    "@context": "https://schema.org",
    "@type": "Event",
    "flypost": { "category": "open-houses" },
    "name": "Event name",
    "description": "Event description",
    "startDate": "2025-01-20T14:00:00.000Z",
    "location": { /* Schema.org Place */ },
    "organizer": { /* Schema.org Person/Organization */ }
  },
  "source": {
    "sourceType": "mls",
    "sourceId": "MLS-12345"
  }
}
```

**Response**:
```json
{
  "success": true,
  "operation": "insert" | "update",
  "data": {
    "eventId": "evt_...",
    "eventIdentity": "123mainstreet-santamonica-ca-90405|2025-01-20T14",
    "updateCount": 0,
    "event": { /* Full stored event */ }
  }
}
```

### 2. North Star Enforcement

**Module**: `backend/src/utils/northStarEnforcer.js`

Strips Layer 2 (Intelligence) fields during ingestion to maintain architectural separation:

**Forbidden Fields**:
- `attendance`, `attendees`
- `buyerToken`, `presenceProof`
- `feedback`, `sentiment`
- `insights`, `brokerageAffiliation`
- Any field starting with `intelligence*`

**Behavior**: Fields are stripped silently with warnings logged to console.

### 3. Source Provenance

**Module**: `backend/src/utils/sourceProvenance.js`

Tracks event sources in `flypost.sources` array:

```json
{
  "flypost": {
    "sources": [
      {
        "sourceType": "mls",
        "sourceId": "MLS-12345",
        "addedAt": "2025-01-20T14:00:00Z"
      },
      {
        "sourceType": "scraper",
        "sourceId": "SCRAPE-789",
        "addedAt": "2025-01-20T15:00:00Z",
        "updatedAt": "2025-01-21T10:00:00Z"
      }
    ]
  }
}
```

**Features**:
- Deduplication by `sourceType + sourceId`
- Preserves `addedAt` on updates
- Adds `updatedAt` timestamp on updates
- Merges sources from existing events

**Supported Source Types**:
- `mls`: Multiple Listing Service
- `calendar`: Calendar integration
- `scraper`: Web scraper
- `manual`: Manual entry
- `llm`: LLM adapter
- `api`: External API

### 4. Event Enrichment

**Module**: `backend/src/utils/eventEnrichment.js`

Shared utilities for enriching events with server-side metadata:

**Functions**:
- `generateEventId()`: Creates unique event IDs
- `enrichEventMetadata()`: Sets eventIdentity, eventId, timestamps, defaults
- `normalizeEventDates()`: Converts dates to ISO format

**Server Authority**: Always sets/overwrites:
- `flypost.eventIdentity`: Brokerage-agnostic identity
- `flypost.eventId`: Unique identifier (generated on insert, preserved on update)
  - **INSERT**: Server ALWAYS generates new eventId, ignoring any client-supplied value
  - **UPDATE**: Server preserves existing eventId from storage
  - Client/LLM-supplied eventIds are stripped at API boundaries for security
- `flypost.submissionTimestamp`: Current timestamp
- `flypost.updateCount`: Increment on update
- `flypost.realTimeData`, `flypost.crawlable`, `flypost.queryable`: Defaults if missing

### 5. Storage Enhancements

**Module**: `backend/src/storage.js`

**New Function**: `findEventByIdentity(eventIdentity)`
- Checks both in-memory store and Firestore
- Returns existing event or null
- Used for upsert detection

**Updated Function**: `storeEvent(eventData)`
- Now checks both memory and Firestore (not just Firestore)
- Handles upsert by eventIdentity automatically

### 6. LLM Adapter Integration

**Updated**: `POST /api/parse-and-publish` endpoint

**Changes**:
- Now uses shared `enrichEventMetadata()` utility
- Tracks source provenance: `{ sourceType: 'llm', sourceId: 'parse-and-publish' }`
- Uses same upsert logic via `storeEvent()`
- Preserves existing response shape
- Maintains all existing behavior (price enforcement, validation, etc.)

### 7. Comprehensive Tests

**File**: `backend/test-upsert-endpoint.js`

**Test Coverage**:
1. ✅ **Insert Path**: Verifies operation="insert", eventIdentity set, updateCount=0
2. ✅ **Update Path**: Verifies operation="update", eventId preserved, updateCount incremented, sources merged
3. ✅ **North Star Enforcement**: Verifies forbidden fields stripped
4. ✅ **Validation**: Verifies AJV validation rejects invalid events
5. ✅ **Source Deduplication**: Verifies duplicate sources deduped correctly

**Results**: 5/5 tests passing ✅

### 8. Documentation

**Updated Files**:
- `docs/api-specification.md`: Complete endpoint documentation with request/response examples
- `docs/strategy-shift.md`: North Star enforcement rules and source provenance behavior

## Key Design Decisions

### 1. Upsert by eventIdentity
Events are uniquely identified by location + time window, not by eventId:
- **Format**: `<normalized-address>|<start-time-window>`
- **Example**: `123mainstreet-santamonica-ca-90405|2025-01-20T14`
- **Benefits**: Cross-brokerage event recognition, prevents duplicates

### 2. Server-Side Authority
The server always controls identity and metadata fields:
- **EventId Generation**: Server ALWAYS generates new eventId on insert
  - Client/LLM-supplied eventIds are ignored and stripped at API boundaries
  - Prevents eventId reuse across distinct events
  - Update operations preserve the original server-generated eventId
- Prevents clients from manipulating updateCount
- Ensures consistent eventIdentity computation
- Maintains data integrity and prevents overwrites

### 3. Hybrid Storage Support
Both in-memory and Firestore modes work seamlessly:
- In-memory: For tests and development
- Firestore: For production with persistence
- `findEventByIdentity()` checks both stores

### 4. Architectural Separation
Layer 1 (Discovery) and Layer 2 (Intelligence) are strictly separated:
- Layer 1 (Events): Ingested via `/v1/events/upsert` and `/api/parse-and-publish`
- Layer 2 (Intelligence): Collected via `/v1/presence/check-in` and `/v1/feedback/submit`
- Prevents bypassing presence gates

## Testing Results

### Unit Tests
- ✅ 5/5 upsert endpoint tests passing
- ✅ 8/8 event identity tests passing
- ✅ 8/8 schema flexibility tests passing

### Security
- ✅ CodeQL scan: 0 vulnerabilities

### Code Review
- ✅ All feedback addressed:
  - Fixed duplicate logic in source handling
  - Consistent property naming (addedAt/updatedAt)
  - Added JSDoc documentation

## Migration Notes

### For Existing Code
- Events now use `eventIdentity` for deduplication (not `canonicalKey`)
- `canonicalKey` still computed for backward compatibility
- Both `findEventByIdentity` and `findEventByCanonicalKey` available during transition

### For New Integrations
1. Use `POST /v1/events/upsert` for structured data ingestion
2. Always provide full event objects (PUT-style, not PATCH)
3. Include source information: `{ sourceType, sourceId }`
4. Do NOT include Layer 2 fields - they will be stripped

## API Examples

### Insert New Event
```bash
curl -X POST http://localhost:3001/v1/events/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "@context": "https://schema.org",
      "@type": "Event",
      "flypost": { "category": "open-houses" },
      "name": "Beautiful 3BR Open House",
      "description": "Stunning renovated home",
      "startDate": "2025-01-20T14:00:00.000Z",
      "location": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "123 Main Street",
          "addressLocality": "Santa Monica",
          "addressRegion": "CA",
          "postalCode": "90405"
        }
      },
      "organizer": {
        "@type": "Person",
        "name": "Jane Smith",
        "email": "jane@example.com"
      }
    },
    "source": {
      "sourceType": "mls",
      "sourceId": "MLS-12345"
    }
  }'
```

### Update Existing Event
Same request as above - if an event with the same location and time window exists, it will be updated instead of creating a duplicate.

## Future Enhancements

### Potential Improvements
1. **Batch Upsert**: Support upserting multiple events in a single request
2. **Partial Updates**: Add PATCH-style endpoint for updating specific fields
3. **Source Validation**: Validate sourceType against whitelist
4. **Rate Limiting**: Per-source rate limits
5. **Audit Trail**: Track all changes to events with full history

### Performance Optimizations
1. **Caching**: Add cache layer for eventIdentity lookups
2. **Batch Processing**: Queue upserts for high-volume scenarios
3. **Indexing**: Add Firestore composite indexes for common queries

## Conclusion

The canonical machine ingestion upsert workflow is fully implemented, tested, and documented. The implementation:

✅ Meets all requirements from the problem statement
✅ Maintains backward compatibility with existing code
✅ Passes all tests (unit, integration, security)
✅ Addresses all code review feedback
✅ Includes comprehensive documentation
✅ Follows North Star architecture (Layer 1/Layer 2 separation)

The system is ready for production use with both in-memory and Firestore storage modes.
