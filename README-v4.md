# Flypost v4 - Minimal Core

## Overview

Flypost v4 represents a minimal, machine-to-machine event ingestion and query system. This version focuses on the essential supply, normalize schema, and retrieval loop for LLM-driven use cases.

## Architecture

- **Backend**: Minimal Express.js server with 3 endpoints
- **Frontend**: Simple HTML interface with textarea input
- **Storage**: In-memory event store (to be replaced with Firestore)
- **AI**: OpenAI GPT-4 for event parsing

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

Events follow a minimal JSON-LD schema based on Schema.org with Flypost extensions. See `docs/event-model.md` for details.

## Development Status

This is an MVP implementation focusing on the core parse → publish → query loop.