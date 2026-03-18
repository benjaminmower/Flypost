import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const BASE = process.env.FLYPOST_API_BASE
const TOKEN = process.env.FLYPOST_WRITE_TOKEN
const BROKERAGE = process.env.FLYPOST_BROKERAGE_ID

if (!BASE) {
  console.error("FLYPOST_API_BASE environment variable is required")
  process.exit(1)
}

const server = new McpServer({ name: "flypost", version: "1.0.0" })

function writeHeaders() {
  const h = { "Content-Type": "application/json" }
  if (TOKEN) h["x-flypost-write-token"] = TOKEN
  if (BROKERAGE) h["x-flypost-brokerage-id"] = BROKERAGE
  return h
}

async function apiFetch(path, options = {}) {
  const url = `${BASE}${path}`
  const res = await fetch(url, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${JSON.stringify(body)}`)
  }
  return body
}

// --- search_events_near ---
server.tool(
  "search_events_near",
  "Search for Flypost events near a geographic location.",
  {
    lat: z.number().describe("Latitude of the search center"),
    lng: z.number().describe("Longitude of the search center"),
    radius_mi: z.number().optional().describe("Search radius in miles (default: 10)"),
    start: z.string().optional().describe("ISO 8601 start date filter"),
    end: z.string().optional().describe("ISO 8601 end date filter"),
    brokerageId: z.string().optional().describe("Filter by brokerage ID"),
  },
  async ({ lat, lng, radius_mi, start, end, brokerageId }) => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
    if (radius_mi != null) params.set("radius_mi", String(radius_mi))
    if (start) params.set("start", start)
    if (end) params.set("end", end)
    if (brokerageId) params.set("brokerageId", brokerageId)

    const data = await apiFetch(`/v1/events/near?${params}`)
    const events = Array.isArray(data) ? data : (data.events ?? [])

    const summary = events.map((e) => ({
      eventId: e.eventId ?? e.id,
      name: e.name ?? e.title,
      address: e.address,
      date: e.startTime ?? e.date,
      price: e.price,
      organizer: e.organizerName ?? e.organizer,
      shareUrl: e.shareUrl,
    }))

    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    }
  }
)

// --- get_event ---
server.tool(
  "get_event",
  "Retrieve the full details of a single Flypost event by its ID.",
  {
    event_id: z.string().describe("The Flypost event ID"),
  },
  async ({ event_id }) => {
    const data = await apiFetch(`/v1/events/${encodeURIComponent(event_id)}`)
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    }
  }
)

// --- parse_and_publish ---
server.tool(
  "parse_and_publish",
  "Parse a natural language description of an event and publish it to Flypost.",
  {
    text: z.string().describe("Natural language description of the event to publish"),
    brokerageId: z.string().optional().describe("Brokerage ID to associate with the event"),
  },
  async ({ text, brokerageId }) => {
    const body = { text }
    if (brokerageId) body.brokerageId = brokerageId

    const data = await apiFetch("/api/parse-and-publish", {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify(body),
    })

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    }
  }
)

// --- upsert_event ---
server.tool(
  "upsert_event",
  "Create or update a Flypost event using a structured event object.",
  {
    event: z.record(z.unknown()).describe("Structured event object matching the Flypost event schema"),
  },
  async ({ event }) => {
    const data = await apiFetch("/v1/events/upsert", {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify(event),
    })

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    }
  }
)

// --- check_in ---
server.tool(
  "check_in",
  "Record a presence check-in at or near a Flypost event.",
  {
    lat: z.number().describe("Latitude of the check-in location"),
    lng: z.number().describe("Longitude of the check-in location"),
    buyerToken: z.string().describe("Token identifying the buyer/attendee"),
    eventId: z.string().optional().describe("Specific event ID to check in to (optional; auto-matched by location if omitted)"),
  },
  async ({ lat, lng, buyerToken, eventId }) => {
    const body = { lat, lng, buyerToken }
    if (eventId) body.eventId = eventId

    const data = await apiFetch("/v1/presence/check-in", {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify(body),
    })

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    }
  }
)

// --- submit_feedback ---
server.tool(
  "submit_feedback",
  "Submit post-visit feedback for a Flypost event attendance.",
  {
    attendanceId: z.string().optional().describe("Attendance ID returned from check-in"),
    eventId: z.string().optional().describe("Event ID (used with buyerToken if attendanceId is not available)"),
    buyerToken: z.string().optional().describe("Buyer token (used with eventId if attendanceId is not available)"),
    wouldBuy: z.boolean().describe("Whether the attendee would buy"),
    different: z.string().optional().describe("What would need to be different for the attendee to make an offer"),
  },
  async ({ attendanceId, eventId, buyerToken, wouldBuy, different }) => {
    const body = { wouldBuy }
    if (attendanceId) body.attendanceId = attendanceId
    if (eventId) body.eventId = eventId
    if (buyerToken) body.buyerToken = buyerToken
    if (different) body.different = different

    const data = await apiFetch("/v1/feedback/submit", {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify(body),
    })

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
