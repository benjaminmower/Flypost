# Two-Layer North Star: Strategy & Enforcement

## Overview

The Flypost v4 architecture enforces a clear separation between **Layer 1 (Registry)** and **Layer 2 (Intelligence)** at runtime to ensure that machine-to-machine discovery surfaces remain pure registry data without any intelligence leakage.

## The Two Layers

### Layer 1: Registry (Discovery)
**Purpose:** Provide basic, factual event information for discovery and listing.

**Data includes:**
- Event identifiers (`eventId`, `eventIdentity`)
- Category and classification
- Temporal data (dates, times)
- Location data (address, coordinates)
- Basic descriptive information (name, description)
- Submission metadata

**API Surface:** `/v1/events/near` and other discovery endpoints

### Layer 2: Intelligence
**Purpose:** Collect and analyze attendance, engagement, sentiment, and other derived insights.

**Data includes:**
- Attendance tracking (`attendance`, `attendees`, `presenceProof`)
- Buyer tokens and verification data
- Feedback and sentiment analysis
- Brokerage-specific intelligence
- Derived insights and analytics

**API Surface:** Separate intelligence endpoints (future implementation)

## Runtime Enforcement Mechanisms

### 1. Discovery V1 Contract

The `/v1/events/near` endpoint returns a versioned, registry-safe response contract:

```javascript
{
  success: true,
  schemaVersion: "discovery.v1",
  events: [/* DiscoveryEventV1[] */],
  meta: {
    count: 42,
    radiusKm: 10
  }
}
```

**Contract guarantees:**
- `schemaVersion` indicates the contract version
- `events` array contains only `DiscoveryEventV1` objects
- No Layer 2 data can appear in the response

### 2. Allowlist Mapper

The `discoveryMapper.js` utility implements a strict allowlist that converts stored event objects to the `DiscoveryEventV1` format.

**Implementation:** `backend/src/utils/discoveryMapper.js`

**Key functions:**
- `toDiscoveryEventV1(event)` - Maps a single event to Discovery V1 format
- `toDiscoveryEventsV1(events)` - Maps an array of events
- `computeEventIdentity(event)` - Computes event identity with fallbacks

**Allowlisted fields:**
```javascript
{
  eventId: string,           // Required
  eventIdentity: string,     // Required (computed if missing)
  category: string,          // Default: "open_house"
  startDate: string,         // ISO 8601 timestamp
  endDate: string,           // ISO 8601 timestamp
  name: string,              // Optional
  description: string,       // Optional, truncated to 500 chars
  address: {                 // Structured address
    streetAddress: string,
    addressLocality: string,
    addressRegion: string,
    postalCode: string,
    addressCountry: string
  },
  geo: {                     // Optional coordinates
    latitude: number,
    longitude: number
  },
  submissionTimestamp: string,  // Optional metadata
  updateCount: number           // Optional metadata
}
```

**Safety features:**
- Description truncation to 500 characters (prevents abuse)
- Structured address fields (consistent format)
- Null/undefined handling throughout

### 3. Runtime Anti-Drift Sanitizer

The `sanitizer.js` utility provides a fail-safe mechanism that recursively strips forbidden keys from responses.

**Implementation:** `backend/src/utils/sanitizer.js`

**Behavior:**
- **Strip:** Remove forbidden keys recursively
- **Warn:** Log warnings when drift is detected
- **Continue:** Never fail the request (availability over purity)

**Forbidden keys:**
```javascript
// Explicit forbidden keys
'attendance', 'attendees', 'buyerToken', 'presenceProof',
'feedback', 'sentiment', 'insights', 'brokerageAffiliation'

// Pattern-based forbidden keys
'intelligence*' (any key starting with 'intelligence')
```

**Example output when drift detected:**
```
⚠️  DRIFT DETECTED: Stripped 3 forbidden key(s) from discovery response:
response.events[0].attendance, response.events[1].feedback, response.events[2].sentiment
```

### 4. Processing Pipeline

