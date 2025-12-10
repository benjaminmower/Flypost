# Brokerage-Specific Widget Integration Guide

This guide explains how to embed the Flypost Concierge widget with brokerage-specific branding and filtering on your website or Webflow pages.

## Overview

The Flypost Concierge widget can be customized for each brokerage with:
- **Custom branding** (colors, logo, header text)
- **Filtered events** (only shows events from your brokerage)
- **Theme CSS** for consistent brand identity

## Quick Start

### 1. Basic Integration

Add these elements to your HTML page:

```html
<!-- Container for the widget -->
<div id="flypost-concierge-container"></div>

<!-- Widget Configuration -->
<script>
  window.FLYPOST_CONFIG = {
    apiBase: 'https://api.goflypost.com',
    brokerageId: 'your-brokerage-id',
    branding: {
      name: 'Your Brokerage Name',
      primaryColor: '#1a1a1a',
      accentColor: '#c9a962',
      logo: 'https://your-domain.com/logo.png',
      headerText: 'Discover Our Open Houses'
    }
  };
</script>

<!-- Widget Styles -->
<link rel="stylesheet" href="https://cdn.goflypost.com/concierge-widget.css">

<!-- Optional: Brokerage Theme -->
<link rel="stylesheet" href="https://cdn.goflypost.com/themes/your-theme.css">

<!-- Widget Script -->
<script src="https://cdn.goflypost.com/concierge-widget.js"></script>
```

### 2. Configuration Options

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `apiBase` | string | Backend API URL (production: `https://api.goflypost.com`) |
| `brokerageId` | string | Your unique brokerage identifier |

#### Branding Options

| Field | Type | Description |
|-------|------|-------------|
| `branding.name` | string | Your brokerage's display name |
| `branding.primaryColor` | string | Primary brand color (hex code) |
| `branding.accentColor` | string | Accent color for hover states (hex code) |
| `branding.logo` | string | URL to your logo image (optional) |
| `branding.headerText` | string | Custom header text for the widget |

## Brokerage Examples

### Vista Sotheby's International Realty

```html
<div id="flypost-concierge-container"></div>

<script>
  window.FLYPOST_CONFIG = {
    apiBase: 'https://api.goflypost.com',
    brokerageId: 'vista-sir',
    branding: {
      name: 'Vista Sotheby\'s International Realty',
      primaryColor: '#1a1a1a',
      accentColor: '#c9a962',
      logo: 'https://assets.goflypost.com/logos/vista-sir.png',
      headerText: 'Discover Vista Sotheby\'s Open Houses'
    }
  };
</script>

<link rel="stylesheet" href="https://cdn.goflypost.com/concierge-widget.css">
<link rel="stylesheet" href="https://cdn.goflypost.com/themes/vista-sir.css">
<script src="https://cdn.goflypost.com/concierge-widget.js"></script>
```

### Compass Real Estate

```html
<div id="flypost-concierge-container"></div>

<script>
  window.FLYPOST_CONFIG = {
    apiBase: 'https://api.goflypost.com',
    brokerageId: 'compass',
    branding: {
      name: 'Compass',
      primaryColor: '#d82327',
      accentColor: '#b01d20',
      logo: 'https://assets.goflypost.com/logos/compass.png',
      headerText: 'Discover Compass Open Houses'
    }
  };
</script>

<link rel="stylesheet" href="https://cdn.goflypost.com/concierge-widget.css">
<link rel="stylesheet" href="https://cdn.goflypost.com/themes/compass.css">
<script src="https://cdn.goflypost.com/concierge-widget.js"></script>
```

### Berkshire Hathaway HomeServices Utah

```html
<div id="flypost-concierge-container"></div>

<script>
  window.FLYPOST_CONFIG = {
    apiBase: 'https://api.goflypost.com',
    brokerageId: 'bhhs-utah',
    branding: {
      name: 'Berkshire Hathaway HomeServices Utah',
      primaryColor: '#003da5',
      accentColor: '#0051d5',
      logo: 'https://assets.goflypost.com/logos/bhhs-utah.png',
      headerText: 'Discover BHHS Utah Open Houses'
    }
  };
</script>

<link rel="stylesheet" href="https://cdn.goflypost.com/concierge-widget.css">
<link rel="stylesheet" href="https://cdn.goflypost.com/themes/bhhs-utah.css">
<script src="https://cdn.goflypost.com/concierge-widget.js"></script>
```

