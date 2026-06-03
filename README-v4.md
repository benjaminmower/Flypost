# Flypost v4 - LLM-Citeable Local Events Layer

## Overview

Flypost is an open, machine-readable registry for hyperlocal events. The core product is not a consumer feed or another events app; it is the citeable data layer an LLM can call when a user asks, "what is happening near me?"

The current system focuses on three primitives:

- Ingest local event supply from natural language or structured JSON.
- Normalize it into a stable Schema.org/Flypost event model with hashes, geo, time, and category metadata.
- Expose public Discovery V1 endpoints and share pages that assistants, search engines, and crawlers can cite.
- Provide an installable consumer PWA that turns the same registry into an image-first swipe deck of nearby flyers.

The thesis is simple: if assistants can reliably discover and cite Flypost records, one good LLM recommendation can outperform a large consumer app download funnel.

Canonical docs:

- [Flypost Discovery Protocol](docs/flypost-discovery-protocol.md)
- [90405 Seed Workflow](docs/90405-seed-workflow.md)
- [MCP Server Quick Start](mcp/readme.md)

## Architecture

- **Backend**: Express.js API for event ingestion, discovery, share pages, presence, feedback, and machine-readable specs
- **Proxy**: Cloud Run proxy that fronts public discovery, write authentication, crawler files, and OpenAPI/LLM discovery documents
- **Discovery Protocol**: Public `flypost-discovery` v1 response shape with strict `what`, `where`, `when`, `eventId`, `dataHash`, and share URL fields
- **Storage**: Hybrid in-memory + Firestore persistence
- **AI**: Enhanced OpenAI GPT-4 parser with improved prompts and validation
- **Integrity**: SHA-256 hashing for event data verification and future DLT anchoring
- **Public citation**: `/e/{slug}/{fpid}` share pages emit Open Graph/Twitter metadata and schema.org `Event` JSON-LD
- **Consumer app**: `frontend_app/` is the PWA for `app.goflypost.com`, using Discovery V1 for reads and authenticated Firebase-backed posting

## Surfaces

- `app.goflypost.com` / `frontend_app/` - installable PWA for swiping nearby flyers, saving locally, and posting authenticated image-backed flyers.
- `ask.goflypost.com` / `frontend_ask/` - read-only discovery and concierge surface.
- `post.goflypost.com` / `frontend_post/` - authenticated publisher surface for parse-and-publish workflows.
- `presence.goflypost.com` / `frontend_presence/` - truth-writing surface for attendance and feedback.

### Enhanced Parsing Logic (v3)

The backend includes an enhanced natural-language parser with:
- **Better prompt engineering**: Detailed field extraction rules for higher accuracy
- **Enhanced validation**: Comprehensive field checking before LLM fallback
- **Context awareness**: Support for location defaults, timezones, and date context
- **Robust normalization**: Automatic field structure enforcement and date validation
- **Smart fallback**: GPT-4o-mini primary with GPT-4o fallback for complex cases

See [`backend/ENHANCED_PARSING.md`](backend/ENHANCED_PARSING.md) for detailed documentation.

## Endpoints

- `GET /health` - Health check
- `POST /api/parse-and-publish` - Parse natural language and store event
- `POST /v1/events/upsert` - Publish or update a structured event object
- `GET /v1/events/near` - Discover events near a coordinate, filtered by radius, sorted nearest-first, with optional time, brokerage, and category filters
- `GET /v1/events/{event_id}` - Retrieve one event in Discovery V1 format
- `GET /e/{slug}/{fpid}` - Public citeable event share page with JSON-LD
- `GET /openapi.json`, `GET /llms.txt`, `GET /.well-known/openapi.json` - Machine-readable discovery surfaces

`GET /v1/events/near` supports `category` as a comma-separated filter. Public category values are:

```text
open_house, garage_sale, estate_sale, moving_sale, yard_sale,
apartment, job_posting, live_event, community_alert, happy_hour,
missing_pet, other
```

Common storage/input aliases such as `open-houses`, `garage-sales`, and `happy-hours` are accepted and normalized.

## Quick Start

```bash
# Backend
cd backend
npm install
npm start

# Proxy
cd proxy
npm install
npm start

# Consumer PWA
cd frontend_app
npm install
npm run dev
npm run build
```

## Event Model

