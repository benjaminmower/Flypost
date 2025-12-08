# Web Concierge Feature

The Web Concierge is an anonymous web chat client that integrates the Flypost backend with OpenAI APIs to help users discover nearby events through natural conversation.

## Overview

The Web Concierge feature provides:

- **Anonymous chat interface** for event discovery
- **OpenAI-powered responses** using GPT-4o-mini
- **Geolocation-based search** for nearby events
- **Complete isolation** from v4 production ingestion loop
- **GDPR compliance** with no PII storage
- **Rate limiting and security** hardening

## Architecture

```
┌─────────────────┐
│  Widget (HTML)  │
│  - User input   │
│  - Geolocation  │
└────────┬────────┘
         │
         │ POST /api/chat
         │ { message, lat, lng }
         ▼
┌─────────────────┐
│ Backend Routes  │
│  - Validation   │
│  - Rate limit   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│  Chat Handler   │─────▶│  OpenAI API  │
│  - Tool calls   │◀─────│  GPT-4o-mini │
└────────┬────────┘      └──────────────┘
         │
         │ getEventsNear()
         ▼
┌─────────────────┐
│ /v1/events/near │
│  (existing API) │
└─────────────────┘
```

## Setup

### 1. Environment Variables

Add to your `.env` file:

```bash
# Enable the Web Concierge feature
ENABLE_CONCIERGE=true

# OpenAI API key (required)
OPENAI_API_KEY=sk-...

# Allowed origins for CORS (comma-separated)
CONCIERGE_ALLOWED_ORIGINS=https://your-webflow-site.webflow.io,https://yourdomain.com
```

### 2. Start the Backend

The concierge routes are automatically loaded when `ENABLE_CONCIERGE=true`:

```bash
cd backend
npm install
npm start
```

You should see:
```
🎯 Web Concierge feature enabled
✅ Web Concierge routes mounted at /api/chat
```

### 3. Deploy the Widget

#### Option A: Standalone HTML (Development)

1. Open `concierge/widget/index.html` in a browser
2. Update the `API_BASE_URL` constant to point to your backend

#### Option B: Webflow Integration

1. Add a custom HTML embed to your Webflow page:

```html
<div id="flypost-concierge"></div>
<script>
  window.FLYPOST_API_BASE = 'https://your-backend-url.com';
</script>
<script src="https://your-cdn.com/flypost-concierge.min.js"></script>
```

2. Or inline the widget code directly in Webflow's custom code section

#### Option C: Netlify Deployment

Add to `netlify.toml`:

```toml
[[redirects]]
  from = "/concierge"
  to = "/concierge/widget/index.html"
  status = 200
```

## API Reference

### POST /api/chat

Chat with the concierge to discover nearby events.

**Request:**
```json
{
  "message": "What events are happening near me?",
  "lat": 34.0195,
  "lng": -118.4912
}
```

**Response:**
```json
{
  "success": true,
  "message": "I found 3 events near you: ...",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Rate Limits:**
- 20 requests per 15 minutes per IP

### GET /api/chat/health

Health check for the concierge service.

**Response:**
```json
{
  "status": "healthy",
  "service": "web-concierge",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "configured": true
}
```

## Security Features

### Rate Limiting
- 20 chat requests per IP per 15 minutes
- Prevents abuse and controls OpenAI API costs

### CORS Protection
- Configurable allowed origins via `CONCIERGE_ALLOWED_ORIGINS`
- Prevents unauthorized cross-origin requests

### Request Validation
- Validates message format and content
- Validates coordinate ranges
- Sanitizes all user inputs

### GDPR Compliance
- No PII stored in logs
- Only logs: coordinates (rounded to 4 decimals), message length, timestamp
- No cookies or tracking

### Timeout Protection
- 10-second timeout on backend API calls
- Prevents hanging requests

## Feature Flag

The Web Concierge is controlled by the `ENABLE_CONCIERGE` environment variable:

- `ENABLE_CONCIERGE=true` - Feature enabled
- `ENABLE_CONCIERGE=false` or unset - Feature disabled (default)

When disabled, the `/api/chat` endpoint is not mounted, ensuring **zero impact** on the production v4 ingestion loop.

## Customization

### Widget Styling

Edit `concierge/widget/index.html` to customize:

- **Colors**: Update the gradient in `.flypost-concierge-header`
- **Size**: Adjust `max-width` in `.flypost-concierge-widget`
- **Messages**: Change height in `.flypost-concierge-messages`

### System Prompt

Edit `concierge/backend/chatHandler.js` to customize the AI assistant's behavior:

```javascript
const systemPrompt = `You are a helpful Web Concierge assistant...`
```

### Rate Limits

Edit `concierge/backend/routes.js` to adjust rate limits:

```javascript
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // window
  max: 20,                    // max requests
})
```

## Monitoring

### Logs

The concierge logs all requests (GDPR-compliant):

```
🤖 Concierge chat request: lat=34.0195, lng=-118.4912, msg_length=42
✅ Concierge response generated (1234ms)
```

### Errors

Errors are logged with details:

```
❌ Concierge error: OpenAI API timeout
```

## Testing

### Manual Testing

1. Start the backend with `ENABLE_CONCIERGE=true`
2. Open the widget in a browser
3. Allow location access (or use default location)
4. Send a message: "What events are near me?"
5. Verify the response includes nearby events

### Health Check

```bash
curl http://localhost:3001/api/chat/health
```

### Chat API Test

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What events are happening near Santa Monica?",
    "lat": 34.0195,
    "lng": -118.4912
  }'
```

## Troubleshooting

### Widget doesn't load

- Check browser console for errors
- Verify `API_BASE_URL` is correct
- Check CORS settings in backend

### "Location access denied"

- Widget uses default location (Santa Monica, CA)
- User can still chat normally

### "Too many chat requests"

- Rate limit exceeded
- Wait 15 minutes or adjust rate limits

### OpenAI errors

- Verify `OPENAI_API_KEY` is set
- Check API key has sufficient credits
- Check OpenAI service status

## Cost Considerations

### OpenAI API Costs

- Model: GPT-4o-mini (cost-effective)
- Average cost: ~$0.001-0.002 per chat message
- Rate limit: 20 requests/15min/IP = max ~$0.04/hour/IP

### Recommendations

- Monitor OpenAI usage dashboard
- Adjust rate limits based on budget
- Consider switching to GPT-3.5-turbo for lower costs
- Implement user authentication for better control

## Deployment Checklist

- [ ] Set `ENABLE_CONCIERGE=true`
- [ ] Set `OPENAI_API_KEY`
- [ ] Configure `CONCIERGE_ALLOWED_ORIGINS`
- [ ] Test chat endpoint locally
- [ ] Test widget with real location
- [ ] Deploy backend
- [ ] Deploy widget to CDN or embed in Webflow
- [ ] Monitor logs and costs
- [ ] Set up alerts for high usage

## Support

For issues or questions:

1. Check the logs for error messages
2. Verify all environment variables are set
3. Test the health endpoint
4. Check the main v4 README for backend setup

## License

Apache-2.0 (same as parent project)
