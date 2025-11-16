# Flypost v4 API Specification

## Overview

Flypost v4 is a minimal event ingestion and query API designed for machine-to-machine communication. This document formalizes the API contracts, data structures, and design decisions that comprise the v4 specification.

**Base URL**: `http://localhost:3001` (development)  
**API Version**: v4.0.0-mvp  
**Content-Type**: `application/json`

---

## Decision 1: Initial API Direction & Goals

### Core Principles
- **Minimal Surface Area**: Only essential endpoints for parse → publish → query loop
- **Machine-First**: Designed for LLM agents and automated systems  
- **JSON-LD Compliance**: Event data follows Schema.org Event type with Flypost extensions
- **Stateless**: Each request is independent, no session management

### Success Metrics
- Single natural language input → structured event output
- Sub-second parse and publish response times
- Schema-validated event storage and retrieval

---

## Decision 2: Event Ingest Shape & Normalization

### Input Format
Natural language text describing an event:
```
"Garage sale Saturday 8am-2pm at 123 Main St, Springfield IL. Selling furniture and electronics. Contact John at john@example.com"
```

### Normalization Process
1. **LLM Parse**: OpenAI GPT-4 extracts structured data
2. **Schema Validation**: AJV validates against JSON Schema
3. **Enrichment**: Add submission timestamp, generate eventId
4. **Hash Computation**: SHA-256 hash of canonical event representation
5. **Storage**: Store validated event object with hash to Firestore and memory

### Transformation Rules
- Dates/times → ISO 8601 format
- Addresses → Schema.org PostalAddress structure
- Categories → Controlled vocabulary (8 predefined types)
- Coordinates → Optional GeoCoordinates if inferable
- Hash → SHA-256 hex digest of canonical JSON (algorithm: SHA-256, encoding: hex, canonicalVersion: 1)

---

## Decision 3: /v1/events/near Endpoint Contract

### Endpoint
```
GET /v1/events/near
```

### Query Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `lat` | number | No | null | Latitude coordinate |
| `lng` | number | No | null | Longitude coordinate |
| `radius` | number | No | 10 | Search radius in kilometers |

### Response Format
```json
{
  "success": true,
  "data": {
    "events": [/* Event objects */],
    "total": 42,
    "query": {
      "lat": 39.7817,
      "lng": -89.6501,
      "radius": 10
    },
    "note": "MVP implementation returns all events - geospatial filtering not yet implemented"
  }
}
```

### Current Implementation
- **MVP**: Returns all events regardless of location parameters
- **Future**: Will implement actual geospatial filtering using coordinate distance

---

## Decision 4: Minimal Event Object Shape & JSON-LD Surface

### Schema Structure
Events follow Schema.org Event type with Flypost extensions:

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "flypost": {
    "eventId": "evt_abc123_1641234567890",
    "category": "garage-sales", 
    "realTimeData": true,
    "crawlable": true,
    "queryable": true,
    "submissionTimestamp": "2025-01-01T12:00:00.000Z"
  },
  "name": "Saturday Garage Sale",
  "description": "Multi-family garage sale with furniture and electronics",
  "startDate": "2025-01-04T08:00:00.000Z",
  "location": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Main Street",
      "addressLocality": "Springfield",
      "addressRegion": "IL",
      "postalCode": "62701",
      "addressCountry": "US"
    }
  },
  "organizer": {
    "@type": "Person",
    "name": "John Smith",
    "email": "john@example.com"
  }
}
```

### JSON-LD Context
- **@context**: Always "https://schema.org"
- **@type**: Always "Event" 
- **Nested Types**: Place, PostalAddress, GeoCoordinates, Person/Organization

---

## Decision 5: Stable Field Table

### Required Fields
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `@context` | string | = "https://schema.org" | JSON-LD context |
| `@type` | string | = "Event" | Schema.org type |
| `flypost.eventId` | string | 8-64 chars, [a-zA-Z0-9_-] | Unique identifier |
| `flypost.category` | enum | 8 predefined values | Event category |
| `flypost.realTimeData` | boolean | default: true | Real-time flag |
| `flypost.crawlable` | boolean | default: true | Crawling flag |
| `flypost.queryable` | boolean | default: true | Query flag |
| `flypost.submissionTimestamp` | string | ISO 8601 | Submission time |
| `name` | string | 1-200 chars | Event title |
| `description` | string | 1-2000 chars | Event description |
| `startDate` | string | ISO 8601 | Event start time |
| `location.address.streetAddress` | string | min 1 char | Street address |
| `organizer.name` | string | min 1 char | Organizer name |
| `organizer.email` | string | email format | Contact email |

### Optional Fields
| Field | Type | Description |
|-------|------|-------------|
| `endDate` | string | ISO 8601 end time |
| `location.name` | string | Location name |
| `location.geo` | object | Lat/lng coordinates |
| `organizer.telephone` | string | Contact phone |
| `keywords` | array | Event tags |

### Excluded Fields
Fields deliberately excluded from v4:
- Image galleries and metadata
- MLS integration fields  
- Performer arrays
- Complex event status enums
- Accessibility metadata
- Capacity/attendance limits

---

## Decision 6: Unified Error Format & Codes

### Standard Error Response
```json
{
  "success": false,
  "error": "Human-readable error message",
  "type": "ErrorClassName"
}
```

### Error Response with Details
```json
{
  "success": false, 
  "error": "Event validation failed",
  "details": [
    {
      "field": "name",
      "message": "must be string",
      "value": null,
      "allowedValues": null
    }
  ]
}
```

### HTTP Status Codes
| Status | Usage |
|--------|-------|
| 200 | Success |
| 400 | Client error (validation, missing required fields) |
| 500 | Server error (LLM failure, internal processing) |

### Error Types
- **ValidationError**: Schema validation failure
- **ParseError**: LLM parsing failure  
- **ConfigurationError**: Missing API keys or configuration
- **StorageError**: Internal storage failure

---

## Decision 7: Controlled Category Vocabulary

### Predefined Categories
```json
[
  "apartments",        // Rental listings
  "garage-sales",      // Garage/yard sales  
  "open-houses",       // Real estate open houses
  "job-postings",      // Employment opportunities
  "live-events",       // Concerts, performances, shows
  "community-alerts",  // Public safety, notifications
  "happy-hours",       // Social gatherings, networking
  "missing-pets"       // Lost pet alerts
]
```

### Category Assignment Rules
1. LLM selects most appropriate category during parsing
2. Default to "live-events" if ambiguous
3. No custom categories allowed in v4

### Synthetic Windows
Categories enable synthetic time windows:
- **garage-sales**: Typically weekend mornings (8am-2pm)
- **happy-hours**: Weekday evenings (5pm-7pm)  
- **open-houses**: Weekend afternoons (1pm-4pm)
- **job-postings**: No specific time window

---

## Decision 8: Slug Generation Algorithm

### EventId Generation
```javascript
// Format: evt_{random}_{timestamp}
const eventId = `evt_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`