Events follow a JSON-LD schema based on Schema.org `Event` with Flypost extensions. Each stored event includes:

- Schema.org Event structure with location, organizer, dates
- Flypost metadata (`eventId`, category, crawl/query flags, timestamps)
- SHA-256 hash for integrity verification and future DLT anchoring
- Optional occurrences for multi-slot events
- Optional category-specific fields such as listing price

Storage categories use the Flypost v4 schema values:

```text
apartments, garage-sales, open-houses, job-postings,
live-events, community-alerts, happy-hours, missing-pets
```

Discovery responses expose normalized public categories under `what.type`.

### Organizer Fields (v4.0.1)

The organizer object supports the following optional fields:
- `@type`: "Person" or "Organization"
- `name`: Organizer name
- `email`: Contact email
- `phone`: Contact phone (preferred field)
- `telephone`: Deprecated - use `phone` instead
- `licenseId`: Agent license ID
- `mlsNumber`: MLS listing number

**Backward Compatibility**: Events using the legacy `telephone` field are automatically normalized to `phone` during ingestion. Both fields are accepted for validation. The `additionalProperties: true` setting allows future extensibility.

## Storage

Events are stored in a hybrid system:
- **In-memory**: Fast access for development and testing
- **Firestore**: Persistent cloud storage (optional, configured via environment variables)

To enable Firestore, set `GOOGLE_CLOUD_PROJECT` in your `.env` file. The backend will use Application Default Credentials (ADC) for authentication.

## Discovery and Citability

Discovery V1 is the public M2M contract. It intentionally returns a safe projection of stored events:

- `what`: event category and optional human label
- `where`: coordinates and optional address
- `when`: start/end timestamps and optional timezone
- `eventId`, `dataHash`, `externalListingUrl`, `shareUrl`
- optional `imageUrl` for image-first consumer surfaces when a stored event has a safe HTTPS `flypost.heroImageUrl`
- optional `distance_mi` on near-query responses, computed from full-precision source coordinates before public coordinate rounding
- optional source and occurrences metadata

Public share pages are designed to be citeable by search and assistant systems. They expose canonical URLs, social metadata, and schema.org `Event` JSON-LD. Root and `.well-known` OpenAPI/LLM documents describe the same read-only discovery surface.

## Consumer PWA

`frontend_app/` is the installable Flypost app deployed at `app.goflypost.com`.

Core behavior:
- Reads `GET /v1/events/near` and `GET /v1/events/{event_id}` using the Discovery V1 shape.
- Renders only image-backed events in an image-first swipe deck.
- Saves and dismisses flyers locally in browser storage.
- Uses Firebase magic-link auth for posting.
- Uploads flyer images directly to Firebase Storage under `flyers/{uid}/...`.
- Publishes through `POST /api/parse-and-publish` with structured PWA flyer context.

Required frontend environment variables:

```bash
VITE_API_BASE_URL=https://api.goflypost.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_APP_ID=...
```

Firebase Storage rules live in `firebase/storage.rules` and are referenced from `firebase.json`. Deploy them manually with:

```bash
firebase deploy --only storage
```

## Web Concierge (Optional Feature)

The Web Concierge is an **anonymous chat interface** that helps users discover nearby events through natural conversation with OpenAI-powered responses.

### Key Features
- 🤖 **AI-Powered Chat**: Uses GPT-4o-mini for natural language understanding
- 📍 **Geolocation-Based**: Searches for events near the user's location
- 🔒 **Privacy-First**: No PII storage, GDPR-compliant logging
- 🛡️ **Security Hardened**: Rate limiting, CORS protection, input validation
- 🎯 **Isolated**: Zero impact on v4 production ingestion loop

### Quick Start

1. Enable the feature and set your OpenAI API key:
```bash
export ENABLE_CONCIERGE=true
export OPENAI_API_KEY=sk-...
```

2. Restart the backend - the chat endpoint will be available at `/api/chat`

3. Open the widget at `concierge/widget/index.html` or embed it in your website

See [`concierge/README.md`](concierge/README.md) for complete documentation, API reference, and deployment guide.

## Development Status

This is an MVP implementation with Firestore persistence and cryptographic hashing, supporting the core ingest -> normalize -> discover -> cite loop. The consumer PWA now sits on top of that primitive; MCP server work, moderation/admin tooling, push notifications, and richer distribution products remain separate layers.
