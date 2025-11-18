# Flypost LLM Tools Documentation

This document describes the Flypost tools available for LLM agents. These tools enable AI agents to interact with the Flypost API to parse events and search for events by location.

## Overview

Flypost provides two primary tools for LLM agents:

1. **flypost_parse_and_publish** - Parse natural language event descriptions and store them
2. **flypost_events_near** - Search for events near a geographic location

The OpenAPI specification at `frontend/public/openapi.json` is the source of truth for detailed request/response schemas.

## Tools

### flypost_parse_and_publish

Parse a natural-language event description into a structured Flypost event and store it.

**Function Name:** `flypost_parse_and_publish`

**Description:** Converts free-form text describing an event into a structured Schema.org Event object, validates it, computes a hash for deduplication, stores it in the database, and returns the stored event with a unique Flypost event ID.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| naturalLanguageInput | string | Yes | Raw event description in natural language |
| userContext | object | No | Optional metadata about the caller, channel, or context |

**Example Request:**

```json
{
  "naturalLanguageInput": "Open house this Sunday from 1–4pm at 2212 Ocean Park Blvd, Santa Monica. 3 bed, 2 bath, listed at $1.5M.",
  "userContext": {
    "channel": "agent",
    "source": "openai-assistant"
  }
}
```

**Response:**

Returns an object with:
- `eventId` (string): Unique Flypost event identifier (e.g., "evt_abc123xyz_1700000000000")
- `event` (object): The structured event following Schema.org Event format

**Example Response:**

```json
{
  "eventId": "evt_abc123xyz_1700000000000",
  "event": {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Open House",
    "startDate": "2024-01-21T13:00:00.000Z",
    "endDate": "2024-01-21T16:00:00.000Z",
    "location": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "2212 Ocean Park Blvd",
        "addressLocality": "Santa Monica",
        "addressRegion": "CA"
      }
    },
    "description": "3 bed, 2 bath, listed at $1.5M"
  }
}
```

**API Endpoint:** `POST /api/parse-and-publish`

**Error Handling:**

- **400 Bad Request**: Invalid input or validation failure
- **500 Internal Server Error**: Server-side error during parsing or publishing

---

### flypost_events_near

Retrieve events near a latitude/longitude within a search radius.

**Function Name:** `flypost_events_near`

**Description:** Performs a geospatial query to find events within a specified radius of a given location. If coordinates are omitted, defaults to Santa Monica, CA. Uses Firestore geospatial queries when available, otherwise falls back to in-memory retrieval.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| lat | number | No | Santa Monica lat | Latitude in decimal degrees |
| lng | number | No | Santa Monica lng | Longitude in decimal degrees |
| radius | number | No | 10 | Search radius in kilometers |

**Example Request:**

```json
{
  "lat": 34.0195,
  "lng": -118.4912,
  "radius": 10
}
```

**Response:**

Returns an object with:
- `events` (array): List of events within the search radius
- `total` (number): Total count of events found

**Example Response:**

```json
{
  "events": [
    {
      "@type": "Event",
      "eventId": "evt_abc123_1700000000000",
      "name": "Community Meetup",
      "startDate": "2024-01-15T18:00:00.000Z",
      "location": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Santa Monica",
          "addressRegion": "CA"
        },
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": 34.0195,
          "longitude": -118.4912
        }
      }
    }
  ],
  "total": 1
}
```

**API Endpoint:** `GET /v1/events/near`

**Query Parameters:**
- `lat` - Latitude (optional)
- `lng` - Longitude (optional)
- `radius` - Radius in kilometers (optional, default: 10)

**Error Handling:**

- **500 Internal Server Error**: Server-side error during event retrieval

---

## Usage Examples

### Using with TypeScript Client

```typescript
import { createFlypostClient } from './clients/flypostClient.js'

const client = createFlypostClient({
  apiBase: 'http://localhost:3001'
})

// Parse and publish an event
const result = await client.flypostParseAndPublish({
  naturalLanguageInput: 'Tech meetup next Friday at 6pm in downtown LA',
  userContext: { source: 'my-agent' }
})
console.log('Created event:', result.eventId)

// Search for nearby events
const nearby = await client.flypostEventsNear({
  lat: 34.0522,
  lng: -118.2437,
  radius: 5
})
console.log(`Found ${nearby.total} events`)
```

### Using with OpenAI Function Calling

```typescript
import OpenAI from 'openai'
import { readFileSync } from 'fs'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const tools = JSON.parse(readFileSync('./tools/flypost.tools.json', 'utf-8'))

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Create an event for a concert tomorrow at 8pm' }
  ],
  tools: tools,
  tool_choice: 'auto'
})

// Handle tool calls and dispatch to Flypost client
// See examples/flypost-agent.ts for complete implementation
```

---

## Error Handling

The Flypost client normalizes all errors into a `FlypostError` class with the following properties:

- `message` (string): Human-readable error message
- `code` (string, optional): Error code (e.g., 'TIMEOUT')
- `status` (number, optional): HTTP status code
- `url` (string, optional): The URL that was called
- `details` (any, optional): Additional error details from the API

```typescript
try {
  await client.flypostParseAndPublish({ naturalLanguageInput: 'Invalid event' })
} catch (error) {
  if (error instanceof FlypostError) {
    console.error('Flypost error:', error.message)
    console.error('Status:', error.status)
    console.error('Details:', error.details)
  }
}
```

---

## Configuration

The Flypost client can be configured via:

1. **Environment variables** (recommended):
   ```bash
   export FLYPOST_API_BASE=http://localhost:3001
   ```

2. **Constructor options**:
   ```typescript
   const client = new FlypostClient({
     apiBase: 'https://your-api.example.com',
     timeout: 30000  // 30 seconds
   })
   ```

---

## Additional Resources

- **OpenAPI Specification**: `frontend/public/openapi.json` - Complete API reference
- **Tool Definitions**: `tools/flypost.tools.json` - OpenAI-compatible tool schemas
- **Example Agent**: `examples/flypost-agent.ts` - Complete working example
- **Client Source**: `clients/flypostClient.ts` - TypeScript client implementation
- **Tests**: `tests/flypostClient.test.ts` - Test suite with examples

---

## Notes

- All timestamps are in ISO 8601 format
- Events follow the Schema.org Event vocabulary
- The API automatically normalizes dates to ISO format
- Geospatial queries use the Haversine formula for distance calculation
- Default location (when coordinates omitted) is Santa Monica, CA (34.0195, -118.4912)
