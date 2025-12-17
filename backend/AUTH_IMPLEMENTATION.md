# Authentication Implementation

## Overview

This document describes the authentication and authorization implementation for Flypost v4 backend write endpoints. The implementation supports two authentication methods aligned with the Two-Layer North Star architecture:

1. **Firebase ID Token** - For human publishers (web/mobile clients)
2. **HMAC Request Signing** - For machine publishers (MLS adapters, scrapers, etc.)

## Architecture

### Components

```
backend/src/auth/
├── firebaseAdmin.js    # Firebase Admin SDK initialization
├── hmac.js            # HMAC signature verification utilities
└── middleware.js      # Authentication middleware
```

### Middleware Flow

```
Request → requireWriteAuth() → writeLimiter → Handler
          ↓
          ├─ Check Authorization header (Firebase)
          ├─ Check HMAC headers
          └─ Return 401 if neither present
```

## Authentication Methods

### Method 1: Firebase ID Token

**Use Case**: Human publishers via web/mobile applications

**Headers**:
```http
Authorization: Bearer <firebase_id_token>
```

**Server-side Verification**:
1. Extract token from Authorization header
2. Verify using Firebase Admin SDK (`admin.auth().verifyIdToken()`)
3. Attach user context to request: `req.auth = { type: 'firebase', uid, email, claims }`

**Configuration**:
```bash
# Required for Firebase Admin SDK
GOOGLE_CLOUD_PROJECT=your-gcp-project-id

# Optional: For local development with service account
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

**Production Setup**:
- On Cloud Run: Uses Application Default Credentials (ADC) automatically
- No service account keys needed in production
- Set GOOGLE_CLOUD_PROJECT environment variable

### Method 2: HMAC Request Signing

**Use Case**: Machine-to-machine communication (MLS adapters, scrapers, automated systems)

**Headers**:
```http
x-flypost-client-id: mls-adapter
x-flypost-timestamp: 1734473200
x-flypost-signature: GFkgTxDCJg24WE364oaxdigIbviCFGWGhfI+977WGEQ=
```

**Signature Algorithm**:

```javascript
// 1. Compute body hash
const bodyHash = sha256_hex(rawBody)

// 2. Build canonical string
const canonical = `${timestamp}.${METHOD}.${path}.${bodyHash}`

// 3. Compute signature
const signature = base64(hmac_sha256(clientSecret, canonical))
```

**Server-side Verification**:
1. Extract HMAC headers from request
2. Validate timestamp (must be within 5 minutes)
3. Compute expected signature
4. Compare using timing-safe comparison
5. Attach client context to request: `req.auth = { type: 'hmac', clientId }`

**Configuration**:
```bash
# JSON object mapping clientId to secret
FLYPOST_HMAC_SECRETS_JSON='{"mls-adapter":"secret1","scraper":"secret2"}'

# Optional: Timestamp skew tolerance in seconds (default: 300)
HMAC_TIMESTAMP_SKEW_SECONDS=300
```

**Security Features**:
- **Replay Protection**: Timestamps must be within 5 minutes of server time
- **Body Integrity**: Request body is hashed and included in signature
- **Timing Safety**: Uses `crypto.timingSafeEqual` for signature comparison
- **No Information Leakage**: Generic error messages on failure

## Protected Endpoints

All write endpoints require authentication:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/parse-and-publish` | POST | Parse natural language and publish event |
| `/v1/events/upsert` | POST | Structured event ingestion |
| `/v1/presence/check-in` | POST | Record event attendance |
| `/v1/feedback/submit` | POST | Submit event feedback |

## Public Endpoints

