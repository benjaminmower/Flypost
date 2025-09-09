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

## API Specification

Complete API specification and design decisions are documented in:
- **API Specification**: `docs/api-specification.md` - Complete API contracts and decision documentation
- **Decision Tracker**: `docs/decision-tracker.md` - Implementation status of 8 key design decisions  
- **Event Model**: `docs/event-model.md` - Event schema and validation rules

## Development Status

✅ **v4 Core Complete**: All 8 key API & data contract decisions have been implemented and documented:
1. Initial API direction & goals
2. Event ingest shape & normalization  
3. /v1/events/near endpoint contract
4. Minimal event object shape & JSON-LD surface
5. Stable field table (required/optional/excluded)
6. Unified error format & codes
7. Controlled category vocabulary & synthetic windows
8. Slug generation algorithm

The system provides a fully functional parse → publish → query loop ready for OpenAI integration and Firestore storage.
