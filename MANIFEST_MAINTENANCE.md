# AI/LLM Manifest Maintenance Guide

## Overview

This document explains how AI/LLM manifests (ai.json, llm.txt, MCP manifests, OpenAPI specs) are organized by surface and how to maintain them safely.

## Surface Separation

Flypost has three frontend surfaces, each with different capabilities:

### 1. **Ask** (ask.goflypost.com) - Read-Only Discovery
- **Purpose**: Anonymous event discovery via geographic search
- **Capabilities**: Read-only access to events
- **Manifests Location**: `frontend_ask/public/.well-known/`
- **Advertised APIs**: 
  - `GET /v1/events/near` - Location-based search
  - `GET /v1/events/{event_id}` - Retrieve single event

### 2. **Post** (post.goflypost.com) - Write/Publish
- **Purpose**: Authenticated event publishing from natural language
- **Capabilities**: Write access to create events
- **Manifests Location**: `frontend_post/public/.well-known/`
- **Advertised APIs**:
  - `POST /api/parse-and-publish` - Parse and store events
- **Authentication**: Required (x-flypost-write-token header)

### 3. **Presence** (presence.goflypost.com) - Buyer UX Only
- **Purpose**: Check-in and feedback for open house visitors
- **Capabilities**: Browser-only UI (no machine-addressable APIs)
- **Manifests**: **NONE** - Presence must not serve any AI/LLM manifests
- **Rationale**: Captures proximity-verified truth; must remain browser-only

## Canonical Source of Truth

**Canonical OpenAPI**: https://api.goflypost.com/openapi.json

This is the **single source of truth** for all API endpoints, schemas, and authentication requirements. All surface manifests must reference and align with this canonical spec.

### Important Rules:

1. **Never diverge from canonical OpenAPI** - If an endpoint doesn't exist in the canonical spec, don't advertise it
2. **Surface manifests are projections** - Each surface (ask, post) advertises only the subset of APIs relevant to its purpose
3. **Link, don't duplicate** - Reference the canonical OpenAPI URL rather than copying the full spec
4. **Validate alignment** - When canonical OpenAPI changes, update surface manifests in the same PR

## Manifest Files by Surface

### Ask Surface (`frontend_ask/public/.well-known/`)

| File | Purpose |
|------|---------|
| `ai.json` | OpenAI-compatible plugin manifest for discovery |
| `llm.txt` | Human-readable guidance for LLMs (read-only scope) |
| `mcp.flypost.ask.v1.json` | Model Context Protocol tools (discovery only) |

**What to advertise:**
- ✅ GET endpoints for event discovery
- ✅ Read-only operations
- ✅ Public tier access (no auth required)
- ✅ Brokerage tier access (optional brokerage_id parameter)

**What NOT to advertise:**
- ❌ POST endpoints
- ❌ Write operations
- ❌ Authentication-required endpoints

### Post Surface (`frontend_post/public/.well-known/`)

| File | Purpose |
|------|---------|
| `ai.json` | OpenAI-compatible plugin manifest for publishing |
| `llm.txt` | Human-readable guidance for LLMs (write/publish scope) |
| `mcp.flypost.post.v1.json` | Model Context Protocol tools (publishing only) |

**What to advertise:**
- ✅ POST /api/parse-and-publish endpoint
- ✅ Authentication requirements (x-flypost-write-token)
- ✅ Price requirement for all events
- ✅ Write operations and validation rules

**What NOT to advertise:**
- ❌ Read-only discovery endpoints (those belong on Ask)
- ❌ Public/unauthenticated access

### Presence Surface

**NO MANIFESTS** - This surface must not serve any machine-addressable contracts.

Files that must NOT exist:
- ❌ `/.well-known/ai.json`
- ❌ `/.well-known/llm.txt`
- ❌ Any `/.well-known/mcp.*.json`
- ❌ `/openapi.json` or `/openapi.yaml`

## Build Process

Each frontend has its own build script that copies only its own manifests:

### Ask Build
```bash
cd frontend_ask
npm run build
# Runs: vite build && node scripts/copy-assets.js
# Copies from: frontend_ask/public/.well-known/
# Copies to: frontend_ask/dist/.well-known/
```

### Post Build
```bash
cd frontend_post
npm run build
# Runs: vite build && node scripts/copy-assets.js
# Copies from: frontend_post/public/.well-known/
# Copies to: frontend_post/dist/.well-known/
```

### Presence Build
```bash
cd frontend_presence
npm run build
# Runs: vite build (NO copy-assets.js)
# No manifests are copied
```

## Legacy Shared Manifests (Deprecated)

**Location**: `frontend/public/`

**Status**: DEPRECATED - Do not use for new deployments

The shared manifests in `frontend/public/` were used historically when all frontends copied from a single location. This caused:
- Wrong APIs advertised on wrong domains
- Drift from canonical OpenAPI
- Security concerns (write endpoints on read-only surfaces)