These endpoints remain publicly accessible (no authentication required):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/events/near` | GET | Query events by location |
| `/v1/brokerages/:brokerageId/insights` | GET | Brokerage feedback insights |

## Error Responses

### 401 Unauthorized

**Missing Authentication**:
```json
{
  "success": false,
  "error": "Authentication required",
  "message": "Provide either Authorization: Bearer <firebase_token> or HMAC signature headers"
}
```

**Invalid Firebase Token**:
```json
{
  "success": false,
  "error": "Invalid Firebase ID token",
  "details": "Token verification failed: ..."
}
```

**Invalid HMAC Signature**:
```json
{
  "success": false,
  "error": "HMAC signature verification failed",
  "details": "Invalid signature"
}
```

### 503 Service Unavailable

**Firebase Not Configured**:
```json
{
  "success": false,
  "error": "Firebase authentication not available",
  "message": "Firebase Admin SDK is not initialized. Set GOOGLE_CLOUD_PROJECT to enable."
}
```

## Testing

### Unit Tests

Run HMAC signature verification tests:
```bash
cd backend
node test-auth-middleware.js
```

Tests:
- Signature computation determinism
- Valid signature verification
- Invalid signature rejection
- Timestamp replay protection
- Unknown client ID rejection
- Body tampering detection

### Integration Tests

Run end-to-end authentication tests:
```bash
cd backend
FLYPOST_HMAC_SECRETS_JSON='{"test-client":"test-secret-123"}' npm start &
node test-auth-integration.js
```

Tests:
- Unauthenticated request rejection
- Valid HMAC authenticated request
- Invalid HMAC signature rejection
- Read endpoints work without auth
- Health endpoint works without auth
- All write endpoints require auth

## Implementation Examples

### Node.js Client with HMAC

```javascript
import crypto from 'crypto'

function signRequest(clientId, clientSecret, method, path, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  
  // Compute body hash
  const bodyHash = crypto
    .createHash('sha256')
    .update(Buffer.from(body))
    .digest('hex')
  
  // Build canonical string
  const canonical = `${timestamp}.${method}.${path}.${bodyHash}`
  
  // Compute signature
  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(canonical)
    .digest('base64')
  
  return {
    'x-flypost-client-id': clientId,
    'x-flypost-timestamp': timestamp,
    'x-flypost-signature': signature
  }
}

// Usage
const body = JSON.stringify({ event: { /* ... */ } })
const headers = signRequest(
  'mls-adapter',
  process.env.MLS_ADAPTER_SECRET,
  'POST',
  '/v1/events/upsert',
  body
)

const response = await fetch('https://api.goflypost.com/v1/events/upsert', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...headers
  },
  body
})
```

### Web Client with Firebase

```javascript
import { getAuth } from 'firebase/auth'

