# Flypost Discovery Protocol

Flypost is a local event discovery protocol for agents.

Agents publish messy real-world event data. Flypost normalizes it into canonical
`what`, `where`, and `when` records that other agents can discover by place and
time.

## Model

Flypost separates the public event registry from private intelligence.

**Layer 1: Discovery Registry**

Stable, agent-readable facts:

- what is happening
- where it is happening
- when it starts and ends
- source/provenance
- share URL
- integrity hash
- distance from the query point on near-query responses

**Layer 2: Intelligence and Verification**

Derived or truth-writing data:

- presence check-ins
- attendance
- feedback
- buyer tokens
- demand signals
- brokerage insights

Layer 2 data must not leak into Discovery responses.

## Core Endpoints

Public discovery reads do not require authentication:

```bash
curl "https://api.goflypost.com/v1/events/near?lat=34.0089&lng=-118.4716&radius_mi=1.25"
```

```bash
curl "https://api.goflypost.com/v1/events/{event_id}"
```

Authenticated publishing accepts either natural language or structured events:

```bash
curl -X POST "https://api.goflypost.com/api/parse-and-publish" \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: $FLYPOST_WRITE_TOKEN" \
  -d '{"text":"Garage sale Saturday 9am-2pm at 123 Main St, Santa Monica"}'
```

```bash
curl -X POST "https://api.goflypost.com/v1/events/upsert" \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: $FLYPOST_WRITE_TOKEN" \
  -d '{"event":{...}}'
```

## DiscoveryEventV1

Discovery responses use this envelope:

```json
{
  "protocol": "flypost-discovery",
  "version": "v1",
  "success": true,
  "events": [],
  "meta": {
    "count": 0
  }
}
```

Each event is a registry-safe projection:

```json
{
  "eventId": "evt_example_123",
  "dataHash": "64-character-lowercase-sha256",
  "what": {
    "type": "garage_sale",
    "label": "Garage sale"
  },
  "where": {
    "latitude": 34.01,
    "longitude": -118.47,
    "address": "123 Main St, Santa Monica, CA"
  },
  "when": {
    "start": "2026-06-06T16:00:00.000Z",
    "end": "2026-06-06T21:00:00.000Z",
    "timezone": "America/Los_Angeles"
  },
  "externalListingUrl": null,
  "shareUrl": "https://goflypost.com/e/garage-sale/evt_example_123_fpid",
  "distance_mi": 0.42
}
```

`GET /v1/events/near` returns upcoming events within the requested radius,
sorted nearest-first. `distance_mi` is computed from full-precision source
coordinates before public coordinate rounding.

## Categories

Canonical Discovery categories:

- `open_house`
- `garage_sale`
- `estate_sale`
- `moving_sale`
- `yard_sale`
- `apartment`
- `job_posting`
- `live_event`
- `community_alert`
- `happy_hour`
- `missing_pet`
- `other`

Common storage aliases such as `open-houses` and `garage-sales` are accepted on
query filters and normalized by the API.

## Auth

Reads:

- `GET /v1/events/near`: no auth required
- `GET /v1/events/{event_id}`: no auth required

Writes:

- Browser clients use Firebase bearer tokens.
- Machine clients use `x-flypost-write-token`.

Presence and feedback endpoints are truth-writing surfaces. They are not part of
the public Discovery protocol and must remain isolated from agent read surfaces.

## Agent Workflow

1. An agent receives messy local event input.
2. The agent publishes it with `POST /api/parse-and-publish` or structured
   `POST /v1/events/upsert`.
3. Flypost validates, geocodes, normalizes time, hashes, stores, and exposes the
   event as Discovery V1.
4. Another agent calls `GET /v1/events/near` for a user location.
5. Flypost returns canonical events sorted by distance.
6. The agent presents only events returned by the API and links to `shareUrl`.

## Canonical Machine Surfaces

- OpenAPI YAML: `https://api.goflypost.com/.well-known/openapi.yaml`
- OpenAPI JSON: `https://api.goflypost.com/.well-known/openapi.json`
- LLM guide: `https://api.goflypost.com/.well-known/llm.txt`
- MCP manifest: `https://api.goflypost.com/.well-known/mcp.flypost.ask.v1.json`
- MCP server source: `mcp/flypost-mcp-server.js`
