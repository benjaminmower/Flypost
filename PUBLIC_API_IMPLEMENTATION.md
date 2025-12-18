# Flypost "Ask" - Public Read-Only API Implementation

## Overview

This document describes the implementation of the public read-only API layer for Flypost "ask", deployed to `ask.goflypost.com`. This API provides a safe, public discovery surface for real estate events while maintaining strict separation from write operations.

## Architecture

### Two-Layer North Star Compliance

The implementation strictly enforces the Flypost Two-Layer North Star:
- **Layer 1 (Registry)**: Public, discoverable event data (location, dates, basic info)
- **Layer 2 (Intelligence)**: Private feedback, attendance, and sentiment data (never exposed)

All discovery API responses contain only Layer 1 fields, with runtime sanitization to prevent drift.

## Endpoints

### 1. GET `/v1/events/{event_id}`

Retrieve a single event by its unique ID.

**Parameters:**
- `event_id` (path): Unique event identifier
- `brokerage_id` (query, optional): Brokerage identifier for full fidelity access

**Response:** DiscoveryEventV1 object with fields based on access tier

**Example:**
```bash
# Public tier (reduced precision)
curl https://ask.goflypost.com/v1/events/evt_20250115_abc123

# Brokerage tier (full precision)
curl https://ask.goflypost.com/v1/events/evt_20250115_abc123?brokerage_id=broker_123
```

### 2. GET `/v1/events/near`

Find events near a geographic location with optional date filtering.

**Parameters:**
- `lat` (query, required): Latitude (-90 to 90)
- `lng` (query, required): Longitude (-180 to 180)
- `radius_mi` (query, optional): Search radius in miles (0.1 to 50, default: 10)
- `start` (query, optional): Filter events starting on/after this date (ISO 8601)
- `end` (query, optional): Filter events ending on/before this date (ISO 8601)
- `brokerage_id` (query, optional): Brokerage identifier for full fidelity access

**Response:** Array of DiscoveryEventV1 objects with metadata

**Example:**
```bash
# Find events in Santa Monica
curl "https://ask.goflypost.com/v1/events/near?lat=34.015&lng=-118.495&radius_mi=5"

# Find events in January 2025
curl "https://ask.goflypost.com/v1/events/near?lat=34.015&lng=-118.495&start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z"

# Brokerage-scoped query
curl "https://ask.goflypost.com/v1/events/near?lat=34.015&lng=-118.495&brokerage_id=broker_123"
```

## Two-Tier Access Control

### Public Tier (Anonymous)
Access when no `brokerage_id` or API key is provided.

**Characteristics:**
- Rate limit: 100 requests per 15 minutes
- Geo precision: 2 decimal places (~1km accuracy)
- Address: City and region only (no street address or postal code)
- Description: Truncated to 200 characters
- Metadata: No submission timestamp or update count
- Anomaly detection: Logged if exceeds 50 requests in 5 minutes

**Example Response:**
```json
{
  "success": true,
  "schemaVersion": "discovery.v1",
  "event": {
    "eventId": "evt_20250115_abc123",
    "category": "open_house",
    "name": "Beautiful Home in Santa Monica",
    "description": "Stunning 4BR/3BA modern home...",
    "startDate": "2025-01-15T10:00:00Z",
    "geo": {
      "latitude": 34.02,
      "longitude": -118.5
    },
    "address": {
      "addressLocality": "Santa Monica",
      "addressRegion": "CA",
      "addressCountry": "US"
    }
  },
  "meta": {
    "accessTier": "public"
  }
}
```

### Brokerage Tier (Authenticated)
Access when `brokerage_id` or API key is provided.

**Characteristics:**
- Rate limit: 500 requests per 15 minutes
- Geo precision: Full precision (6+ decimal places)
- Address: Complete address including street and postal code
- Description: Full length (up to 500 characters)
- Metadata: Includes submission timestamp and update count