async function authenticatedRequest(endpoint, data) {
  const auth = getAuth()
  const user = auth.currentUser
  
  if (!user) {
    throw new Error('User not authenticated')
  }
  
  // Get Firebase ID token
  const token = await user.getIdToken()
  
  const response = await fetch(`https://api.goflypost.com${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  })
  
  return response.json()
}

// Usage
const result = await authenticatedRequest('/api/parse-and-publish', {
  naturalLanguageInput: 'Open house this Sunday at 123 Main St'
})
```

## Security Considerations

### Secret Management

**Development**:
- Use `.env` file (never commit to git)
- Generate strong random secrets

**Production**:
- Use Google Secret Manager or similar service
- Rotate secrets periodically
- Set secrets as environment variables in Cloud Run

### Rate Limiting

All authenticated endpoints also have rate limiting:
- **Write endpoints**: 50 requests per 15 minutes per IP
- **Read endpoints**: 500 requests per 15 minutes per IP

Rate limiting happens **after** authentication to protect authenticated endpoints.

### Monitoring

Monitor these metrics in production:
- 401 response rates (potential attacks)
- Rate limit violations
- Authentication method distribution (Firebase vs HMAC)
- Failed authentication attempts by client ID

### Best Practices

1. **Never expose client secrets** in client-side code
2. **Use HTTPS** in production (enforced by Cloud Run)
3. **Rotate HMAC secrets** periodically
4. **Monitor authentication logs** for suspicious activity
5. **Use Firebase custom claims** for fine-grained authorization if needed
6. **Keep timestamp skew tolerance** reasonable (default: 5 minutes)

## Deployment Checklist

### Cloud Build Configuration

Update `backend/cloudbuild.yaml` to include HMAC secrets:

```yaml
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      gcloud run deploy flypostv4 \
        --image gcr.io/$PROJECT_ID/goflypost-backend:$SHORT_SHA \
        --region=${_REGION:-us-west1} \
        --platform=managed \
        --set-env-vars NODE_ENV=production,PORT=8080,FRONTEND_URL=${_FRONTEND_URL} \
        --update-secrets=OPENAI_API_KEY=OPENAI_API_KEY:latest,FLYPOST_HMAC_SECRETS_JSON=FLYPOST_HMAC_SECRETS_JSON:latest
```

**Note**: Create the `FLYPOST_HMAC_SECRETS_JSON` secret in Google Secret Manager first:
```bash
# Create secret with initial value (JSON format)
echo '{"mls-adapter":"your-secret-here"}' | gcloud secrets create FLYPOST_HMAC_SECRETS_JSON --data-file=-

# Update secret value
echo '{"mls-adapter":"new-secret","scraper":"another-secret"}' | gcloud secrets versions add FLYPOST_HMAC_SECRETS_JSON --data-file=-
```

### Cloud Run Deployment

- [ ] Set `GOOGLE_CLOUD_PROJECT` environment variable (automatically set on Cloud Run)
- [ ] Create HMAC secrets in Secret Manager
- [ ] Update `cloudbuild.yaml` to include secrets
- [ ] Deploy and verify ADC is working (check logs for Firebase initialization)
- [ ] Test Firebase authentication with real tokens
- [ ] Test HMAC authentication with production client IDs
- [ ] Monitor 401 responses and rate limiting

### Local Development

- [ ] Copy `.env.example` to `.env`
- [ ] Set `GOOGLE_CLOUD_PROJECT` (optional, for Firebase)
- [ ] Set `GOOGLE_APPLICATION_CREDENTIALS` (optional, for Firebase)
- [ ] Set `FLYPOST_HMAC_SECRETS_JSON` with test secrets
- [ ] Run unit tests: `node test-auth-middleware.js`
- [ ] Run integration tests: `node test-auth-integration.js`

## Troubleshooting

### Firebase Authentication Not Working

**Symptom**: 503 error "Firebase authentication not available"

**Solutions**:
1. Check that `GOOGLE_CLOUD_PROJECT` is set
2. Verify service account permissions (for local dev)
3. Check Firebase Admin SDK initialization logs
4. Ensure ADC is configured correctly on Cloud Run

### HMAC Signature Verification Failing

**Symptom**: 401 error "HMAC signature verification failed"

**Common Issues**:
1. **Timestamp out of range**: Check server/client clock sync
2. **Invalid signature**: Verify secret matches on client and server
3. **Body hash mismatch**: Ensure raw body bytes are used (not stringified JSON)
4. **Unknown client ID**: Check `FLYPOST_HMAC_SECRETS_JSON` configuration

**Debugging**:
```javascript
// On client side, log the canonical string
console.log('Canonical:', `${timestamp}.${method}.${path}.${bodyHash}`)

// On server side, check logs for HMAC verification errors
// They will show which step failed (timestamp, signature, etc.)
```

### Rate Limiting Issues

**Symptom**: 429 error "Too many event submissions"

**Solutions**:
1. Implement exponential backoff in clients
2. Distribute requests across multiple IPs if legitimate
3. Adjust rate limit configuration if needed (not recommended)
4. Check for infinite retry loops in client code

## Future Enhancements

Potential improvements for future iterations:

1. **Fine-grained Authorization**:
   - Firebase custom claims enforcement
   - Per-client HMAC permission scopes
   - Role-based access control (RBAC)

2. **Enhanced Security**:
   - Request ID tracking for audit trails
   - IP allowlisting for machine clients
   - Per-client rate limiting (in addition to per-IP)

3. **Observability**:
   - Authentication metrics dashboard
   - Automated alerting for auth failures
   - Client usage analytics

4. **Developer Experience**:
   - Client SDKs with built-in auth
   - Auth token refresh handling
   - Better error messages with actionable hints

## References

- [API Specification](../docs/api-specification.md) - Complete API documentation
- [Tools Documentation](../docs/tools.md) - LLM tool integration guide
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) - Firebase Admin SDK documentation
- [HMAC-SHA256](https://en.wikipedia.org/wiki/HMAC) - HMAC algorithm details
