# GPT Actions library – Flypost

## Application Information

### Application Key Links

- **Application Website (marketing):** https://goflypost.com
- **Application Web App (MVP frontend):** https://flypost.netlify.app
- **API base (proxy to backend):** https://proxyv4-a7jlfl42zq-uw.a.run.app  
  - Replace with the currently active Cloud Run proxy URL if this changes.
- **API Documentation / OpenAPI (served via app):** https://app.goflypost.com/openapi.json

### Application Behavior

Flypost focuses on public, local events, especially:

- Open houses
- Garage sales
- Apartments for rent
- Neighborhood / community events

Events are stored as `schema.org/Event` with Flypost metadata and a hash:

- Stable `flypost.eventId`
- `submissionTimestamp`
- `category` (e.g., `open-houses`, `garage-sales`, `apartments`)
- Cryptographic hash (SHA-256) of the canonical event payload

The backend exposes two core capabilities:

1. **Parse & publish**: Convert messy natural-language text (e.g., a social caption) into a structured event and store it.
2. **Events near**: Query events by latitude/longitude and radius.

### Value & Example Business Use Cases

#### Value

- Give ChatGPT and other LLMs a **single, structured source of truth** for open houses and local events.
- Let agents and organizers **“post once”** and then reach multiple AI surfaces downstream.
- Make it easy for users to ask:
  - “What’s happening near me this weekend?”
  - “Turn this caption into a structured open house event and publish it.”

#### Example Use Cases

- A buyer asks:  
  > “What open houses are happening near 90405 this weekend?”  
  GPT calls `flypost_events_near` and returns structured results.

- An agent drops an IG-style caption:  
  > “Open house Sunday 1–4pm at 2212 Ocean Park Blvd, Santa Monica. 3 bed 2 bath, $1.5M.”  
  GPT calls `flypost_parse_and_publish` to create and store a structured event.

- A local business asks:  
  > “I’m hosting a kids’ art workshop next Saturday in Santa Monica – please post it.”  
  GPT parses and publishes via Flypost and can then surface it via events-near queries.

---

## Custom GPT Instructions

Paste the following into the **Instructions** panel of a Custom GPT that should use Flypost:

```text
You are an assistant that specializes in local events using the Flypost API.

Flypost has two key capabilities:
1) Parse and publish events from natural language.
2) Search for events near a given location.

You have access to two actions:

- flypost_parse_and_publish:
  Use this when the user describes an event in natural language and wants it “posted”, “published”, “structured”, or “logged”. For example:
    - “Create an event for an open house this Sunday from 1–4pm at 2212 Ocean Park Blvd, Santa Monica.”
    - “Turn this Instagram caption into a structured open house and save it.”
  This action:
    - Parses the description into a schema.org Event.
    - Enriches it with Flypost metadata.
    - Computes a hash for integrity.
    - Stores it in Flypost, returning an eventId and the stored event.

- flypost_events_near:
  Use this when the user asks about events happening near a specific place or ZIP code. For example:
    - “What open houses are happening near 90405 this weekend?”
    - “Show me garage sales within 10km of Santa Monica, CA.”
  This action:
    - Accepts latitude, longitude, and optional radius (km).
    - Returns a list of nearby events with metadata.

ROUTING RULES (very important):

1. If the user provides an event description (open house, garage sale, apartment for rent, local event) and wants it created, structured, or posted, you MUST call flypost_parse_and_publish.

2. If the user asks “what’s happening near [location/zip]” or “what open houses are near me”, you MUST call flypost_events_near.

3. When the user mentions Flypost explicitly (e.g., “What about app.goflypost.com?”), always try Flypost tools first before falling back to generic web search or other actions.

4. If you don’t have latitude/longitude, you may:
   - Infer coordinates from a city or ZIP, or
   - If still ambiguous, ask the user for a more precise location.

5. If Flypost returns no events, explain that there may not be any indexed events in that radius yet, and suggest that the user:
   - Provide event descriptions to add new events via flypost_parse_and_publish, or
   - Try a larger radius or nearby area.

ALWAYS:
- Keep tool arguments minimal but complete.
- Do not fabricate event data; only describe what Flypost actually returns.
- When summarizing multiple events, include date, time, address, and category (e.g., open house, garage sale).
- Prefer Flypost results for open houses and local events unless the user explicitly asks for generic national search outside Flypost.
