# Flypost Proxy Server

A lightweight proxy server for Flypost v4 that forwards requests to the backend and provides origin-gated authentication for API endpoints.
This public proxy deployment is restricted to **GET /e/*** share pages; all other paths or methods are blocked before authentication.

## Features

- **Request Forwarding**: Forwards requests to the backend service
- **Share Page Allowlist**: Only `GET /e/*` is served; other paths/methods return 403/404
- **Origin-Gated Authentication**: Different auth policies for browser vs. server-to-server writes
- **Firebase Authentication**: Browser writes from `app.goflypost.com` and `post.goflypost.com` require Firebase ID tokens
- **Read-Only Origins**: `ask.goflypost.com` is read-only (can only use `/api/chat`)
- **Static Token Authentication**: Machine/GPT writes use `x-flypost-write-token` (full proxy only)
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
The public share proxy blocks non-`/e/*` requests before these rules apply, so the rules below apply only in full proxy deployments.

### Authentication Rules

#### 1. Truth-Writing Endpoint Restrictions (Presence & Feedback) (full proxy only)

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

#### 2. Firebase-Required Browser Origins (full proxy only)

**Origins**: `https://app.goflypost.com`, `https://post.goflypost.com`

Browser writes from these origins **require Firebase authentication**:
- Must provide a valid Firebase ID token via `Authorization: Bearer <firebase_id_token>`
- Static write tokens (e.g., `x-flypost-write-token`) are **not accepted** from these origins
- Returns `401` with clear error if Firebase token is missing or invalid

This ensures browser clients cannot use static secrets, which would be visible in browser dev tools.

#### 3. Read-Only Ask Origin (full proxy only)

**Origin**: `https://ask.goflypost.com`

This origin is read-only and can only access chat endpoints:
- ✅ Allowed: `POST /api/chat` and `/api/chat/*` (without authentication)
- ❌ Rejected: Any other `POST /api/*` endpoint (returns `401`)

This separation ensures the concierge/query surface cannot be used to publish events.

#### 4. Machine / Server-to-Server Writes (full proxy only)

**Origins**: No origin header, or origins not matching the above

Server-to-server requests use static token authentication:
- Require valid token in `x-flypost-write-token` header
- Supports multiple tokens for brokerage-specific access:
  - `FLYPOST_WRITE_TOKEN`: Global write access
  - `VISTA_WRITE_TOKEN`: Vista SIR brokerage
  - `BHHS_UTAH_WRITE_TOKEN`: BHHS Utah brokerage
  - `COMPASS_WRITE_TOKEN`: Compass brokerage
- Token determines tenancy (brokerageId) for the request

#### 5. Chat Endpoint Exemption (full proxy only)

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

**Note**: The share-only proxy only serves `GET /e/*` and blocks other paths/methods. The examples below apply to full proxy deployments.

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

Run the share allowlist tests:

```bash
node test-truth-origin.js
```

This test suite validates:
- ✅ `GET /e/*` is forwarded to the backend
- ✅ Non-GET methods on `/e/*` are blocked with 403
- ✅ Non-`/e/*` paths are blocked with 404

Run the share allowlist integration tests:

```bash
node test-origin-auth.js
```

This test suite validates:
- ✅ `GET /e/*` is forwarded to the backend
- ✅ Non-GET methods on `/e/*` are blocked with 403
- ✅ Non-`/e/*` paths are blocked with 404

Run the legacy write-token tests (full proxy deployments only):

```bash
node test-middleware.js
```

## Routes

- `GET /e/*` → Forward share page requests to the backend
- All other paths → Blocked with 404
- Non-GET methods on `/e/*` → Blocked with 403
