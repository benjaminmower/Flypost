# Flypost Proxy Server

A lightweight proxy server for Flypost v4 that forwards requests to the backend and provides origin-gated authentication for API endpoints.

## Features

- **Request Forwarding**: Forwards requests to the backend service
- **Origin-Gated Authentication**: Different auth policies for browser vs. server-to-server writes
- **Firebase Authentication**: Browser writes from `app.goflypost.com` and `post.goflypost.com` require Firebase ID tokens
- **Read-Only Origins**: `ask.goflypost.com` is read-only (can only use `/api/chat`)
- **Static Token Authentication**: Machine/GPT writes use `x-flypost-write-token`
- **CORS Support**: Configurable CORS for allowed origins
- **Google Cloud Run Compatible**: Supports Google Cloud ID token authentication

## Environment Variables

- `PORT` (default: `8080`): Port for the proxy server
- `BACKEND_URL`: URL of the backend service to forward requests to
- `FIREBASE_PROJECT_ID`: Firebase project ID for validating Firebase ID tokens from browser clients
- `FLYPOST_WRITE_TOKEN` (optional): Global write token for server-to-server POST requests to `/api/*` endpoints
- `VISTA_WRITE_TOKEN` (optional): Vista SIR brokerage-specific write token for agent GPTs
- `BHHS_UTAH_WRITE_TOKEN` (optional): BHHS Utah brokerage-specific write token for agent GPTs
- `COMPASS_WRITE_TOKEN` (optional): Compass brokerage-specific write token for agent GPTs
- `FRONTEND_ORIGIN` (optional): Comma-separated list of allowed CORS origins
- `PROXY_USE_ID_TOKEN` (default: `true`): Whether to use Google Cloud ID tokens for backend authentication

## Origin-Gated Authentication Policy

The proxy implements different authentication requirements based on the request origin, creating distinct surfaces for browser publishing, read-only querying, and machine writes.

### Authentication Rules

#### 1. Truth-Writing Endpoint Restrictions (Presence & Feedback)

**Endpoints**: `/v1/presence/*` and `/v1/feedback/*` POST requests

**Required Origin**: `https://presence.goflypost.com`

These endpoints mint "truth" (attendance/feedback records) and are restricted to the Presence web application:
- Must originate from `https://presence.goflypost.com`
- Returns `403` if origin is missing or different
- **Enforced regardless of authentication** - even valid tokens cannot bypass this origin check
- Prevents server-to-server / LLM / non-browser callers from minting truth

Examples of restricted endpoints:
- `POST /v1/presence/check-in` - Record attendance at an event
- `POST /v1/presence/check-out` - Record departure from an event
- `POST /v1/feedback/submit` - Submit feedback for an event

This restriction ensures truth-writing can only happen through the verified browser application, preventing abuse while keeping machine ingestion writes for events intact.

#### 2. Firebase-Required Browser Origins

**Origins**: `https://app.goflypost.com`, `https://post.goflypost.com`

Browser writes from these origins **require Firebase authentication**:
- Must provide a valid Firebase ID token via `Authorization: Bearer <firebase_id_token>`
- Static write tokens (e.g., `x-flypost-write-token`) are **not accepted** from these origins
- Returns `401` with clear error if Firebase token is missing or invalid

This ensures browser clients cannot use static secrets, which would be visible in browser dev tools.

#### 3. Read-Only Ask Origin

**Origin**: `https://ask.goflypost.com`

This origin is read-only and can only access chat endpoints:
- ✅ Allowed: `POST /api/chat` and `/api/chat/*` (without authentication)
- ❌ Rejected: Any other `POST /api/*` endpoint (returns `401`)

This separation ensures the concierge/query surface cannot be used to publish events.

#### 4. Machine / Server-to-Server Writes

**Origins**: No origin header, or origins not matching the above

Server-to-server requests use static token authentication:
- Require valid token in `x-flypost-write-token` header
- Supports multiple tokens for brokerage-specific access:
  - `FLYPOST_WRITE_TOKEN`: Global write access
  - `VISTA_WRITE_TOKEN`: Vista SIR brokerage
  - `BHHS_UTAH_WRITE_TOKEN`: BHHS Utah brokerage
  - `COMPASS_WRITE_TOKEN`: Compass brokerage
