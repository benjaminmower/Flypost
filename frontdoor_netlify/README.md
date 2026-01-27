# Netlify Front Door Routing for Flypost Share Pages

## Overview

This directory contains the Netlify configuration for a **router-only site** that serves as the front door for `goflypost.com`. It implements intelligent routing to direct traffic between the Webflow marketing site and the Flypost API public proxy surface.

## Architecture

The Netlify front door routes traffic to two destinations:

1. **Share page routes (`/e/*`)**: Routed to `api.goflypost.com` (public proxy surface)
   - `api.goflypost.com` is the **public proxy surface**, not the backend
   - `/e/*` is a **public, unauthenticated share surface** (crawler-friendly)
   - Relies on discovery-safe data minimization (no authentication required)
   - Future enhancement: Proxy allow-list for GET /e/* only (planned follow-up)

2. **All other routes (`/*`)**: Routed to Webflow marketing site
   - Destination: `https://flypost.webflow.io/:splat`
   - Purpose: Serve the main marketing website

## Routing Behavior

The front door uses **200 rewrites** (proxy rewrites) to route requests based on URL patterns:

1. **Share page routes (`/e/*`)**: Proxied to the Flypost API public proxy surface
   - Pattern: `/e/*`
   - Destination: `https://api.goflypost.com/e/:splat`
   - Purpose: Handle public share page requests (future: OG tags, shareId resolution)

2. **All other routes (`/*`)**: Proxied to the Webflow marketing site
   - Pattern: `/*`
   - Destination: `https://flypost.webflow.io/:splat`
   - Purpose: Serve the main marketing website

## Configuration Files

### `_redirects` (Canonical Source)

The `_redirects` file is the **canonical source of truth** for routing rules:

```
/e/*  https://api.goflypost.com/e/:splat  200!
/*    https://flypost.webflow.io/:splat  200!
```

- Uses Netlify's `_redirects` file format
- `200!` = force proxy rewrite (preserves the original URL in the browser)
- `:splat` = wildcard that captures the rest of the path

### `netlify.toml`

Contains the same redirect rules in TOML format. Currently duplicates the `_redirects` configuration for compatibility. 

**Maintenance Note**: When updating routing rules, update `_redirects` first (canonical source), then sync changes to `netlify.toml` if needed. Netlify gives precedence to `_redirects` when both files are present.

## Current Scope: Share Page Implementation Complete ✅

**Share page routes (`/e/:slug/:fpid`)**: Fully implemented with the following features:

### URL Structure (Zillow-Inspired)
- **Pattern**: `/e/:slug/:fpid`
- **Example**: `/e/open-house-810-franklin-st-santa-monica/evt_k7x9m2p4q_1641234567890_fpid`
- **Slug**: SEO-friendly (ignored by backend, derived from event name + address)
- **fpid**: Machine ID format `evt_{random}_{timestamp}_fpid` (used for event lookup)

### Features
- ✅ **Public, unauthenticated surface** (crawler-friendly, explicitly exempted from origin enforcement)
- ✅ **Open Graph metadata** for social media previews (Facebook, Twitter, LinkedIn)
- ✅ **Timezone-aware formatting** using `Intl.DateTimeFormat` with event timezone
- ✅ **Smart occurrence selection**: Prefers current → next upcoming → most recent
- ✅ **External link validation**: XSS prevention (only http/https allowed)
- ✅ **HTML escaping**: All dynamic content sanitized
- ✅ **Strict fpid validation**: Regex validation before storage lookup
- ✅ **Cache headers**: Browser 5min, CDN 10min
- ✅ **Discovery V1 integration**: `shareUrl` field in all event API responses
- ✅ **Frontend share UI**: Copy button with safe event listeners

### Security Hardening
- Strict regex validation on fpid format (prevents storage abuse)
- External URL validation (blocks javascript:, data:, etc.)
- HTML escaping on all dynamic content
- Safe event listeners (no inline JavaScript)
- Explicit /e/* exemption in proxy (order-proof, impossible to accidentally auth-gate)

## Testing

### Expected Behavior

1. **Root domain** (`https://goflypost.com/`):
   - Should load the Webflow marketing site
   - URL remains `https://goflypost.com/` in the browser
   - Content is proxied from `https://flypost.webflow.io/`

2. **Share page routes** (`https://goflypost.com/e/event-name/evt_abc123_fpid`):
   - Should proxy to the public proxy surface (api.goflypost.com)
   - URL remains in browser
   - Returns HTML with Open Graph metadata
   - Content is proxied from `https://api.goflypost.com/e/:slug/:fpid`
   - This is a **public, unauthenticated surface** designed for crawler access
   - Invalid fpid formats return 404 without hitting storage

### Manual Testing

```bash
# Test root domain (should show Webflow site)
curl -I https://goflypost.com/

# Test share page route (should return HTML with OG tags)
curl https://goflypost.com/e/open-house-test/evt_abc123_1641234567890_fpid

# Test invalid fpid (should return 404)
curl https://goflypost.com/e/test/invalid_format

# Test arbitrary path (should show Webflow site)
curl -I https://goflypost.com/about
```

## Deployment

This configuration is deployed as a standalone Netlify site configured to serve the `goflypost.com` domain. The site has:

- **Build command**: None (router-only, no build required)
- **Publish directory**: Current directory (contains only config files)
- **Domain**: `goflypost.com`

## Relationship to Other Netlify Sites

- **Root `netlify.toml`**: Reserved for other surfaces (e.g., frontend app deployment)
- **Other frontends**: Each frontend (frontend_ask, frontend_post, etc.) has its own Netlify configuration

This front door routing is **independent** and does not interfere with other deployments.

## Share Page Features ✅ IMPLEMENTED

The following share page features have been fully implemented:

1. ✅ **Share URL Generation** (Discovery V1 field)
   - Zillow-style URLs with SEO-friendly slugs
   - Format: `https://goflypost.com/e/{slug}/{eventId}_fpid`
   - Automatically generated for all events
   - Included in Discovery V1 API responses

2. ✅ **Public Share Pages with Open Graph Tags**
   - HTML rendering with OG metadata for social previews
   - Twitter Card support
   - Responsive design with mobile support

3. ✅ **Social Media Previews**
   - Facebook, Twitter, LinkedIn compatible
   - Preview cards with event name, date, location, image

4. ✅ **External Link Validation**
   - XSS prevention (only http/https schemes allowed)
   - Blocks javascript:, data:, etc.

5. ✅ **SEO-Friendly Zillow-style URLs**
   - Human-readable slugs from event name + address
   - Machine ID (fpid) for backend lookup
   - Multiple slugs can point to same event

6. ✅ **Timezone-Aware Formatting**
   - Uses `Intl.DateTimeFormat` with event timezone
   - Displays dates/times in correct timezone
   - Prevents server timezone bleed

7. ✅ **Security Hardened**
   - Strict fpid regex validation
   - HTML escaping on all dynamic content
   - Safe event listeners (no inline JS)
   - Explicit /e/* public exemption in proxy

8. ✅ **Smart Occurrence Selection**
   - Prefers current occurrence (if active)
   - Falls back to next upcoming
   - Falls back to most recent past
   - Prevents "first occurrence was last month" bugs

## Future Enhancements

## Troubleshooting

### Issue: Share page not loading
- **Check**: Verify event exists with valid eventId
- **Check**: Verify fpid format is correct: `evt_{random}_{timestamp}_fpid`
- **Check**: Verify backend and proxy are running
- **Note**: Invalid fpid formats return 404 without hitting storage

### Issue: Webflow content not loading
- **Check**: Verify `https://flypost.webflow.io/` is accessible
- **Check**: Netlify site is properly configured with domain `goflypost.com`

### Issue: Redirect loops
- **Check**: Ensure `force = true` (or `200!`) is set to prevent redirect chains
- **Check**: Verify both destinations (API, Webflow) don't redirect back to `goflypost.com`
