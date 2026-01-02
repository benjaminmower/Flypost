# Flypost v4 Event Model

## Overview

The Flypost v4 Event Model is a minimal JSON-LD structure based on Schema.org's Event type with essential Flypost extensions. This model focuses on the core fields needed for the parse → publish → query loop.

## Structure

```json
{
  "@context": "https://schema.org",
  "@type": "Event", 
  "flypost": {
    "eventId": "evt_abc123_1234567890",
    "category": "garage-sales",
    "realTimeData": true,
    "crawlable": true,
    "queryable": true,
    "submissionTimestamp": "2025-01-01T12:00:00.000Z"
  },
  "name": "Saturday Garage Sale",
  "description": "Multi-family garage sale with furniture, electronics, and household items",
  "startDate": "2025-01-04T08:00:00.000Z",
  "endDate": "2025-01-04T14:00:00.000Z",
  "location": {
    "@type": "Place",
    "name": "123 Main Street",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Main Street", 
      "addressLocality": "Springfield",
      "addressRegion": "IL",
      "postalCode": "62701",
      "addressCountry": "US"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 39.7817,
      "longitude": -89.6501
    }
  },
  "organizer": {
    "@type": "Person",
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "+1-555-0123",
    "licenseId": "DRE01234567",
    "mlsNumber": "MLS12345678"
  },
  "keywords": ["furniture", "electronics", "household"],
  "hash": {
    "algorithm": "SHA-256",
    "encoding": "hex",
    "value": "a3f8d9e7c6b5a4d3c2b1a0e9f8d7c6b5a4d3c2b1a0e9f8d7c6b5a4d3c2b1a0e9",
    "canonicalVersion": 1
  }
}
```

## Required Fields

### Core Schema.org Fields
- `@context`: Always "https://schema.org"
- `@type`: Always "Event"
- `name`: Event title (1-200 characters)
- `description`: Event description (1-2000 characters)
- `startDate`: ISO 8601 datetime
- `location`: Place object with address
- `organizer`: Person or Organization (all fields optional)

### Flypost Extensions
- `flypost.eventId`: Unique identifier (8-64 characters, alphanumeric + _ -)
  - Format: `evt_{random}_{timestamp}` (e.g., `evt_k7x9m2p4q_1641234567890`)
  - Generated using base36 random string + JavaScript timestamp
- `flypost.category`: One of predefined categories
- `flypost.realTimeData`: Boolean flag for real-time processing
- `flypost.crawlable`: Boolean flag for automated crawling
- `flypost.queryable`: Boolean flag for API access
- `flypost.submissionTimestamp`: UTC timestamp of submission
- `flypost.timezone`: IANA timezone identifier inferred from location (e.g., "America/Los_Angeles"). Used to correctly interpret timestamps for events where the raw input doesn't specify explicit timezone information.

## Optional Fields

- `endDate`: Event end datetime (**Required for `open-houses` category** to enable presence gating - can be provided at the top level OR within all occurrences if using multi-slot format)
- `occurrences`: Array of occurrence objects for multi-slot events (e.g., open houses with multiple time windows). Each occurrence has:
  - `occurrenceId`: Stable identifier (hash of canonicalKey + startDate + endDate)
  - `startDate`: Start time in UTC ISO 8601
  - `endDate`: End time in UTC ISO 8601
  - `label`: Optional human-readable label (e.g., "Saturday Morning")
- `location.name`: Friendly location name
- `location.geo`: Latitude/longitude coordinates (**Required for publishing** - events without geo coordinates will be rejected at publish time to prevent false-positive presence matches. If not provided in natural language input, the system will attempt automatic geocoding.)
- `organizer.@type`: "Person" or "Organization" (defaults to "Person" if not specified)
- `organizer.name`: Organizer name
- `organizer.email`: Contact email address
- `organizer.phone`: Contact phone number (preferred field, stored verbatim)
- `organizer.telephone`: Deprecated - use `phone` instead. Legacy field retained for backward compatibility.
- `organizer.licenseId`: Real estate agent license ID or similar
- `organizer.mlsNumber`: MLS listing number
- `keywords`: Array of tags/keywords
- `hash`: Cryptographic hash object for data integrity and DLT anchoring
  - `hash.algorithm`: "SHA-256"
  - `hash.encoding`: "hex"
  - `hash.value`: 64-character hexadecimal hash
  - `hash.canonicalVersion`: Integer version of canonical representation (currently 1)
  - Note: Hash is computed by the backend after validation, not by the LLM parser

**Note**: The organizer object supports `additionalProperties: true`, allowing arbitrary additional fields for future extensibility.

## Categories

- `apartments`: Rental listings
- `garage-sales`: Garage/yard sales
- `open-houses`: Real estate open houses  
- `job-postings`: Employment opportunities
- `live-events`: Concerts, performances, shows
- `community-alerts`: Public safety, notifications
- `happy-hours`: Social gatherings, networking
- `missing-pets`: Lost pet alerts

## Validation

Events are validated against the JSON Schema at `backend/schemas/flypost-event-v4.schema.json` using AJV validation.

## Timezone Handling

Flypost v4 uses offline timezone inference to ensure accurate timestamp interpretation:

1. **Timezone Inference**: When an event is published, the system infers the IANA timezone from `location.geo` coordinates using an offline library (no network calls, no API costs).

2. **Explicit Override Rule** (for `open-houses` category):
   - If raw input text contains explicit timezone markers (ISO Z/offset, or named markers like PT, PST, EDT), timestamps are honored as-is.
   - If raw input text does NOT contain explicit timezone markers, LLM-provided timestamps are reinterpreted as local wall-clock times in the inferred timezone, even if the LLM included 'Z'.

3. **Fallback Policy**: If timezone cannot be inferred and timestamps lack explicit timezone info, the publish request is rejected with a clear error message.

4. **Cache**: Timezone lookups are cached in memory (keyed by lat/lng rounded to 3 decimals) for performance.

## Multi-Slot Events (Occurrences)

Events can have multiple time slots (e.g., an open house on both Saturday and Sunday):

1. **Structure**: Multi-slot events use the `flypost.occurrences[]` array, where each occurrence has:
   - Stable `occurrenceId` (SHA-1 hash of canonicalKey + startDate + endDate)
   - UTC `startDate` and `endDate`
   - Optional descriptive `label`

2. **Top-level Compatibility**: For backward compatibility, top-level `startDate` and `endDate` are set to the next upcoming occurrence (or most recent past occurrence if all are past).

3. **Presence Gating**: The `/v1/presence/check-in` endpoint validates against any active occurrence window and stores the matched `occurrenceId` on the attendance record.

4. **Update Semantics**: When updating an event, the occurrences array is replaced atomically with the new set.

## Validation

Events are validated against the JSON Schema at `backend/schemas/flypost-event-v4.schema.json` using AJV validation.

## Example Usage

The LLM parser converts natural language like:

```
"Garage sale Saturday 8am-2pm at 123 Main St, Springfield IL. Selling furniture and electronics. Contact John at john@example.com"
```

Into the structured JSON-LD format above.