**Example Response:**
```json
{
  "success": true,
  "schemaVersion": "discovery.v1",
  "event": {
    "eventId": "evt_20250115_abc123",
    "category": "open_house",
    "name": "Beautiful Home in Santa Monica",
    "description": "Stunning 4BR/3BA modern home with ocean views...",
    "startDate": "2025-01-15T10:00:00Z",
    "geo": {
      "latitude": 34.015234,
      "longitude": -118.495678
    },
    "address": {
      "streetAddress": "123 Ocean Avenue",
      "addressLocality": "Santa Monica",
      "addressRegion": "CA",
      "postalCode": "90401",
      "addressCountry": "US"
    },
    "submissionTimestamp": "2025-01-01T12:00:00Z",
    "updateCount": 2
  },
  "meta": {
    "accessTier": "brokerage"
  }
}
```

## Date Filtering

Events can be filtered by date range using ISO 8601 date-time strings.

**Filter Logic:**
- Events are included if they overlap with the requested date range
- `start` parameter: Include events that end on or after this date
- `end` parameter: Include events that start on or before this date
- Events with only `startDate` (no `endDate`) are treated as single-day events

**Examples:**
```bash
# Events starting after Jan 15, 2025
curl "https://ask.goflypost.com/v1/events/near?lat=34&lng=-118&start=2025-01-15T00:00:00Z"

# Events in January 2025
curl "https://ask.goflypost.com/v1/events/near?lat=34&lng=-118&start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z"

# Events ending before Feb 1, 2025
curl "https://ask.goflypost.com/v1/events/near?lat=34&lng=-118&end=2025-02-01T00:00:00Z"
```

## Rate Limiting & Abuse Controls

### Rate Limits
- **Public tier**: 100 requests per 15 minutes per IP
- **Brokerage tier**: 500 requests per 15 minutes per IP
- Automatically applied based on access tier (no configuration needed)

### Anomaly Detection
- Tracks requests per IP in a 5-minute sliding window
- Logs a warning if an IP exceeds 50 requests in 5 minutes
- Does not block requests (only logs for monitoring)

### Input Validation
All query parameters are validated:
- `lat`: Must be between -90 and 90
- `lng`: Must be between -180 and 180
- `radius`: Must be between 0 and 100 km
- `start`/`end`: Must be valid ISO 8601 date-time strings

Invalid inputs return HTTP 400 with descriptive error messages.

## Security

### Input Validation
- All query parameters validated with strict ranges
- Coordinates validated to prevent injection attacks
- Date parameters validated to prevent malformed inputs

### API Key Handling
- Preferred: `x-api-key` header
- Fallback: `api_key` query parameter (for AI plugin compatibility)
- Never logged or exposed in responses

### Data Sanitization
- Runtime sanitizer strips any Layer 2 intelligence fields
- Logs warnings if drift is detected
- Ensures only Layer 1 registry data is exposed

### Security Contact
- Security.txt available at `/.well-known/security.txt`
- Contact: security@goflypost.com
- Response time: 48 hours
- Coordinated disclosure preferred

## AI Plugin Integration

### OpenAPI Specification
Available at two locations:
- `/openapi.yaml`
- `/.well-known/openapi.yaml`

### AI Plugin Manifest
Located at `/.well-known/ai-plugin.json`

**Features:**
- Compatible with ChatGPT and other AI assistants
- Describes the discovery endpoints
- Includes human-readable descriptions
- No authentication required (public API)

**Usage Example:**
```
User: "Find open houses in Santa Monica this weekend"
AI: *Calls /v1/events/near with appropriate parameters*
```

## Testing

### Unit Tests
Location: `backend/test-public-api.js`

Tests cover:
- Two-tier access control (geo precision, field restrictions)
- Description truncation by tier
- Metadata inclusion/exclusion
- Date filtering logic
- Access tier determination
- Anomaly detection

Run tests:
```bash
cd backend
node test-public-api.js
```

