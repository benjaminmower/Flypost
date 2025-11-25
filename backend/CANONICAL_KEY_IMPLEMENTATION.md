# Canonical Key Implementation

## Overview
This implementation introduces a **canonical key** system for event ingestion that enables "Edit instead of Create" behavior. When an event with the same address and brokerage ID is ingested again, it will update the existing event rather than creating a duplicate.

## Key Features

### 1. Deterministic Canonical Keys
- **Format**: `<normalized-address>|<brokerageId>`
- **Normalization**: Lowercase, removes special characters, preserves only alphanumeric characters
- **Example**: `123mainstreet-santamonica-ca-90405|test-brokerage-123`

### 2. Edit Instead of Create
When Firestore is enabled:
- The system checks for existing events using the canonical key
- If found, it preserves the stable `eventId` while updating the event data
- Increments the `canonicalVersion` in the hash
- Preserves creation timestamp, updates modification timestamp

### 3. Brokerage Isolation
- The canonical key includes the `brokerageId` to namespace uniqueness
- Same address with different brokerages creates separate events
- Ensures multi-tenant isolation

## Implementation Details

### Files Created
1. **`backend/src/utils/canonicalKey.js`**
   - Exports `computeCanonicalKey(event, brokerageId)` function
   - Handles address normalization
   - Returns `null` if address data is missing

### Files Modified
1. **`backend/src/server.js`**
   - Imports `computeCanonicalKey` from utils
   - Computes canonical key after LLM parsing (step 1.5)
   - Attaches canonical key and brokerageId to `parsedEvent.flypost`
   - Updated test-add-event endpoint to include canonical key

2. **`backend/src/storage.js`**
   - Imports `findEventByCanonicalKey` from firestoreClient
   - Implements "Edit instead of Create" logic in `storeEvent()`:
     - Checks Firestore for existing events by canonical key
     - If found: preserves eventId, increments version, updates timestamps
     - If not found: creates new event as before

3. **`backend/src/firestoreClient.js`**
   - Added `findEventByCanonicalKey(canonicalKey)` function
   - Queries Firestore with `where('flypost.canonicalKey', '==', canonicalKey)`
   - Returns first matching event or `null`

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
// Brokerage: "brokerage-abc"
// Canonical Key: "123mainstreet-santamonica-ca-90405|brokerage-abc"
// Result: New event created with eventId "evt_xyz123"
```

### Example 2: Same Event Re-ingested
```javascript
// Address: "123 Main Street, Santa Monica, CA 90405" (same)
// Brokerage: "brokerage-abc" (same)
// Canonical Key: "123mainstreet-santamonica-ca-90405|brokerage-abc" (same)
// Result: With Firestore - Updates existing event "evt_xyz123" (version 2)
// Result: Without Firestore - Creates new event (canonical key infrastructure in place)
```

### Example 3: Different Brokerage
```javascript
// Address: "123 Main Street, Santa Monica, CA 90405" (same)
// Brokerage: "brokerage-xyz" (different)
// Canonical Key: "123mainstreet-santamonica-ca-90405|brokerage-xyz" (different)
// Result: New event created (different canonical key)
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

### Firestore Index Required
For optimal performance, create a Firestore index on:
```
Collection: events
Field: flypost.canonicalKey
Type: Ascending
```

## Architecture Benefits

1. **Stable Event IDs**: Once created, an event's ID never changes
2. **Natural Updates**: Just re-ingest the event to update it
3. **Version Tracking**: `canonicalVersion` tracks how many times updated
4. **Multi-tenant Safe**: Brokerage ID in key prevents cross-tenant conflicts
5. **Multiple ingestions**: Re-ingesting the same event updates the existing record while incrementing the version counter
6. **Backward Compatible**: Works with existing events without canonical keys

## Future Enhancements

Possible future improvements:
- Add API endpoint to query events by canonical key
- Add canonical key to event search/filter capabilities
- Add metrics for update vs create operations
- Add canonical key validation in schema
- Support for address fuzzy matching/normalization improvements
