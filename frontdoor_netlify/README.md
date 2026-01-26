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

## Current Scope: Routing Substrate Only

⚠️ **Important**: This setup establishes the **routing infrastructure only**. The following features are **not yet implemented**:

- ❌ Backend handler for `/e/*` endpoints
- ❌ ShareId generation and minting
- ❌ Open Graph (OG) tag rendering for share pages
- ❌ Share page UI/templates
- ❌ Proxy allow-list for GET /e/* only (planned follow-up)

## Testing

### Expected Behavior

1. **Root domain** (`https://goflypost.com/`):
   - Should load the Webflow marketing site
   - URL remains `https://goflypost.com/` in the browser
   - Content is proxied from `https://flypost.webflow.io/`

2. **Share page routes** (`https://goflypost.com/e/test`):
   - Should proxy to the public proxy surface (api.goflypost.com)
   - URL remains `https://goflypost.com/e/test` in the browser
   - Currently returns **Cannot GET /e/test** until handler exists (expected behavior)
   - Content is proxied from `https://api.goflypost.com/e/test`
   - This is a **public, unauthenticated surface** designed for crawler access

### Manual Testing

```bash
# Test root domain (should show Webflow site)
curl -I https://goflypost.com/

# Test share page route (should return Cannot GET /e/test until handler exists.)
curl -I https://goflypost.com/e/test

# Test arbitrary path (should show Webflow site)
curl -I https://goflypost.com/about
```

**Note**: `/e/test` currently returns "Cannot GET /e/test" because the backend handler does not yet exist. This is expected behavior until the share page handler is implemented.

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

1. **Backend handler**: Add `/e/:shareId` endpoint to the API
2. **ShareId minting**: Implement share ID generation for events/posts
3. **OG tag rendering**: Add server-side Open Graph meta tags for social sharing
4. **Share page UI**: Create templates for rendered share pages
5. **Proxy allow-list**: Implement explicit allow-list for GET /e/* only on the proxy surface

## Troubleshooting

### Issue: "Cannot GET /e/*" errors
- **Expected**: This is normal behavior - the backend handler is not yet implemented
- **Solution**: Implement the `/e/:shareId` endpoint in the API backend
- **Note**: The routing itself is working correctly; the proxy surface just doesn't have a handler to respond.

### Issue: Webflow content not loading
- **Check**: Verify `https://flypost.webflow.io/` is accessible
- **Check**: Netlify site is properly configured with domain `goflypost.com`

### Issue: Redirect loops
- **Check**: Ensure `force = true` (or `200!`) is set to prevent redirect chains
- **Check**: Verify both destinations (API, Webflow) don't redirect back to `goflypost.com`