### Integration Tests
Location: `backend/test-discovery-v1.js`

Tests cover:
- Discovery V1 mapping
- Description truncation
- Forbidden keys detection
- Runtime sanitizer
- Event identity computation
- Array mapping

### Manual Testing
1. Start the server: `npm start`
2. Add test events: Use `/api/test-add-event` endpoint
3. Test endpoints with curl commands (see examples above)

## Deployment

### Frontend (Static Files)
Deploy `frontend_ask/public/` to a static hosting service:
- Netlify
- Vercel
- CloudFlare Pages
- AWS S3 + CloudFront

Ensure the following files are accessible:
- `/openapi.yaml`
- `/.well-known/openapi.yaml`
- `/.well-known/ai-plugin.json`
- `/.well-known/security.txt`

### Backend (API Server)
Deploy `backend/` to:
- Google Cloud Run
- AWS ECS
- Heroku
- Any Node.js hosting service

Environment variables:
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Set to "production" to disable dev utilities
- `ENABLE_CONCIERGE`: Set to "true" to enable Web Concierge (optional)
- Firestore credentials (if using Firestore storage)

### Domain Setup
Point `ask.goflypost.com` to your deployment:
- Frontend: Static files
- Backend: API server at root

Example nginx config:
```nginx
server {
    listen 443 ssl;
    server_name ask.goflypost.com;
    
    # Static files
    location /.well-known/ {
        root /var/www/ask/public;
    }
    
    location /openapi.yaml {
        root /var/www/ask/public;
    }
    
    # API endpoints
    location /v1/ {
        proxy_pass http://backend:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Monitoring

### Key Metrics to Track
1. **Request volume**: Requests per minute/hour
2. **Access tier distribution**: Public vs brokerage requests
3. **Rate limit hits**: How often limits are reached
4. **Anomaly detections**: IPs flagged for suspicious activity
5. **Error rates**: 4xx and 5xx responses
6. **Response times**: P50, P95, P99 latencies

### Logs to Monitor
- Anomaly detection warnings: `⚠️  ANOMALY DETECTED`
- Drift detection warnings: `⚠️  DRIFT DETECTED`
- Rate limit hits: Check HTTP 429 responses
- Invalid input attempts: HTTP 400 responses

## Future Enhancements

### Potential Improvements
1. **Caching**: Add Redis for frequently accessed events
2. **Pagination**: Support cursor-based pagination for large result sets
3. **Geohashing**: Optimize geo queries with spatial indexing
4. **API versioning**: Support multiple API versions simultaneously
5. **Webhooks**: Notify clients of event updates
6. **Search**: Full-text search across event names and descriptions
7. **Filtering**: Additional filters (category, date range presets)
8. **Analytics**: Aggregate query patterns and popular locations

### Scaling Considerations
- Current implementation uses in-memory storage (suitable for MVP)
- For production scale, use Firestore or PostgreSQL with PostGIS
- Consider CDN for static files and API caching
- Implement connection pooling for database
- Add load balancing for multiple backend instances

## Troubleshooting

### Common Issues

**Issue: Rate limit exceeded**
- Solution: Reduce request frequency or use brokerage tier access
- Check: Current rate limit status in response headers

**Issue: Invalid coordinates**
- Solution: Verify lat/lng are within valid ranges
- Check: Error message for specific validation failure

**Issue: No events returned**
- Solution: Expand search radius or adjust date filters
- Check: Query parameters for typos

**Issue: Public tier shows reduced data**
- Solution: Provide `brokerage_id` for full fidelity access
- Check: Response includes `"accessTier": "brokerage"`

## Support

For questions or issues:
- Technical support: support@goflypost.com
- Security issues: security@goflypost.com
- Documentation: https://goflypost.com/docs
- GitHub issues: https://github.com/goflypost/v4/issues

## License

Apache 2.0 - See LICENSE file for details
