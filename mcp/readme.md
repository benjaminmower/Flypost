# Flypost MCP Server

Flypost MCP gives agents tools for local event discovery and publishing through
the Flypost Discovery Protocol.

Use it when an agent needs to:

- search nearby events with `GET /v1/events/near`
- retrieve one event by ID
- publish a natural-language event
- upsert a structured event
- write presence/feedback records when explicitly authorized

For the protocol model, see
[`docs/flypost-discovery-protocol.md`](../docs/flypost-discovery-protocol.md).

## Quick Start

```bash
cd mcp
npm install
FLYPOST_API_BASE=https://api.goflypost.com node flypost-mcp-server.js
```

The server uses stdio, so the command is normally launched by an MCP client.
The command above is only a smoke test; press `Ctrl+C` to stop it.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `FLYPOST_API_BASE` | Yes | API base URL. Use `https://api.goflypost.com` for production. |
| `FLYPOST_WRITE_TOKEN` | For writes | Static write token for publishing, upsert, presence, and feedback tools. |
| `FLYPOST_BROKERAGE_ID` | Optional | Adds `x-flypost-brokerage-id` to write requests. |

Public discovery reads do not need a write token.

## Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flypost": {
      "command": "node",
      "args": ["/absolute/path/to/flypost/mcp/flypost-mcp-server.js"],
      "env": {
        "FLYPOST_API_BASE": "https://api.goflypost.com",
        "FLYPOST_WRITE_TOKEN": "optional-token-for-writes"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Claude Code

Add this to `.claude/settings.json` in the repo root:

```json
{
  "mcpServers": {
    "flypost": {
      "command": "node",
      "args": ["mcp/flypost-mcp-server.js"],
      "env": {
        "FLYPOST_API_BASE": "https://api.goflypost.com",
        "FLYPOST_WRITE_TOKEN": "optional-token-for-writes"
      }
    }
  }
}
```

## Tools

### `search_events_near`

Search for nearby events. Results are nearest-first when a location is provided
and include `distance_mi` when returned by the API.

| Input | Type | Required | Description |
| --- | --- | --- | --- |
| `lat` | number | Yes | Search latitude. |
| `lng` | number | Yes | Search longitude. |
| `radius_mi` | number | No | Search radius in miles. Use `1.25` for a hyperlocal 90405 query. |
| `start` | string | No | ISO 8601 start filter. |
| `end` | string | No | ISO 8601 end filter. |
| `brokerageId` | string | No | Optional brokerage filter. |

Example prompt:

```text
Find garage sales and live events within 1.25 miles of 34.0089, -118.4716.
```

Equivalent HTTP call:

```bash
curl "https://api.goflypost.com/v1/events/near?lat=34.0089&lng=-118.4716&radius_mi=1.25"
```

### `get_event`

Retrieve one Discovery V1 event by event ID.

| Input | Type | Required | Description |
| --- | --- | --- | --- |
| `event_id` | string | Yes | Flypost event ID. |

### `parse_and_publish`

Publish an event from natural language. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
| --- | --- | --- | --- |
| `text` | string | Yes | Natural-language event description. |
| `brokerageId` | string | No | Optional brokerage association. |

Example prompt:

```text
Publish this event: Garage sale Saturday 9am-2pm at 123 Main St, Santa Monica.
```

Equivalent HTTP call:

```bash
curl -X POST "https://api.goflypost.com/api/parse-and-publish" \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: $FLYPOST_WRITE_TOKEN" \
  -d '{"text":"Garage sale Saturday 9am-2pm at 123 Main St, Santa Monica"}'
```

### `upsert_event`

Create or update a structured event. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
| --- | --- | --- | --- |
| `event` | object | Yes | Schema.org Event with Flypost extensions. |

### `check_in`

Record a presence check-in. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
| --- | --- | --- | --- |
| `lat` | number | Yes | Check-in latitude. |
| `lng` | number | Yes | Check-in longitude. |
| `buyerToken` | string | Yes | Buyer or attendee token. |
| `eventId` | string | No | Specific event ID; if omitted the API matches by location. |

Presence is a truth-writing surface. Use it only when the caller is authorized
to write attendance facts.

### `submit_feedback`

Submit post-visit feedback. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
| --- | --- | --- | --- |
| `attendanceId` | string | No | Attendance ID returned from check-in. |
| `eventId` | string | No | Event ID, used with `buyerToken` if no attendance ID. |
| `buyerToken` | string | No | Buyer token, used with `eventId` if no attendance ID. |
| `wouldBuy` | boolean | Yes | Whether the attendee would buy. |
| `different` | string | No | What would need to be different. |

## Agent Publish-Then-Consume Flow

1. Agent receives a flyer, text message, calendar entry, or structured feed item.
2. Agent calls `parse_and_publish` or `upsert_event`.
3. Flypost validates, geocodes, normalizes time, hashes, and stores the event.
4. A different agent calls `search_events_near` for a user location.
5. Flypost returns canonical Discovery V1 events, nearest-first, with `distance_mi`.
6. Agent presents only returned events and links to each `shareUrl`.

## Verification

```bash
cd mcp
npm install
FLYPOST_API_BASE=https://api.goflypost.com node flypost-mcp-server.js
```

Then connect through an MCP client and ask:

```text
Find events within 1.25 miles of 34.0089, -118.4716.
```