**Migration**: Each surface now maintains its own manifests. The shared location may be removed in a future cleanup.

## How to Update Manifests Safely

### When Canonical OpenAPI Changes

1. **Update the canonical spec first**: https://api.goflypost.com/openapi.json
2. **Identify affected surfaces**:
   - Does the change affect discovery? → Update Ask manifests
   - Does the change affect publishing? → Update Post manifests
   - Is it a new endpoint? → Decide which surface should advertise it
3. **Update surface manifests in the same PR**:
   - Update `ai.json` if API structure changes
   - Update `llm.txt` with new guidance
   - Update MCP manifests if tools change
4. **Test builds**:
   ```bash
   cd frontend_ask && npm run build
   cd ../frontend_post && npm run build
   ```
5. **Verify no drift**: Ensure advertised endpoints exist in canonical OpenAPI

### Adding a New Endpoint

1. **Add to canonical OpenAPI** first
2. **Determine surface**:
   - Read-only? → Ask
   - Write/auth required? → Post
   - Neither? → Don't advertise (presence or internal only)
3. **Update appropriate surface manifest(s)**
4. **Add to llm.txt** with clear usage guidance
5. **Add to MCP manifest** if it should be a tool

### Changing Authentication

1. **Update canonical OpenAPI** security schemes
2. **Update Post manifests** (auth requirements live on Post)
3. **Update llm.txt** with new auth expectations
4. **Update MCP manifest** configuration section

## Validation Checklist

Before deploying manifest changes:

- [ ] Canonical OpenAPI is up to date
- [ ] Surface manifests reference canonical OpenAPI URL
- [ ] Ask manifests advertise only read-only endpoints
- [ ] Post manifests advertise only write endpoints with auth
- [ ] Presence has no manifests
- [ ] llm.txt guidance is accurate and scoped to surface
- [ ] MCP tools reference real endpoints from canonical OpenAPI
- [ ] No cross-surface contamination (Ask doesn't advertise write, Post doesn't advertise read)
- [ ] Build scripts copy from correct locations
- [ ] Test builds complete successfully

## Common Mistakes to Avoid

1. **❌ Copying manifests between surfaces** - Each surface has its own
2. **❌ Advertising write endpoints on Ask** - Ask is read-only
3. **❌ Advertising read endpoints on Post** - Post is write-only (for API purposes)
4. **❌ Adding manifests to Presence** - Presence must remain browser-only
5. **❌ Creating endpoints not in canonical OpenAPI** - Canonical is source of truth
6. **❌ Duplicating OpenAPI content** - Link to canonical, don't copy
7. **❌ Forgetting to update llm.txt** - It's the human-readable contract
8. **❌ Inconsistent MCP/ai.json/llm.txt** - Keep all three aligned

## Testing Manifest Deployments

### Local Testing
```bash
# Build each frontend
cd frontend_ask && npm run build && npm run preview
cd ../frontend_post && npm run build && npm run preview

# Verify manifest accessibility
curl http://localhost:5174/.well-known/ai.json
curl http://localhost:5174/.well-known/llm.txt
curl http://localhost:5174/.well-known/mcp.flypost.ask.v1.json
```

### Production Testing
```bash
# Ask surface
curl https://ask.goflypost.com/.well-known/ai.json
curl https://ask.goflypost.com/.well-known/llm.txt
curl https://ask.goflypost.com/.well-known/mcp.flypost.ask.v1.json

# Post surface
curl https://post.goflypost.com/.well-known/ai.json
curl https://post.goflypost.com/.well-known/llm.txt
curl https://post.goflypost.com/.well-known/mcp.flypost.post.v1.json

# Presence surface (should 404)
curl https://presence.goflypost.com/.well-known/ai.json  # Should fail
curl https://presence.goflypost.com/.well-known/llm.txt  # Should fail
```

## Troubleshooting

### "Wrong manifests appearing on a surface"
- Check build script `scripts/copy-assets.js` - ensure it copies from `public/.well-known/` not `../frontend/public/`
- Clear build cache: `rm -rf dist/ && npm run build`

### "Manifests showing up on Presence"
- Ensure `frontend_presence/package.json` build script does NOT include `copy-assets.js`
- Check for accidental copies in build directory

### "Canonical OpenAPI and surface manifests are out of sync"
- Compare advertised endpoints with https://api.goflypost.com/openapi.json
- Update surface manifests to match canonical spec
- Remove any endpoints not present in canonical

### "Build fails with missing files"
- Ensure surface has its own manifests in `public/.well-known/`
- Don't rely on shared `frontend/public/` location

## Support

For questions about manifest maintenance:
- Technical: support@goflypost.com
- Security: security@goflypost.com
- Documentation: https://goflypost.com/docs

## Version History

- **v1.0** (2026-01-07): Initial manifest separation by surface
  - Split ai.json, llm.txt, MCP manifests per surface
  - Deprecated shared `frontend/public/` manifests
  - Aligned with canonical OpenAPI at https://api.goflypost.com/openapi.json
