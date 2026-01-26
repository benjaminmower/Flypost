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

## Current Scope: Routing Substrate + Share Handler

✅ **Implemented**:

- ✅ Backend handler for `/e/:shareId` with OG tags for social previews
- ✅ 404 response for unknown share IDs
- ✅ Caching headers for crawler-friendly previews
- ✅ Proxy enforcement for GET-only `/e/*` share surface

⚠️ **Still pending**:

- ❌ ShareId generation and minting
- ❌ Share page UI/templates (beyond OG preview HTML)

## Testing

### Expected Behavior

1. **Root domain** (`https://goflypost.com/`):
   - Should load the Webflow marketing site
   - URL remains `https://goflypost.com/` in the browser
   - Content is proxied from `https://flypost.webflow.io/`

2. **Share page routes** (`https://goflypost.com/e/test`):
   - Proxies to the public proxy surface (api.goflypost.com)
   - URL remains `https://goflypost.com/e/test` in the browser
   - Returns HTML with OG tags when the shareId exists
   - Unknown shareId returns **404**
   - Content is proxied from `https://api.goflypost.com/e/test`
   - This is a **public, unauthenticated surface** designed for crawler access

### Manual Testing

```bash
# Test root domain (should show Webflow site)
curl -I https://goflypost.com/

# Test share page route (should return HTML with OG tags when shareId exists)
curl -I https://goflypost.com/e/test

# Test share page route for invalid shareId (should return 404)
curl -I https://goflypost.com/e/invalid-share-id

# Test arbitrary path (should show Webflow site)
curl -I https://goflypost.com/about
```

**Note**: Share pages are served via `GET /e/:shareId` from the backend handler. Ensure a valid event ID is used for a 200 response.

## Deployment

This configuration is deployed as a standalone Netlify site configured to serve the `goflypost.com` domain. The site has:

- **Build command**: None (router-only, no build required)
- **Publish directory**: Current directory (contains only config files)
- **Domain**: `goflypost.com`

## Relationship to Other Netlify Sites

- **Root `netlify.toml`**: Reserved for other surfaces (e.g., frontend app deployment)
- **Other frontends**: Each frontend (frontend_ask, frontend_post, etc.) has its own Netlify configuration

This front door routing is **independent** and does not interfere with other deployments.

## Future Enhancements

When share page functionality is implemented:

1. **ShareId minting**: Implement share ID generation for events/posts
2. **Share page UI**: Create templates for richer rendered share pages

## Troubleshooting

### Issue: "Cannot GET /e/*" errors
- **Expected**: This indicates the backend handler is not reachable or shareId is invalid
- **Solution**: Ensure the backend `/e/:shareId` handler is deployed and shareId exists
- **Note**: The routing itself is working correctly; the proxy surface forwards to the backend handler.

### Issue: Webflow content not loading
- **Check**: Verify `https://flypost.webflow.io/` is accessible
- **Check**: Netlify site is properly configured with domain `goflypost.com`

### Issue: Redirect loops
- **Check**: Ensure `force = true` (or `200!`) is set to prevent redirect chains
- **Check**: Verify both destinations (API, Webflow) don't redirect back to `goflypost.com`
