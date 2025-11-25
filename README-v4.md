# Flypost v4 - Minimal Core

## Overview

Flypost v4 represents a minimal, machine-to-machine event ingestion and query system. This version focuses on the essential supply, normalize schema, and retrieval loop for LLM-driven use cases.

## Architecture

- **Backend**: Minimal Express.js server with 3 endpoints
- **Frontend**: Simple HTML interface with textarea input
- **Storage**: Hybrid in-memory + Firestore persistence
- **AI**: OpenAI GPT-4 for event parsing
- **Integrity**: SHA-256 hashing for event data verification and future DLT anchoring

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

## Development Status

This is an MVP implementation with Firestore persistence and cryptographic hashing, supporting the core parse → publish → query loop.