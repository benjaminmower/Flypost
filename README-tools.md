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
  - **Configurable timeout and retry logic** for high-latency environments
  - **Authentication token support** for secured endpoints
  - **Multi-tenancy support** via brokerageId

### Example
- **`examples/flypost-agent.ts`** - Working OpenAI function calling demo

### Tests
- **`tests/flypostClient.test.ts`** - Comprehensive test suite (38 tests)
  - Happy path scenarios
  - Retry logic and timeout handling
  - Authentication and brokerageId support
  - Enhanced error messages

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
  lat?: number          // Optional: Latitude (defaults to Santa Monica)
  lng?: number          // Optional: Longitude (defaults to Santa Monica)
  radius?: number       // Optional: Search radius in km (default: 10)
  brokerageId?: string  // Optional: Filter by brokerage for multi-tenant setups
}
```

**Example:**
```typescript
const result = await client.flypostEventsNear({
  lat: 34.0195,
  lng: -118.4912,
  radius: 10,
  brokerageId: 'vista-sir'  // Optional: Filter by brokerage
})
// Returns: { events: array, total: number }
```

## Client Configuration

The Flypost client supports various configuration options to handle different network conditions and environments:

```typescript
import { createFlypostClient } from './clients/flypostClient.js'

const client = createFlypostClient({
  apiBase: 'https://api.goflypost.com',  // API endpoint
  timeout: 60000,                         // Request timeout in ms (default: 60s)
  maxRetries: 3,                          // Max retry attempts (default: 3)
  retryDelay: 1000,                       // Initial retry delay in ms (default: 1s)
  writeToken: 'your-write-token',         // Authentication token (optional)
  brokerageId: 'vista-sir'                // Default brokerageId (optional)
})
```

### Configuration Options

- **`apiBase`**: Flypost API base URL (default: `http://localhost:3001` or `FLYPOST_API_BASE` env var)
- **`timeout`**: Request timeout in milliseconds (default: 60000ms / 60s)
  - Increased from 30s to handle high-latency environments (private browsing, mobile networks)
- **`maxRetries`**: Maximum number of retry attempts for transient failures (default: 3)
  - Retries are performed with exponential backoff
  - Only retries server errors (5xx) and network errors, not client errors (4xx) or timeouts
- **`retryDelay`**: Initial delay between retries in milliseconds (default: 1000ms)
  - Each retry doubles the delay (exponential backoff)
- **`writeToken`**: Authentication token for write operations
  - Sent as `X-Flypost-Write-Token` header
- **`brokerageId`**: Default brokerage ID for multi-tenant operations
  - Can be overridden per-request
  - Sent as `X-Flypost-Brokerage-Id` header and query parameter

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

All errors are normalized to `FlypostError` with enhanced error messages and suggestions:

```typescript
try {
  await client.flypostParseAndPublish({ naturalLanguageInput: '...' })
} catch (error) {
  if (error instanceof FlypostError) {
    console.error('Error:', error.message)
    console.error('Status:', error.status)
    console.error('Code:', error.code)
    console.error('Details:', error.details)
    
    // Error details may include suggestions
    if (error.details?.suggestion) {
      console.log('Suggestion:', error.details.suggestion)
    }
  }
}
```

### Error Types

- **`TIMEOUT`**: Request exceeded timeout limit
  - Suggestion: Increase timeout value in client configuration
  - Note: Timeouts are NOT retried automatically
- **`NETWORK_ERROR`**: Network connectivity issues
  - Automatically retried with exponential backoff
  - Suggestion: Check network connectivity, disable private browsing, or try a different network
- **`RETRY_EXHAUSTED`**: All retry attempts failed
  - Details include number of attempts and original error
  - Suggestion: Check server availability and network connectivity
- **`4xx` Client Errors**: Bad request, unauthorized, etc.
  - NOT retried automatically
  - Check request parameters and authentication

## API Reference

See [`docs/tools.md`](./docs/tools.md) for complete API documentation.

## Testing

The test suite covers:
- ✅ Happy paths for both endpoints
- ✅ Error normalization from server responses
- ✅ Timeout handling (no automatic retries)
- ✅ Network error handling with retry logic
- ✅ Invalid response format handling
- ✅ Retry logic with exponential backoff
- ✅ Authentication token support
- ✅ Multi-tenancy brokerageId support
- ✅ Enhanced error messages with suggestions

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