- Token determines tenancy (brokerageId) for the request

#### 5. Chat Endpoint Exemption

**Paths**: `/api/chat` and `/api/chat/*` (exact match only)

These read-only POST endpoints are exempt from write authentication:
- Can be accessed without authentication from any origin
- Used for chat/concierge queries that don't modify state
- **Important**: `/api/chatbot` is NOT exempt (requires authentication)

### Implementation Details

Authentication is enforced in `src/forward.js` as the single source of truth:
- Uses `req.originalUrl` to reliably detect paths (Express may strip path prefixes)
- Checks origin header to determine auth requirements
- Validates Firebase tokens using Google's OAuth2Client
- Maps static tokens to brokerageId for tenancy isolation
- Injects auth metadata into backend requests (uid, email, brokerageId)

### Usage Examples

#### Browser Publishing (Firebase Auth)

From `app.goflypost.com` or `post.goflypost.com`, use Firebase ID token:

```javascript
// Get Firebase ID token from authenticated user
const idToken = await firebase.auth().currentUser.getIdToken();

// Make authenticated write request
await fetch('https://api.goflypost.com/api/parse-and-publish', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`
  },
  body: JSON.stringify({
    naturalLanguageInput: 'Open house this Sunday 1-4pm at 123 Main St'
  })
});
```

#### Chat Queries (No Auth Required)

From `ask.goflypost.com` or any origin:

```bash
curl -X POST https://api.goflypost.com/api/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://ask.goflypost.com" \
  -d '{"message": "What open houses are near 90210?"}'
```

#### Machine/GPT Writes (Static Token)

For server-to-server or GPT integrations:

```bash
# Using global write token
curl -X POST https://api.goflypost.com/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: your-secret-token" \
  -d '{"naturalLanguageInput": "Event on Saturday"}'

# Using brokerage-specific token
curl -X POST https://api.goflypost.com/api/parse-and-publish \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: vista-sir-token" \
  -d '{"naturalLanguageInput": "Open house...", "brokerageId": "vista-sir"}'
```

### Protected vs. Public Endpoints

#### Protected (Require Authentication)

**POST `/api/*`** endpoints require authentication based on origin:
- From `app.goflypost.com`, `post.goflypost.com`: Firebase token required
- From other origins or no origin: Static write token required
- Examples: `/api/parse-and-publish`, `/api/events`, etc.

**Exception**: `/api/chat` and `/api/chat/*` are exempt (public)

#### Public (No Authentication Required)

- **GET** requests to any endpoint (e.g., `GET /v1/events/near`, `GET /api/schema`)
- **POST** `/api/chat` and `/api/chat/*` (chat queries)
- **GET** `/health` (health check)

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

Run the truth endpoint origin restriction tests:

```bash
node test-truth-origin.js
```

This test suite validates:
- ✅ Presence endpoints require `https://presence.goflypost.com` origin
- ✅ Feedback endpoints require `https://presence.goflypost.com` origin
- ✅ Rejection of missing or wrong origins (403 errors)
- ✅ `/api/*` endpoints remain unchanged
- ✅ GET requests not affected by origin restrictions

Run the comprehensive origin-gated authentication tests:

```bash
node test-origin-auth.js
```

This test suite validates:
- ✅ Firebase auth for browser origins (`app.goflypost.com`, `post.goflypost.com`)
- ✅ Read-only enforcement for `ask.goflypost.com`
- ✅ `/api/chat` exemption from auth
- ✅ `/api/chatbot` is NOT exempt (requires auth)
- ✅ Static token auth for machine/server-to-server writes
- ✅ Proper rejection of invalid/missing credentials
- ✅ Public read endpoints remain accessible

Run the legacy write-token tests:

```bash
node test-middleware.js
```

## Routes

- `GET /` → Status check
- `GET /health` → Forward to backend health endpoint
- `GET /v1/events/near` → Forward to backend events endpoint
- `POST /api/parse-and-publish` → Forward to backend parse endpoint (requires write-token if configured)
- `*` `/api/*` → Forward all other API requests to backend (POST requires write-token if configured)
