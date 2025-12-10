# Flypost v4 - Minimal Core

## Overview

Flypost v4 represents a minimal, machine-to-machine event ingestion and query system. This version focuses on the essential supply, normalize schema, and retrieval loop for LLM-driven use cases.

## Architecture

- **Backend**: Minimal Express.js server with 3 endpoints
- **Frontend**: Simple HTML interface with textarea input
- **Storage**: Hybrid in-memory + Firestore persistence
- **AI**: Enhanced OpenAI GPT-4 parser with improved prompts and validation
- **Integrity**: SHA-256 hashing for event data verification and future DLT anchoring

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
- `GET /v1/events/near` - Retrieve stored events (naive filter)

## Quick Start

```bash
# Backend
cd v4/backend
npm install
npm start

# Frontend
cd v4/frontend
npm install
npm run dev
```

## Event Model

Events follow a minimal JSON-LD schema based on Schema.org with Flypost extensions. Each event includes:
- Schema.org Event structure with location, organizer, dates
- Flypost metadata (eventId, category, timestamps)
- SHA-256 hash for integrity verification and future DLT anchoring

See `docs/event-model.md` for complete details.

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

This is an MVP implementation with Firestore persistence and cryptographic hashing, supporting the core parse → publish → query loop.