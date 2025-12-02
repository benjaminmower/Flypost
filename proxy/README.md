# Flypost Proxy Server

A lightweight proxy server for Flypost v4 that forwards requests to the backend and provides write-token authentication for API endpoints.

## Features

- **Request Forwarding**: Forwards requests to the backend service
- **Write-Token Authentication**: Optional authentication for POST requests to `/api/*` endpoints
- **CORS Support**: Configurable CORS for allowed origins
- **Google Cloud Run Compatible**: Supports Google Cloud ID token authentication

## Environment Variables

- `PORT` (default: `8080`): Port for the proxy server
- `BACKEND_URL`: URL of the backend service to forward requests to
- `FLYPOST_WRITE_TOKEN` (optional): Global write token for all POST requests to `/api/*` endpoints
- `VISTA_WRITE_TOKEN` (optional): Vista SIR brokerage-specific write token for agent GPTs
- `BHHS_UTAH_WRITE_TOKEN` (optional): BHHS Utah brokerage-specific write token for agent GPTs
- `COMPASS_WRITE_TOKEN` (optional): Compass brokerage-specific write token for agent GPTs (token: `compass_alexis`)
- `FRONTEND_ORIGIN` (optional): Comma-separated list of allowed CORS origins
- `PROXY_USE_ID_TOKEN` (default: `true`): Whether to use Google Cloud ID tokens for backend authentication

## Write-Token Authentication

The proxy includes a middleware that protects write operations (POST requests to `/api/*`) with an optional authentication token.

### Multi-Token Support

The proxy supports multiple write tokens to enable brokerage-specific access control:
- **Global token** (`FLYPOST_WRITE_TOKEN`): Universal write access
- **Brokerage-specific tokens**: Allow individual brokerages to publish events to their tenancy
  - `VISTA_WRITE_TOKEN`: Vista SIR brokerage
  - `BHHS_UTAH_WRITE_TOKEN`: BHHS Utah brokerage
  - `COMPASS_WRITE_TOKEN`: Compass brokerage (token: `compass_alexis`)

Each brokerage's agent GPT uses their specific token to ensure proper tenancy isolation.

### How it works

1. The middleware checks if the request is a POST to any path starting with `/api/`
2. If `FLYPOST_WRITE_TOKEN` is configured, it validates the `x-flypost-write-token` header
3. If the token is missing or invalid, the request is rejected with a 401 status
4. If no `FLYPOST_WRITE_TOKEN` is configured, all requests are allowed (backward compatible)

### Key Design

The middleware uses `req.originalUrl` instead of `req.path` to check for `/api/` prefix. This is important because:

- `app.post('/api/parse-and-publish', forward)` → `req.path = '/api/parse-and-publish'`
- `app.use('/api', forward)` → `req.path = '/foo'` (prefix stripped by Express)

Using `req.originalUrl` ensures the middleware correctly validates all POST requests to `/api/*` paths, regardless of how they're routed.

### Usage Example

```bash
# Without write-token (all POST requests allowed)
curl -X POST http://localhost:8080/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -d '{"naturalLanguageInput": "Event on Saturday"}'

# With write-token configured
export FLYPOST_WRITE_TOKEN="your-secret-token"

# Valid request with token
curl -X POST http://localhost:8080/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: your-secret-token" \
  -d '{"naturalLanguageInput": "Event on Saturday"}'

# Invalid request without token (will return 401)
curl -X POST http://localhost:8080/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -d '{"naturalLanguageInput": "Event on Saturday"}'
```

### Protected Endpoints

When `FLYPOST_WRITE_TOKEN` is set, the following endpoints require authentication:
- POST `/api/parse-and-publish` (and any other POST to `/api/*`)

### Unprotected Endpoints

The following endpoints do NOT require authentication:
- GET `/health`
- GET `/v1/events/near`
- GET `/api/*` (all GET requests)
- Any non-POST requests

## Running the Proxy

```bash
# Install dependencies
npm install

# Start the proxy
npm start

# Or with environment variables
BACKEND_URL=http://localhost:3001 FLYPOST_WRITE_TOKEN=secret npm start
```

## Testing

Run the integration tests:

```bash
node test-middleware.js
```

This will run comprehensive tests for the write-token middleware to ensure:
- POST requests with valid tokens are allowed
- POST requests with invalid tokens are rejected
- GET requests are not affected
- Backward compatibility when no token is configured

## Routes

- `GET /` → Status check
- `GET /health` → Forward to backend health endpoint
- `GET /v1/events/near` → Forward to backend events endpoint
- `POST /api/parse-and-publish` → Forward to backend parse endpoint (requires write-token if configured)
- `*` `/api/*` → Forward all other API requests to backend (POST requires write-token if configured)
