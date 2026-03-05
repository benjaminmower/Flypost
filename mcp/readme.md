# Flypost MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives Claude access to the live Flypost API — search events, publish new ones, check in attendees, and collect feedback.

---

## Setup

```bash
cd mcp
npm install
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `FLYPOST_API_BASE` | Yes | Base URL of the Flypost proxy, e.g. `https://proxyv4-a7jlfl42zq-uw.a.run.app` |
| `FLYPOST_WRITE_TOKEN` | For writes | Static write token for authenticated endpoints |
| `FLYPOST_BROKERAGE_ID` | Optional | Scopes all write operations to a specific brokerage |

---

## Claude Desktop Config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flypost": {
      "command": "node",
      "args": ["/absolute/path/to/v4/mcp/flypost-mcp-server.js"],
      "env": {
        "FLYPOST_API_BASE": "https://proxyv4-a7jlfl42zq-uw.a.run.app",
        "FLYPOST_WRITE_TOKEN": "your-token-here",
        "FLYPOST_BROKERAGE_ID": "compass"
      }
    }
  }
}
```

Restart Claude Desktop after saving. The **flypost** server will appear in the tools list.

---

## Claude Code Config

Add to `.claude/settings.json` in the project root:

```json
{
  "mcpServers": {
    "flypost": {
      "command": "node",
      "args": ["mcp/flypost-mcp-server.js"],
      "env": {
        "FLYPOST_API_BASE": "https://proxyv4-a7jlfl42zq-uw.a.run.app",
        "FLYPOST_WRITE_TOKEN": "your-token-here"
      }
    }
  }
}
```

---

## Tools

### `search_events_near`
Search for events near a location.

| Input | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Latitude |
| `lng` | number | Yes | Longitude |
| `radius_mi` | number | No | Search radius in miles |
| `start` | string | No | ISO 8601 start date filter |
| `end` | string | No | ISO 8601 end date filter |
| `brokerageId` | string | No | Filter by brokerage |

**Example prompts:**
- *"Find open houses near 37.7749, -122.4194"*
- *"What Compass events are happening in San Francisco this weekend?"*

---

### `get_event`
Get full details for a single event.

| Input | Type | Required | Description |
|---|---|---|---|
| `event_id` | string | Yes | Flypost event ID |

**Example prompt:** *"Show me the full details for event abc123"*

---

### `parse_and_publish`
Publish an event from a natural language description. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | Natural language event description |
| `brokerageId` | string | No | Brokerage to associate with |

**Example prompts:**
- *"Publish this open house: 123 Main St, San Francisco, Sunday 1–4pm, asking $1.2M"*
- *"Post a new event: Broker tour at 456 Oak Ave, Tuesday 10am–12pm, hosted by Jane Smith"*

---

### `upsert_event`
Create or update an event using a structured object. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
|---|---|---|---|
| `event` | object | Yes | Flypost event schema object |

**Example prompt:** *"Upsert this event: { name: 'Open House', address: '123 Main St', startTime: '2026-03-08T13:00:00Z' }"*

---

### `check_in`
Record an attendee check-in at an event. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Check-in latitude |
| `lng` | number | Yes | Check-in longitude |
| `buyerToken` | string | Yes | Buyer/attendee identifier |
| `eventId` | string | No | Specific event ID (auto-matched by location if omitted) |

**Example prompt:** *"Check in buyer token 'tok_abc' at 37.7749, -122.4194"*

---

### `submit_feedback`
Submit post-visit feedback. Requires `FLYPOST_WRITE_TOKEN`.

| Input | Type | Required | Description |
|---|---|---|---|
| `attendanceId` | string | No* | From check-in response |
| `eventId` | string | No* | Used with buyerToken if no attendanceId |
| `buyerToken` | string | No* | Used with eventId if no attendanceId |
| `wouldBuy` | boolean | Yes | Would the attendee buy? |
| `wantsSimilar` | boolean | Yes | Want similar recommendations? |
| `feedbackText` | string | No | Free-text feedback |

*Provide either `attendanceId` or both `eventId` + `buyerToken`.

**Example prompt:** *"Submit feedback for attendance att_xyz: wouldBuy true, wantsSimilar true, 'Beautiful kitchen'"*

---

## Verification

```bash
# Should start without errors (press Ctrl+C to stop)
cd mcp && node flypost-mcp-server.js
```

After connecting Claude Desktop or Claude Code:
1. Ask: *"Find open houses near 37.7749, -122.4194"* → calls `search_events_near`
2. Ask: *"Publish this open house: 123 Main St, Sunday 1-4pm, $1.2M"* → calls `parse_and_publish`
