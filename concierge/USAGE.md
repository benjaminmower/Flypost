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

### Using the Test Script

```bash
cd concierge
chmod +x test-concierge.sh
./test-concierge.sh
```

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
}

// Example usage
askConcierge("What's happening near me?", 34.0195, -118.4912);
```

## Widget Integration

### Option 1: Standalone Widget

Simply open `concierge/widget/index.html` in any browser. Update the `API_BASE_URL` constant if needed:

```html
<script>
  const API_BASE_URL = 'https://api.goflypost.com';
</script>
```

### Option 2: Webflow Embed

1. Build the embeddable version:
   ```bash
   cd concierge/widget
   node build.js
   ```

2. Copy the contents of `embeddable.html`

3. In Webflow:
   - Add a "Custom Code" embed element
   - Paste the embeddable code
   - Update the `API_BASE_URL` variable to your backend URL

4. Publish your site

### Option 3: React/Vue/Angular Integration

Create a wrapper component:

```javascript
// React example
import { useEffect } from 'react';

function FlypostConcierge() {
  useEffect(() => {
    // Set API base URL
    window.FLYPOST_API_BASE = 'https://api.goflypost.com';
    
    // Load widget script
    const script = document.createElement('script');
    script.src = '/path/to/concierge-widget.js';
    document.body.appendChild(script);
    
    return () => {
      document.body.removeChild(script);
    };
  }, []);
  
  return <div id="flypost-concierge-container"></div>;
}
```

### Option 4: WordPress Integration

Add to your theme's `footer.php` or use a custom HTML block:

```html
<!-- Flypost Concierge Widget -->
<script>
  window.FLYPOST_API_BASE = 'https://api.goflypost.com';
</script>
<script src="https://cdn.goflypost.com/concierge-widget.js"></script>
```

## Production Deployment

### Backend Deployment (Google Cloud Run example)

1. **Set Environment Variables:**
   ```bash
   gcloud run services update flypost-backend \
     --set-env-vars="ENABLE_CONCIERGE=true,OPENAI_API_KEY=sk-proj-..." \
     --set-env-vars="CONCIERGE_ALLOWED_ORIGINS=https://yourdomain.com"
   ```

2. **Deploy:**
   ```bash
   cd backend
   gcloud run deploy flypost-backend \
     --source . \
     --region us-central1
   ```

### Widget Deployment (Netlify example)

1. **Build the widget:**
   ```bash
   cd concierge/widget
   node build.js
   ```

2. **Deploy to Netlify:**
   ```bash
   # Option A: Netlify CLI
   netlify deploy --dir=. --prod
   
   # Option B: Connect your Git repo to Netlify
   # and it will auto-deploy on push
   ```

3. **Update netlify.toml:**
   ```toml
   [[redirects]]
     from = "/concierge"
     to = "/concierge/widget/index.html"
     status = 200
   ```

### Environment-Specific Configuration

**Development:**
```bash
ENABLE_CONCIERGE=true
OPENAI_API_KEY=sk-proj-...
CONCIERGE_ALLOWED_ORIGINS=http://localhost:5173
```

**Staging:**
```bash
ENABLE_CONCIERGE=true
OPENAI_API_KEY=sk-proj-...
CONCIERGE_ALLOWED_ORIGINS=https://staging.yourdomain.com
```

**Production:**
```bash
ENABLE_CONCIERGE=true
OPENAI_API_KEY=sk-proj-...
CONCIERGE_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Troubleshooting

### Widget Not Loading

**Problem:** Widget shows "Unable to connect to the server"

**Solutions:**
1. Check that `API_BASE_URL` is correct
2. Verify backend is running: `curl https://api.goflypost.com/health`
3. Check browser console for CORS errors
4. Ensure `CONCIERGE_ALLOWED_ORIGINS` includes your domain

### CORS Errors

**Problem:** "has been blocked by CORS policy"

**Solution:** Add your origin to `CONCIERGE_ALLOWED_ORIGINS`:
```bash
CONCIERGE_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Rate Limit Errors

**Problem:** "Too many chat requests"

**Solutions:**
1. Wait 15 minutes for rate limit to reset
2. Adjust rate limits in `backend/src/concierge/routes.js`:
   ```javascript
   const chatLimiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 50, // Increase from 20
   })
   ```

### OpenAI Errors

**Problem:** Chat returns generic error message

**Solutions:**
1. Verify `OPENAI_API_KEY` is set correctly
2. Check API key has credits: https://platform.openai.com/usage
3. Review backend logs for specific error:
   ```bash
   # If using Google Cloud Run
   gcloud logging read "resource.type=cloud_run_revision" --limit 50
   ```

### Location Not Detected

**Problem:** Widget says "Using default location"

**Solutions:**
1. Browser blocked location access - check browser permissions
2. User can still use the widget with default location
3. No action needed - this is expected behavior when location is denied

### Empty Response from Chat

**Problem:** Chat endpoint returns 500 error or empty response

**Solutions:**
1. Check that backend has events to search:
   ```bash
   curl http://localhost:3001/v1/events/near?lat=34&lng=-118 | jq .
   ```
2. Verify OpenAI integration is working - check backend logs
3. Try a simpler message: "What events are near me?"

## Advanced Usage

### Custom System Prompt

Edit `backend/src/concierge/chatHandler.js` to customize the AI behavior:

```javascript
const systemPrompt = `You are a helpful concierge for [Your City].
You specialize in helping people find:
- Open houses
- Community events
- Local activities

Be friendly, concise, and focus on events happening this week.`
```

### Custom Styling

Edit `concierge/widget/index.html` to match your brand:

```css
.flypost-concierge-header {
  background: linear-gradient(135deg, #YOUR_COLOR1 0%, #YOUR_COLOR2 100%);
}

.flypost-message.user {
  background: #YOUR_BRAND_COLOR;
}
```

### Multiple Instances

You can have multiple concierge widgets on different pages with different configurations:

```html
<!-- Page 1: General events -->
<script>
  window.FLYPOST_API_BASE = 'https://api.goflypost.com';
</script>
<div id="concierge-1"></div>

<!-- Page 2: Only open houses -->
<!-- Customize the system prompt via API if needed -->
```

## Monitoring

### Check Logs

**Backend logs:**
```bash
# Google Cloud Run
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# Local development
tail -f backend/logs/app.log
```

**What to look for:**
- `🤖 Concierge chat request:` - Incoming requests
- `✅ Concierge response generated` - Successful responses
- `❌ Concierge error:` - Errors to investigate

### Monitor OpenAI Usage

1. Visit https://platform.openai.com/usage
2. Check token usage for your API key
3. Set up usage alerts if needed

### Analytics

Track usage by adding analytics to the widget:

```javascript
// In concierge/widget/index.html
async function sendMessage() {
  // ... existing code ...
  
  // Track with Google Analytics
  if (typeof gtag !== 'undefined') {
    gtag('event', 'concierge_message_sent', {
      'event_category': 'concierge',
      'event_label': 'chat_interaction'
    });
  }
}
```

## Next Steps

- Review the [Concierge README](README.md) for complete documentation
- Check [API Reference](README.md#api-reference) for endpoint details
- See [Security Features](README.md#security-features) for hardening options
- Read [Cost Considerations](README.md#cost-considerations) for budgeting
