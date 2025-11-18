# Flypost LLM Tools

This directory contains plug-and-play tools for LLM agents to interact with Flypost endpoints.

## Quick Start

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `FLYPOST_API_BASE` - Flypost API URL (default: http://localhost:3001)
- `OPENAI_API_KEY` - For running the example script

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run type-check    # TypeScript type checking
npm run build         # Build TypeScript
```

### Running the Example

```bash
npm run example
```

The example demonstrates:
1. Parsing and publishing an event from natural language
2. Searching for events near a location

## Files Overview

### Tool Definitions
- **`tools/flypost.tools.json`** - OpenAI-compatible tool schemas for both Flypost endpoints

### Client Library
- **`clients/flypostClient.ts`** - TypeScript client for Flypost API
  - `flypostParseAndPublish()` - Parse and store events
  - `flypostEventsNear()` - Search events by location
  - `FlypostError` - Normalized error handling

### Example
- **`examples/flypost-agent.ts`** - Working OpenAI function calling demo

### Tests
- **`tests/flypostClient.test.ts`** - Comprehensive test suite (13 tests)

### Documentation
- **`docs/tools.md`** - Complete API documentation

## Tool Definitions

### flypost_parse_and_publish

Parse natural language event descriptions into structured Flypost events.

```typescript
{
  naturalLanguageInput: string  // Required: Raw event description
  userContext?: object         // Optional: Metadata about the caller
}
```

**Example:**
```typescript
const result = await client.flypostParseAndPublish({
  naturalLanguageInput: 'Open house Sunday 1-4pm at 2212 Ocean Park Blvd, Santa Monica'
})
// Returns: { eventId: string, event: object }
```

### flypost_events_near

Search for events near a geographic location.

```typescript
{
  lat?: number      // Optional: Latitude (defaults to Santa Monica)
  lng?: number      // Optional: Longitude (defaults to Santa Monica)
  radius?: number   // Optional: Search radius in km (default: 10)
}
```

**Example:**
```typescript
const result = await client.flypostEventsNear({
  lat: 34.0195,
  lng: -118.4912,
  radius: 10
})
// Returns: { events: array, total: number }
```

## Usage with OpenAI

```typescript
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { createFlypostClient } from './clients/flypostClient.js'

// Load tools
const tools = JSON.parse(readFileSync('./tools/flypost.tools.json', 'utf-8'))

// Initialize clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const flypost = createFlypostClient()

// Use with function calling
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Create an event for a concert tomorrow' }],
  tools: tools,
  tool_choice: 'auto'
})

// Dispatch tool calls
if (response.choices[0].message.tool_calls) {
  for (const toolCall of response.choices[0].message.tool_calls) {
    const args = JSON.parse(toolCall.function.arguments)
    
    if (toolCall.function.name === 'flypost_parse_and_publish') {
      const result = await flypost.flypostParseAndPublish(args)
      console.log('Created event:', result.eventId)
    }
  }
}
```

## Error Handling

All errors are normalized to `FlypostError`:

```typescript
try {
  await client.flypostParseAndPublish({ naturalLanguageInput: '...' })
} catch (error) {
  if (error instanceof FlypostError) {
    console.error('Error:', error.message)
    console.error('Status:', error.status)
    console.error('Details:', error.details)
  }
}
```

## API Reference

See [`docs/tools.md`](./docs/tools.md) for complete API documentation.

## Testing

The test suite covers:
- ✅ Happy paths for both endpoints
- ✅ Error normalization from server responses
- ✅ Timeout handling
- ✅ Network error handling
- ✅ Invalid response format handling

Run tests with: `npm test`

## Security

- ✅ CodeQL scan: No alerts
- ✅ Production dependencies: No vulnerabilities
- ✅ No hardcoded secrets (environment variables only)

## Architecture

```
tools/              # OpenAI tool definitions (JSON)
clients/            # TypeScript client library
examples/           # Working examples
tests/              # Test suite
docs/               # API documentation
```

## OpenAPI Alignment

All tool schemas and client implementations are verified against the OpenAPI specification at `frontend/public/openapi.json`. The OpenAPI spec is the source of truth for request/response shapes.

## License

Apache-2.0 (see [LICENSE](./LICENSE))