The `/v1/events/near` endpoint applies both mechanisms:

```javascript
// 1. Retrieve raw events from storage
const events = await getEventsNear(latitude, longitude, radius, useFirestore)

// 2. Apply brokerage filtering (if needed)
let filteredEvents = applyBrokerageFilter(events, brokerageId)

// 3. Map to Discovery V1 format (allowlist)
const discoveryEvents = toDiscoveryEventsV1(filteredEvents)

// 4. Build versioned response
let response = {
  success: true,
  schemaVersion: 'discovery.v1',
  events: discoveryEvents,
  meta: { count: discoveryEvents.length, radiusKm: radius }
}

// 5. Apply runtime sanitizer (defense in depth)
response = sanitizeDiscoveryResponse(response)

// 6. Return to client
res.json(response)
```

## Why This Enforces the Two-Layer North Star

### Defense in Depth
The two-mechanism approach provides layered protection:
1. **Primary defense (allowlist mapper):** Only explicitly permitted fields pass through
2. **Secondary defense (sanitizer):** Catches any drift or bugs that might leak forbidden data

### Fail-Safe Philosophy
- **Never fail requests** due to drift detection
- **Always log warnings** so drift can be investigated
- **Strip and continue** to maintain service availability

### Future-Proof Design
- New Layer 2 fields are automatically forbidden (intelligence* pattern)
- Schema versioning allows for future API evolution
- Clear separation enables independent scaling of layers

### Developer Experience
- Clear contract makes integration predictable
- Warnings in logs enable rapid debugging
- Tests validate guardrails work correctly

## Testing

The `test-discovery-v1.js` suite validates all enforcement mechanisms:

1. **Schema version presence:** Confirms `schemaVersion: "discovery.v1"` in responses
2. **Required fields:** Validates `eventId` and `eventIdentity` are present
3. **Description truncation:** Ensures safety limits are enforced
4. **Forbidden key detection:** Tests the sanitizer correctly identifies Layer 2 keys
5. **Drift protection:** Confirms forbidden keys are stripped even if present
6. **Allowlist mapping:** Validates only permitted fields pass through

**Run tests:**
```bash
cd backend
node test-discovery-v1.js
```

## Migration Notes

### Backward Compatibility
The Discovery V1 contract is a **breaking change** for clients expecting the old response format.

**Old format:**
```javascript
{
  success: true,
  data: {
    events: [...],
    total: 42,
    query: {...},
    brokerageId: "...",
    source: "Firestore",
    note: "..."
  }
}
```

**New format (Discovery V1):**
```javascript
{
  success: true,
  schemaVersion: "discovery.v1",
  events: [...],  // DiscoveryEventV1[] only
  meta: {
    count: 42,
    radiusKm: 10
  }
}
```

### Migration Path
1. Update client applications to consume the new contract
2. Remove dependencies on old `data.total`, `data.source`, `data.note` fields
3. Use `meta.count` instead of `data.total`
4. Expect only Discovery V1 fields in `events[]` array

## Future Enhancements

### Intelligence Layer Endpoints
When Layer 2 is implemented, it will use separate endpoints:
- `/v1/intelligence/attendance` - Attendance tracking
- `/v1/intelligence/feedback` - Feedback and sentiment
- `/v1/intelligence/insights` - Derived analytics

These endpoints will **never** share response contracts with Discovery endpoints.

### Schema Evolution
Future versions (discovery.v2, discovery.v3) can be introduced without breaking existing clients by maintaining the `schemaVersion` field.

## Conclusion

The Two-Layer North Star enforcement provides:
- ✅ **Clear separation** between Registry and Intelligence
- ✅ **Runtime guardrails** that prevent data leakage
- ✅ **Fail-safe design** that maintains availability
- ✅ **Future-proof architecture** for scaling both layers independently
- ✅ **Developer confidence** through comprehensive testing

This architectural decision ensures Flypost v4 can evolve both layers independently while maintaining a clean, predictable machine-to-machine discovery surface.
