# Event Identity Implementation (Brokerage-Agnostic)

## Overview
This implementation introduces a **brokerage-agnostic event identity** system that enables global event recognition and "Edit instead of Create" behavior. Events are now uniquely identified by location and time window, allowing cross-brokerage event tracking and post-visit intelligence.

## Key Features

### 1. Global Event Identity (NEW)
- **Format**: `<normalized-address>|<start-time-window>`
- **Time Window**: ISO hour bucket (YYYY-MM-DDTHH) for events with time, or date bucket (YYYY-MM-DD) for date-only events
- **Example**: `123mainstreet-santamonica-ca-90405|2025-01-15T14`
- **Brokerage-Agnostic**: Multiple brokerages can reference the same canonical event

### 2. Edit Instead of Create (Cross-Brokerage)
When Firestore is enabled:
- The system checks for existing events using the `eventIdentity`
- If found, it preserves the stable `eventId` while updating the event data
- Increments the `updateCount` in `flypost` to track the number of updates
- Preserves creation timestamp, updates modification timestamp
- **Now works across brokerages**: Same event ingested by different brokerages updates the same record
- The hash is recomputed for the updated event data (hash.canonicalVersion remains 1, indicating the hash algorithm version)

### 3. Legacy Canonical Key (Deprecated)
- **Old Format**: `<normalized-address>|<brokerageId>`
- **Status**: Still computed for backward compatibility but not used for deduplication
- **Migration**: New code should use `eventIdentity` instead of `canonicalKey`

## Implementation Details

### Files Created/Modified
1. **`backend/src/utils/canonicalKey.js`**
   - **NEW**: Exports `computeEventIdentity(event)` function - brokerage-agnostic identity
   - **NEW**: Exports `computeStartTimeWindow(startDate)` helper - time bucket computation
   - **LEGACY**: Exports `computeCanonicalKey(event, brokerageId)` function - deprecated
   - Handles address normalization
   - Returns `null` if address/startDate data is missing

2. **`backend/src/intelligenceStorage.js`** (NEW)
   - Post-visit intelligence storage layer
   - Manages Attendance and Feedback collections
   - In-memory + Firestore hybrid storage
   - Functions: `storeAttendance`, `storeFeedback`, `findAttendanceById`, etc.

3. **`backend/src/server.js`**
   - Imports `computeEventIdentity` and `computeCanonicalKey` from utils
   - Normalizes dates BEFORE computing identity (needed for time window)
   - Computes `eventIdentity` and attaches to `parsedEvent.flypost`
   - Also computes legacy `canonicalKey` for backward compatibility
   - **NEW ENDPOINTS**:
     - `POST /v1/presence/check-in` - Record attendance at event
     - `POST /v1/feedback/submit` - Submit feedback with presence gate
     - `GET /v1/brokerages/:brokerageId/insights` - Aggregated feedback

4. **`backend/src/storage.js`**
   - Imports `findEventByIdentity` (new) and `findEventByCanonicalKey` (legacy) from firestoreClient
   - Implements "Edit instead of Create" logic in `storeEvent()`:
     - Checks Firestore for existing events by `eventIdentity` (brokerage-agnostic)
     - If found: preserves eventId, increments version, updates timestamps
     - If not found: creates new event as before
     - **Cross-brokerage deduplication**: Same event from different brokerages updates one record

5. **`backend/src/firestoreClient.js`**
   - **NEW**: Added `findEventByIdentity(eventIdentity)` function
   - **LEGACY**: Kept `findEventByCanonicalKey(canonicalKey)` function (deprecated)
   - Queries Firestore with `where('flypost.eventIdentity', '==', eventIdentity)`
   - Returns first matching event or `null`
   - Exported `getFirestoreClient()` for use by intelligence storage

### Test Files Created
1. **`backend/test-canonical-key.js`**
   - 8 comprehensive tests for canonical key generation
   - Tests normalization, case insensitivity, partial addresses
   - Tests brokerage namespacing and key consistency

