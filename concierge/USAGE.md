# Web Concierge Usage Examples

This document provides practical examples for using the Web Concierge feature.

## Table of Contents
1. [Local Development Setup](#local-development-setup)
2. [Testing the Chat API](#testing-the-chat-api)
3. [Widget Integration](#widget-integration)
4. [Production Deployment](#production-deployment)
5. [Troubleshooting](#troubleshooting)

## Local Development Setup

### Step 1: Configure Environment

Create a `.env` file in the `backend/` directory:

```bash
# Enable the concierge feature
ENABLE_CONCIERGE=true

# OpenAI API key (required)
OPENAI_API_KEY=sk-proj-...your-key-here

# Optional: CORS allowed origins
CONCIERGE_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080

# Optional: Backend port
PORT=3001
```

### Step 2: Start the Backend

```bash
cd backend
npm install
npm start
```

You should see:
```
🎯 Web Concierge feature enabled
✅ Web Concierge routes mounted at /api/chat
🚀 Flypost v4 Backend Server Started
📡 Listening on port 3001
```

### Step 3: Test the Widget

Open `concierge/widget/index.html` in your browser. The widget will:
1. Request your location (or use default: Santa Monica, CA)
2. Display a chat interface
3. Allow you to ask about nearby events

## Testing the Chat API

### Using cURL

**Health Check:**
```bash
curl http://localhost:3001/api/chat/health | jq .
```

**Simple Chat Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What events are happening near me?",
    "lat": 34.0195,
    "lng": -118.4912
  }' | jq .
```

**Search with Different Location:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me open houses this weekend",
    "lat": 40.7128,
    "lng": -74.0060
  }' | jq .
```

### Expected Response Format

```json
{
  "success": true,
  "message": "Here are the open houses in Santa Monica this weekend:",
  "listings": [
    {
      "eventId": "evt_abc123",
      "shareUrl": "https://goflypost.com/e/open-house-2517-24th-st/evt_abc123_fpid",
      "what": {
        "type": "open_house",
        "label": "Open House at 2517 24th St"
      },
      "where": {
        "address": "2517 24th St, Santa Monica, CA 90403",
        "latitude": 34.0195,
        "longitude": -118.4912
      },
      "when": {
        "start": "2026-02-01T21:00:00Z",
        "end": "2026-02-02T00:00:00Z",
        "displayLocal": "1:00 PM – 4:00 PM PT"
      },
      "externalListingUrl": "https://www.zillow.com/..."
    }
  ]
}
```

**Key Response Fields:**
- `shareUrl` - **Primary link** to Flypost share page with Check In, Calendar, Maps
- `externalListingUrl` - **Secondary link** to external listing (if available)
- `when.displayLocal` - Pre-formatted local time string (e.g., "1:00 PM – 4:00 PM PT")

### Using JavaScript/Fetch

```javascript
async function askConcierge(message, lat, lng) {
  const response = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: message,
      lat: lat,
      lng: lng
    })
  });
  
  const data = await response.json();
  console.log(data.message);
  
  // Access shareUrl from listings
  if (data.listings && data.listings.length > 0) {
    console.log('First event share URL:', data.listings[0].shareUrl);
  }
}

// Example usage
askConcierge("What's happening near me?", 34.0195, -118.4912);
```

## Widget Integration

### Standalone Widget

Simply open `concierge/widget/index.html` in any browser. Update the `API_BASE_URL` constant if needed:

```html
<script>
  const API_BASE_URL = 'https://api.goflypost.com';
</script>
```

## Production Deployment

### Backend Deployment (Google Cloud Run example)

1. **Set Environment Variables:**
   ```bash
   gcloud run services update flypost-backend \
     --set-env-vars="ENABLE_CONCIERGE=true,OPENAI_API_KEY=sk-proj-..." \
     --set-env-vars="CONCIERGE_ALLOWED_ORIGINS=https://ask.goflypost.com"
   ```

2. **Deploy:**
   ```bash
   cd backend
   gcloud run deploy flypost-backend \
     --source . \
     --region us-central1
   ```

### Environment-Specific Configuration

**Development:**
```bash
ENABLE_CONCIERGE=true
OPENAI_API_KEY=sk-proj-...
CONCIERGE_ALLOWED_ORIGINS=http://localhost:5173
```

**Production:**
```bash
ENABLE_CONCIERGE=true
OPENAI_API_KEY=sk-proj-...
CONCIERGE_ALLOWED_ORIGINS=https://ask.goflypost.com
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

## API Behavior Notes

### Global Public Discovery

This is a **global public discovery interface**. Key behaviors:

- **No brokerageId filtering**: Any `brokerageId` in the request is silently ignored
- **Public event registry**: Returns all public events near the provided coordinates
- **Privacy-first**: No PII storage, GDPR compliant
- **Rate limited**: 20 requests per 15 minutes per IP

### Response Format

Concierge responses are Markdown-formatted and include:

1. **Primary CTA**: Flypost share URLs in bold (e.g., `**[🏠 View on Flypost](url)**`)
2. **Secondary links**: External listing URLs if available (e.g., "Also listed on [Zillow](url)")
3. **Event details**: Time (using `displayLocal`), price, beds/baths, distance
4. **Suggested follow-ups**: 2-4 contextual questions

### Tier 2 Disclosure

When concierge provides general knowledge (schools, neighborhoods, safety), it includes:

> ⚠️ Important: This is general area information based on general knowledge, not Flypost event data — verify with official sources before making decisions.

## Cost Considerations

### OpenAI API Costs

- Model: GPT-4o-mini (cost-effective)
- Average cost: ~$0.001-0.002 per chat message
- Rate limit: 20 requests/15min/IP = max ~$0.04/hour/IP

### Recommendations

- Monitor OpenAI usage dashboard
- Adjust rate limits based on budget
- Consider switching to GPT-3.5-turbo for lower costs

## Support

For issues or questions:

1. Check the logs for error messages
2. Verify all environment variables are set
3. Test the health endpoint
4. Check the main v4 README for backend setup
