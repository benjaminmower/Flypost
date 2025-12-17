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
- `COMPASS_WRITE_TOKEN` (optional): Compass brokerage-specific write token for agent GPTs
- `FRONTEND_ORIGIN` (optional): Comma-separated list of allowed CORS origins
- `PROXY_USE_ID_TOKEN` (default: `true`): Whether to use Google Cloud ID tokens for backend authentication

## Write-Token Authentication

The proxy implements an **origin-gated authentication policy** for write operations (POST requests to `/api/*`):

### Authentication Policy

1. **Requests from `https://app.goflypost.com`:**
   - **MUST** include a valid Firebase ID token in the `Authorization: Bearer <token>` header
   - Firebase authentication is verified against the configured `FIREBASE_PROJECT_ID`
   - User identity (UID, email) is extracted and passed to the backend for provenance tracking

2. **Requests from other origins (or no origin):**
   - **MUST** include a valid static write token in the `x-flypost-write-token` header
   - Supports multiple tokens for brokerage-specific access control
   - Token-to-tenancy mapping ensures proper isolation

3. **Exempt endpoint:**
   - `/api/chat` is exempt from authentication (read-only POST endpoint)

### Multi-Token Support

The proxy supports multiple write tokens to enable brokerage-specific access control:
- **Global token** (`FLYPOST_WRITE_TOKEN`): Universal write access
- **Brokerage-specific tokens**: Allow individual brokerages to publish events to their tenancy
  - `VISTA_WRITE_TOKEN`: Vista SIR brokerage
  - `BHHS_UTAH_WRITE_TOKEN`: BHHS Utah brokerage
  - `COMPASS_WRITE_TOKEN`: Compass brokerage

Each brokerage's agent GPT uses their specific token to ensure proper tenancy isolation.

### How it works

Authentication is enforced in `proxy/src/forward.js` before requests are forwarded to the backend:

1. The middleware checks if the request is a POST to any path starting with `/api/`
2. The `/api/chat` endpoint is exempt from authentication checks
3. For authenticated endpoints:
   - If `Origin` header is exactly `https://app.goflypost.com`:
     - Verifies Firebase ID token in `Authorization` header
     - Returns 401 if missing or invalid
   - For all other origins (including missing Origin):
     - Validates `x-flypost-write-token` against configured tokens
     - Returns 401 if missing or invalid
     - Maps token to brokerageId for tenancy enforcement

### Usage Examples

#### From app.goflypost.com (Firebase authentication)

```bash
# Valid request with Firebase ID token
curl -X POST https://api.goflypost.com/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -H "Origin: https://app.goflypost.com" \
  -H "Authorization: Bearer <firebase-id-token>" \
  -d '{"naturalLanguageInput": "Event on Saturday"}'

# Invalid - missing Firebase token (will return 401)
curl -X POST https://api.goflypost.com/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -H "Origin: https://app.goflypost.com" \
  -d '{"naturalLanguageInput": "Event on Saturday"}'
```

#### From other origins (static write token)

```bash
# Valid request with static write token
curl -X POST https://api.goflypost.com/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: your-secret-token" \
  -d '{"naturalLanguageInput": "Event on Saturday"}'

# Invalid - missing write token (will return 401)
curl -X POST https://api.goflypost.com/api/parse-and-publish \
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
# Test origin-gated authentication policy
node test-origin-gated-auth.js

# Test legacy middleware (deprecated)
node test-middleware.js
```

The origin-gated auth tests verify:
- Firebase authentication for `app.goflypost.com` origin
- Static token authentication for other origins
- 401 responses for missing/invalid credentials
- `/api/chat` endpoint remains exempt
- GET requests are not affected

## Routes

- `GET /` → Status check
- `GET /health` → Forward to backend health endpoint
- `GET /v1/events/near` → Forward to backend events endpoint
- `POST /api/parse-and-publish` → Forward to backend parse endpoint (requires write-token if configured)
- `*` `/api/*` → Forward all other API requests to backend (POST requires write-token if configured)