// Example: "evt_k7x9m2p4q_1641234567890"
```

### Algorithm Details
- **Prefix**: Always "evt_"
- **Random Component**: 9 characters from base36 [a-z0-9]
- **Timestamp Component**: JavaScript timestamp (milliseconds since epoch)
- **Separator**: Underscore "_"

### Properties
- **Uniqueness**: Timestamp + randomness ensures uniqueness
- **Readability**: Human-readable prefix identifies event IDs
- **Sortability**: Timestamp component enables chronological sorting
- **Length**: 8-64 character constraint (typical: ~27 characters)

---

## API Endpoints

### 1. Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00.000Z", 
  "version": "4.0.0-mvp",
  "storage": {
    "type": "in-memory",
    "events": 42
  },
  "uptime": 1234.567
}
```

### 2. Parse and Publish Event

```
POST /api/parse-and-publish
```

**Request:**
```json
{
  "naturalLanguageInput": "Garage sale Saturday 8am-2pm...",
  "userContext": {
    "defaultLocation": "Springfield, IL",
    "timezone": "America/Chicago" 
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "eventId": "evt_k7x9m2p4q_1641234567890",
    "event": {/* Full event object */},
    "processing": {
      "parsed": true,
      "validated": true, 
      "stored": true
    }
  }
}
```

### 3. Query Events Near Location

```
GET /v1/events/near?lat=39.7817&lng=-89.6501&radius=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [/* Event objects */],
    "total": 5,
    "query": {
      "lat": 39.7817,
      "lng": -89.6501, 
      "radius": 10
    },
    "note": "MVP implementation returns all events"
  }
}
```

---

## Future Decisions (Queued)

### Pending Implementation
1. **Health Endpoint Enhancement**: Add more detailed system metrics
2. **Schema Versioning**: Version negotiation and backward compatibility  
3. **Pagination**: Limit and offset for large result sets
4. **Validation Taxonomy**: Detailed validation error categorization
5. **Logging & Metrics**: Request logging and performance monitoring
6. **Accept Negotiation**: Content-Type negotiation for responses

### Deferred Features
- Batch event processing
- Authentication & authorization
- Rate limiting & quotas
- Advanced search & filtering
- Real-time updates & webhooks
- Image & document processing

---

## Schema Reference

The complete JSON Schema is available at:
- **File**: `backend/schemas/flypost-event-v4.schema.json`
- **URL**: `GET /api/schema` (development)

## Implementation Status

✅ **Implemented**
- All 3 core endpoints
- Event model & validation
- LLM integration (OpenAI GPT-4)
- In-memory storage
- Frontend interface

🚧 **In Progress**  
- Firestore integration
- Enhanced error handling
- Production deployment

📋 **Planned**
- Geospatial filtering
- Performance monitoring
- Documentation website

---

*This specification represents the current state of Flypost v4 as of 2025-01. For implementation details, see the codebase in `backend/src/` and `frontend/src/`.*