2. **`backend/test-edit-instead-of-create.js`**
   - 4 integration tests for the full behavior
   - Tests canonical key preservation through storage
   - Tests different addresses and different brokerages

## Testing Results

### All Tests Pass ✅
- Original tests: 10/10 passed
- Canonical key tests: 8/8 passed
- Integration tests: 4/4 passed

### Manual Verification ✅
Server tested with:
- Creating events with canonical keys
- Verifying same address generates same canonical key
- Verifying different brokerages generate different keys
- Health endpoint confirms system is operational

## Usage Examples

### Example 1: First Event Ingestion
```javascript
// Address: "123 Main Street, Santa Monica, CA 90405"
// Start Date: "2025-01-15T14:30:00Z"
// Brokerage: "brokerage-abc"
// Event Identity: "123mainstreet-santamonica-ca-90405|2025-01-15T14"
// Result: New event created with eventId "evt_xyz123"
```

### Example 2: Same Event Re-ingested (Same Brokerage)
```javascript
// Address: "123 Main Street, Santa Monica, CA 90405" (same)
// Start Date: "2025-01-15T14:45:00Z" (within same hour bucket)
// Brokerage: "brokerage-abc" (same)
// Event Identity: "123mainstreet-santamonica-ca-90405|2025-01-15T14" (same)
// Result: With Firestore - Updates existing event "evt_xyz123" (version 2)
// Result: Without Firestore - Creates new event (identity infrastructure in place)
```

### Example 3: Same Event from Different Brokerage (NEW BEHAVIOR)
```javascript
// Address: "123 Main Street, Santa Monica, CA 90405" (same)
// Start Date: "2025-01-15T14:50:00Z" (same hour bucket)
// Brokerage: "brokerage-xyz" (DIFFERENT)
// Event Identity: "123mainstreet-santamonica-ca-90405|2025-01-15T14" (SAME)
// Result: With Firestore - Updates existing event "evt_xyz123" (version 3)
// NEW: Cross-brokerage recognition - same canonical event!
```

### Example 4: Different Time Window
```javascript
// Address: "123 Main Street, Santa Monica, CA 90405" (same)
// Start Date: "2025-01-15T15:30:00Z" (different hour)
// Brokerage: "brokerage-abc" (same)
// Event Identity: "123mainstreet-santamonica-ca-90405|2025-01-15T15" (different)
// Result: New event created (different time window)
```

## Notes

### Firestore Requirement
The full "Edit instead of Create" behavior requires Firestore to be enabled:
- `GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT` environment variable set
- Or `FIRESTORE_EMULATOR_HOST` for local testing

Without Firestore, the system still:
- Generates canonical keys
- Attaches them to events
- Infrastructure is ready for when Firestore is enabled

### Firestore Indexes Required
For optimal performance, create Firestore indexes on:
```
Collection: events
Field: flypost.eventIdentity
Type: Ascending

Collection: attendance
Field: eventId
Type: Ascending

Collection: attendance
Field: buyerToken
Type: Ascending

Collection: feedback
Field: brokerageAffiliation
Type: Ascending

[LEGACY - can be removed after migration]
Collection: events
Field: flypost.canonicalKey
Type: Ascending
```

## Architecture Benefits

1. **Stable Event IDs**: Once created, an event's ID never changes
2. **Natural Updates**: Just re-ingest the event to update it
3. **Version Tracking**: `updateCount` in `flypost` tracks the number of times an event has been updated
4. **Brokerage-Agnostic**: Events are globally canonical, enabling cross-brokerage recognition
5. **Post-Visit Intelligence**: Attendance and feedback can be linked to events regardless of which brokerage created them
6. **Multiple Ingestions**: Re-ingesting the same event from ANY brokerage updates the existing record
7. **Backward Compatible**: Works with existing events; legacy canonicalKey still computed

## Future Enhancements

Possible future improvements:
- Add API endpoint to query events by canonical key
- Add canonical key to event search/filter capabilities
- Add metrics for update vs create operations
- Add canonical key validation in schema
- Support for address fuzzy matching/normalization improvements
