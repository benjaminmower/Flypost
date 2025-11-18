# Flypost Tools Documentation

This document describes the Flypost tools available for LLM agents to interact with the Flypost API.

## Overview

Flypost exposes two main tools for LLM agents:

1. **flypost_parse_and_publish** - Parse natural-language event descriptions into structured events
2. **flypost_events_near** - Search for events near a specific location

## Source of Truth

The OpenAPI specification at `frontend/public/openapi.json` is the canonical source of truth for all request and response shapes. This documentation provides a high-level overview, but refer to the OpenAPI spec for detailed schemas.

## Tools

### flypost_parse_and_publish

Parse a natural-language event description into a structured Flypost event and store it.

**Endpoint:** `POST /api/parse-and-publish`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `naturalLanguageInput` | string | Yes | Raw event description, e.g. "Open house Sunday 1-4pm at 2212 Ocean Park Blvd, Santa Monica..." |
| `userContext` | object | No | Optional metadata about the caller or channel |

**Request Example:**

```json
{
  "naturalLanguageInput": "Open house this Sunday from 1–4pm at 2212 Ocean Park Blvd, Santa Monica. 3 bed, 2 bath, listed at $1.5M.",
  "userContext": {
    "channel": "cli",
    "source": "agent"
  }
}
```

**Response Shape (from OpenAPI):**

```json
{
  "success": true,
  "data": {
    "eventId": "evt_abc123xyz_1700000000000",
    "event": {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": "Open House",
      "startDate": "2024-01-14T13:00:00-08:00",
      "endDate": "2024-01-14T16:00:00-08:00",
      "location": {
        "@type": "Place",
        "address": "2212 Ocean Park Blvd, Santa Monica, CA"
      },
      "flypost": {
        "eventId": "evt_abc123xyz_1700000000000",
        "submissionTimestamp": "2024-01-10T10:00:00Z"
      },
      "hash": {
        "algorithm": "SHA-256",
        "value": "abc123..."
      }
    },
    "processing": {
      "parsed": true,
      "validated": true,
      "hashed": true,
      "stored": true
    }
  }
}
```

**Normalized Client Response:**

The Flypost client normalizes the OpenAPI response to:

```json
{
  "eventId": "evt_abc123xyz_1700000000000",
  "event": { /* FlypostEvent object */ }
}
```

---

### flypost_events_near

Retrieve events near a latitude/longitude within a search radius.

**Endpoint:** `GET /v1/events/near`

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `lat` | number | No | Santa Monica lat | Latitude in decimal degrees |
| `lng` | number | No | Santa Monica lng | Longitude in decimal degrees |
| `radius` | number | No | 10 | Search radius in kilometers |

**Request Example:**

```
GET /v1/events/near?lat=34.0195&lng=-118.4912&radius=10
```

**Response Shape (from OpenAPI):**

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Sample Event",
        "startDate": "2024-01-14T13:00:00-08:00",
        "location": {
          "@type": "Place",
          "address": "Santa Monica, CA"
        },
        "flypost": {
          "eventId": "evt_xyz789_1700000000000"
        }
      }
    ],
    "total": 1,
    "query": {
      "lat": 34.0195,
      "lng": -118.4912,
      "radius": 10
    },
    "source": "Firestore",
    "note": "Using geospatial query"
  }
}
```

**Normalized Client Response:**

The Flypost client normalizes the OpenAPI response to:

```json
{
  "events": [ /* array of FlypostEvent objects */ ],
  "total": 1
}
```

---

## Using the Tools

### In OpenAI Function Calling

Load the tools definition from `tools/flypost.tools.json`:

```typescript
import fs from 'fs';
import OpenAI from 'openai';

const tools = JSON.parse(fs.readFileSync('tools/flypost.tools.json', 'utf-8'));
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'user', content: 'Create an event for a concert tonight at 8pm' }
  ],
  tools,
  tool_choice: 'auto',
});
```

### With the Flypost Client

Use the TypeScript client to execute tool calls:

```typescript
import { flypostParseAndPublish, flypostEventsNear } from './clients/flypostClient';

// Parse and publish an event
const result = await flypostParseAndPublish({
  naturalLanguageInput: 'Concert tonight at 8pm at The Roxy',
  userContext: { channel: 'agent' }
});
console.log(`Created event: ${result.eventId}`);

// Search for nearby events
const nearby = await flypostEventsNear({
  lat: 34.0195,
  lng: -118.4912,
  radius: 10
});
console.log(`Found ${nearby.total} events`);
```

---

## Error Handling

The client provides normalized error handling via the `FlypostError` class:

```typescript
try {
  await flypostParseAndPublish({ naturalLanguageInput: 'invalid' });
} catch (error) {
  if (error instanceof FlypostError) {
    console.error(`Error: ${error.message}`);
    console.error(`Status: ${error.status}`);
    console.error(`URL: ${error.url}`);
  }
}
```

---

## Environment Configuration

Set the following environment variables:

```bash
# Flypost API base URL (required)
FLYPOST_API_BASE=http://localhost:3001

# OpenAI API key (required for examples)
OPENAI_API_KEY=sk-...
```

See `.env.example` for a complete template.

---

## Running the Example

```bash
# Set environment variables
export FLYPOST_API_BASE=http://localhost:3001
export OPENAI_API_KEY=sk-...

# Run the example
npm run example
```

---

## Testing

Run the test suite with Vitest:

```bash
npm test
```

Tests cover:
- Happy paths for both endpoints
- Error normalization
- Network timeout handling
- OpenAPI response wrapper normalization

---

## Reference

- **OpenAPI Specification**: `frontend/public/openapi.json` (version 4.0.0-mvp)
- **Tools Definition**: `tools/flypost.tools.json`
- **TypeScript Client**: `clients/flypostClient.ts`
- **Example Agent**: `examples/flypost-agent.ts`
- **Tests**: `tests/flypostClient.test.ts`