## Webflow Integration

For Webflow sites (e.g., `ask.goflypost.com/vista`):

1. **Create a new page** in Webflow (e.g., `/vista`, `/compass`, `/bhhs-utah`)

2. **Add an Embed element** from the Webflow components panel

3. **Paste the integration code** into the embed:
   ```html
   <div id="flypost-concierge-container"></div>
   
   <script>
     window.FLYPOST_CONFIG = {
       apiBase: 'https://api.goflypost.com',
       brokerageId: 'vista-sir',
       branding: {
         name: 'Vista Sotheby\'s International Realty',
         primaryColor: '#1a1a1a',
         accentColor: '#c9a962',
         logo: 'https://assets.goflypost.com/logos/vista-sir.png',
         headerText: 'Discover Vista Sotheby\'s Open Houses'
       }
     };
   </script>
   
   <link rel="stylesheet" href="https://cdn.goflypost.com/concierge-widget.css">
   <link rel="stylesheet" href="https://cdn.goflypost.com/themes/vista-sir.css">
   <script src="https://cdn.goflypost.com/concierge-widget.js"></script>
   ```

4. **Publish** your Webflow site

## Custom Themes

### Creating a Custom Theme

If you need a custom theme for your brokerage, create a CSS file with your brand styles:

```css
/* my-brokerage.css */

.flypost-concierge-header {
  background: linear-gradient(135deg, #your-color 0%, #your-accent 100%);
}

.flypost-message.user {
  background: #your-color !important;
}

.flypost-concierge-input button {
  background: #your-color !important;
}

.flypost-concierge-input button:hover:not(:disabled) {
  background: #your-accent !important;
}

.flypost-concierge-input input:focus {
  border-color: #your-color !important;
}
```

### Available Theme Files

Pre-built themes are available for:
- `vista-sir.css` - Vista Sotheby's International Realty
- `compass.css` - Compass Real Estate
- `bhhs-utah.css` - Berkshire Hathaway HomeServices Utah

## How It Works

### Event Filtering

When you specify a `brokerageId`, the widget:
1. **Sends the brokerageId** to the backend API
2. **Filters events** to only show those associated with your brokerage
3. **Displays results** with your custom branding

### Backend Flow

```
Widget → /api/chat → OpenAI → getEventsNear(brokerageId) → /v1/events/near?brokerageId=... → Filtered Events
```

The backend automatically filters events by checking:
- `event.brokerageId === brokerageId`
- `event.flypost.brokerageId === brokerageId`

## Testing Locally

To test the widget locally:

1. **Start the backend** with concierge enabled:
   ```bash
   cd backend
   ENABLE_CONCIERGE=true npm start
   ```

2. **Open an example** in your browser:
   ```
   concierge/widget/examples/vista-sir-example.html
   ```

3. **Update the apiBase** in the HTML to point to localhost:
   ```javascript
   window.FLYPOST_CONFIG = {
     apiBase: 'http://localhost:3001',
     // ... rest of config
   };
   ```

## Deployment Checklist

- [ ] Configure `ENABLE_CONCIERGE=true` in backend environment
- [ ] Set up `OPENAI_API_KEY` for chat functionality
- [ ] Add your domain to `CONCIERGE_ALLOWED_ORIGINS` for CORS
- [ ] Host widget files on CDN (e.g., Cloudflare)
- [ ] Create brokerage-specific Webflow pages
- [ ] Test each brokerage integration
- [ ] Verify event filtering works correctly

## Support

For questions or custom integrations, contact the Flypost team.

## Security Notes

- Always use HTTPS in production
- The widget respects CORS restrictions
- User location data is handled with GDPR compliance
- Rate limiting protects against abuse (20 requests per 15 minutes per IP)
