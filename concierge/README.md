# Flypost Concierge

Discovery interface at `ask.goflypost.com` - helps users find nearby events through natural conversation.

## Purpose

- **Read-only discovery** of Flypost event registry
- **Flypost share URLs first** - links to pages with Check In, Calendar, Maps
- **SOT v10 aligned** - follows Tier 1/Tier 2 disclosure rules
- **Privacy-compliant** - no PII fabrication, follows SOT principles

## How It Works

1. User: "What's happening in Santa Monica this weekend?"
2. Concierge calls `/v1/events/near` (Discovery Protocol V1)
3. Returns Markdown-formatted listings with Flypost share URLs as primary CTAs
4. Users click to view details, check in, get calendar/directions

## Example Response

```markdown
### 🏠 Open House at 2517 24th St, Santa Monica

**[🏠 View on Flypost](https://goflypost.com/e/open-house-2517-24th-st/evt_abc_fpid)**

- **When**: Saturday, Feb 1 · 1:00-4:00 PM
- **Price**: $1.5M
- **Details**: 3 bed · 2 bath · 2,100 sqft

*Beautiful coastal home with modern updates.*

Also listed on [Zillow](https://zillow.com/...)
```

## Architecture

```
ask.goflypost.com → POST /api/chat → processChatMessage → getEventsNear tool → /v1/events/near
```

## API Endpoints

### POST /api/chat

**Request:**
```json
{
  "message": "What's happening in Santa Monica?",
  "lat": 34.0195,
  "lng": -118.4912,
  "conversationHistory": []
}
```

**Note:** This is a global public discovery interface. Any `brokerageId` in the request is silently ignored.

**Response:**
```json
{
  "success": true,
  "message": "## Open Houses in Santa Monica...",
  "listings": [
    {
      "eventId": "evt_abc123",
      "shareUrl": "https://goflypost.com/e/...",
      "what": { "type": "open_house", "label": "Open House at 2517 24th St" },
      "where": { "address": "2517 24th St, Santa Monica, CA 90403" },
      "when": { "start": "2026-02-01T21:00:00Z", "displayLocal": "1:00 PM – 4:00 PM PT" }
    }
  ]
}
```

### GET /api/chat/health

Health check for concierge service.

## SOT Alignment

Follows `FLYPOST-MVP-2.0-SOURCE-OF-TRUTH_Version10.md`:
- Tier 1 authoritative data from Discovery Protocol
- Tier 2 disclosure for general knowledge (exact wording)
- Never hallucinate events or attendance
- Always use Flypost share URLs as primary CTAs
- Never claim attendance without API confirmation

## File Structure

```
concierge/
├── README.md                    # This file
├── USAGE.md                     # API usage examples
├── widget/
│   └── index.html               # Standalone UI harness
└── (backend integration in backend/src/concierge/)
```
