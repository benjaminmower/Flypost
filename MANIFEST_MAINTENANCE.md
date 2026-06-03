# AI/LLM Manifest Maintenance Guide

## Overview

This document explains how AI/LLM manifests (ai.json, llm.txt, MCP manifests,
OpenAPI specs) are organized and how to maintain them safely.

Flypost's canonical agent-facing API surface is `https://api.goflypost.com`.
The API domain serves its current OpenAPI, MCP, and LLM guidance from
`backend/src/wellKnownRoutes.js`. Frontend manifest files are deployment
artifacts for specific web surfaces and must not be treated as the source of
truth for the API domain.

For the protocol narrative and core contract, start with
`docs/flypost-discovery-protocol.md`.

## Surface Separation

Flypost has three frontend surfaces, each with different capabilities:

### 1. **API / Ask** (api.goflypost.com, ask.goflypost.com) - Read-Only Discovery
- **Purpose**: Anonymous event discovery via geographic search using Discovery Protocol V1
- **Capabilities**: Read-only access to events with tiered access (public vs brokerage-scoped)
- **Canonical Manifests Location**: `backend/src/wellKnownRoutes.js` for `api.goflypost.com`
- **Legacy/Surface Manifests Location**: `frontend_ask/public/.well-known/` for ask-specific deployments
- **Schema**: `backend/schemas/flypost-discovery-v1.schema.json`
- **Advertised APIs**: 
  - `GET /v1/events/near` - Location-based search (lat/lng optional, defaults to Santa Monica; radius_mi preferred; returns nearest-first results with `distance_mi` when applicable)
  - `GET /v1/events/{event_id}` - Retrieve single event
- **Protocol**: Flypost Discovery Protocol V1 (protocol/version/success/events/meta structure)
- **Access Tiers**:
  - Public anonymous: Registry-safe allowlist fields, reduced geo precision (2 decimals)
  - Brokerage-scoped: Full event details with brokerageId or api_key
- **Rate Limits**: 100 req/15min (public), 500 req/15min (brokerage)

### 2. **Post** (post.goflypost.com) - Write/Publish
- **Purpose**: Authenticated event publishing from natural language
- **Capabilities**: Write access to create events (NOT truth-writing)
- **Manifests Location**: `frontend_post/public/.well-known/`
- **Advertised APIs**:
  - `POST /api/parse-and-publish` - Parse natural language and store events
  - `POST /v1/events/upsert` - Structured event ingestion (MLS, scrapers)
- **Authentication**: Required (origin-gated by proxy)
  - Browser origins (post.goflypost.com, app.goflypost.com): Firebase Bearer token REQUIRED
  - Machine/server: Static write token (x-flypost-write-token header OR Bearer)
- **NOT Accessible Here**: Truth-writing endpoints (/v1/presence/*, /v1/feedback/*) - origin-restricted to presence.goflypost.com

### 3. **Presence** (presence.goflypost.com) - Truth-Writing (Origin-Restricted)
- **Purpose**: Check-in and feedback for open house visitors (truth-minting)
- **Capabilities**: 
  - `POST /v1/presence/check-in` - Record attendance at events
  - `POST /v1/feedback/submit` - Submit feedback for attended events
- **Authentication**: Firebase Bearer token from presence.goflypost.com origin ONLY
- **Origin Restriction**: ALL truth-writing endpoints require Origin: https://presence.goflypost.com
  - Requests from other origins receive 403 Forbidden regardless of authentication
  - This prevents machines/GPTs/browsers from other origins from minting truth
- **Manifests**: **NONE** - Presence should not serve machine-addressable AI/LLM manifests
- **Rationale**: Captures proximity-verified truth; must remain browser-only via origin restriction

## Canonical Source of Truth

### OpenAPI Specifications

**API Domain (Discovery Protocol V1)**:
- **Source of Truth**: `backend/src/wellKnownRoutes.js` for served OpenAPI/LLM/MCP docs
- **Schema**: `backend/schemas/flypost-discovery-v1.schema.json`
- **Protocol Doc**: `docs/flypost-discovery-protocol.md`
- **Deployed URLs**:
  - https://api.goflypost.com/.well-known/openapi.yaml
  - https://api.goflypost.com/.well-known/openapi.json
  - https://api.goflypost.com/.well-known/llm.txt
  - https://api.goflypost.com/.well-known/mcp.flypost.ask.v1.json

**Ask Surface Files (if ask.goflypost.com is deployed separately)**:
- **Location**: `frontend_ask/public/.well-known/`
- **Rule**: keep aligned with the API-domain contract, but do not treat these files as canonical for `api.goflypost.com`.
- **Regeneration**: `cd frontend_ask && npm run generate:openapi` if editing ask-specific YAML/JSON.

**Backend API Contract**:
- **Implementation**: `backend/src/server.js` (actual endpoint behavior)
- **Discovery Mapper**: `backend/src/utils/discoveryMapper.js` (response format)
- **Schema**: `backend/schemas/flypost-discovery-v1.schema.json`

**Proxy Auth Contract**:
- **Implementation**: `proxy/src/forward.js` (origin-gated authentication)
- **Documentation**: `proxy/README.md`

### Important Rules:

1. **Backend implementation is ground truth** - OpenAPI specs must match actual backend behavior.
2. **API well-known routes are canonical for agents** - update `backend/src/wellKnownRoutes.js` when API behavior changes.
3. **JSON schema must match emitted responses** - update `backend/schemas/flypost-discovery-v1.schema.json` for response-shape changes.
4. **Surface manifests must align** - ai.json, llm.txt, MCP manifests reference the API-domain OpenAPI and match backend.
5. **Generated frontend OpenAPI JSON stays generated** - if editing `frontend_ask/public/openapi.yaml`, regenerate `frontend_ask/public/openapi.json`.
6. **Validate alignment** - When backend changes affect the protocol, update backend well-known docs, schema, MCP docs, and any active surface manifests in the same PR.

### Regenerating OpenAPI JSON from YAML

When you update `frontend_ask/public/openapi.yaml`:

```bash
cd frontend_ask
npm install  # If dependencies missing
npm run generate:openapi
```

This script (`scripts/generate-openapi-json.js`):
1. Reads `public/openapi.yaml`
2. Parses YAML using js-yaml
3. Writes `public/openapi.json`

**Always commit both files together** when making OpenAPI changes.

## Manifest Files by Surface

### Ask Surface (`frontend_ask/public/.well-known/`)

| File | Purpose |
|------|---------|
| `openapi.yaml` | **SOURCE OF TRUTH** - Human-editable OpenAPI spec for Discovery Protocol V1 |
| `openapi.json` | **GENERATED** - Machine-canonical JSON (regenerate from YAML via npm script) |
| `ai.json` | OpenAI-compatible plugin manifest for discovery |
| `ai-plugin.json` | Legacy OpenAI plugin manifest |
| `llm.txt` | Human-readable guidance for LLMs (read-only scope, Discovery Protocol V1) |
| `mcp.flypost.ask.v1.json` | Model Context Protocol tools (discovery only) |

**What to advertise:**
- ✅ GET /v1/events/near (lat/lng optional, defaults to Santa Monica)
- ✅ GET /v1/events/{event_id} (returns events array with 1 item)
- ✅ Discovery Protocol V1 response format (protocol/version/success/events/meta)
- ✅ radius_mi parameter (preferred, miles) and radius fallback (km)
- ✅ Tiered access (public vs brokerage-scoped)
- ✅ Optional timezone field in when object
- ✅ Read-only operations

**What NOT to advertise:**
- ❌ POST endpoints
- ❌ Write operations
- ❌ Claims of "full-fidelity public" access (access is tiered)
- ❌ Truth-writing endpoints (/v1/presence/*, /v1/feedback/*)

### Post Surface (`frontend_post/public/.well-known/`)

| File | Purpose |
|------|---------|
| `ai.json` | OpenAI-compatible plugin manifest for publishing |
| `llm.txt` | Human-readable guidance for LLMs (write/publish scope) |
| `mcp.flypost.post.v1.json` | Model Context Protocol tools (publishing only) |

**What to advertise:**
- ✅ POST /api/parse-and-publish endpoint
- ✅ POST /v1/events/upsert endpoint
- ✅ Authentication requirements (origin-gated: Firebase for browsers, static token for machines)
- ✅ List price is OPTIONAL (not required, but if present must be valid)
- ✅ Write operations and validation rules
- ✅ Geo coordinates required (will attempt geocoding from address)

**What NOT to advertise:**
- ❌ Read-only discovery endpoints (those belong on Ask)
- ❌ Public/unauthenticated access
- ❌ Truth-writing endpoints (/v1/presence/*, /v1/feedback/*) - origin-restricted to presence.goflypost.com

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
# Also runs: npm run generate:openapi (if openapi.yaml changed)
# Copies from: frontend_ask/public/ (includes openapi.yaml and openapi.json)
# Copies to: frontend_ask/dist/
```

**Regenerating OpenAPI JSON**:
```bash
cd frontend_ask
npm run generate:openapi
# Reads: public/openapi.yaml
# Writes: public/openapi.json
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

## Legacy Shared Manifests & Root Canonical Manifest

### Root Canonical Manifest (NEW)

**Location**: `frontend/public/.well-known/`

**Purpose**: Root-level manifest for goflypost.com that references all three surfaces

**Files**:
- `llm.txt` - Overview of all three surfaces (ASK, POST, PRESENCE) with references
- `ai.json` - Root AI manifest pointing to surface-specific manifests

**Status**: ACTIVE - Use for goflypost.com domain

### Legacy Shared Manifests (Deprecated for Surface-Specific)

**Location**: `frontend/public/` (non-.well-known files)

**Status**: DEPRECATED for surface-specific deployments

The shared manifests were used historically when all frontends copied from a single location. Now:
- Each surface maintains its own manifests
- Root manifest in `frontend/public/.well-known/` serves as canonical overview
- Surface-specific manifests are deployed to their respective domains

## How to Update Manifests Safely

### When Backend Behavior Changes

1. **Identify the change**:
   - Endpoint added/removed/modified in `backend/src/server.js`?
   - Response format changed in `backend/src/utils/discoveryMapper.js`?
   - Auth policy changed in `proxy/src/forward.js`?

2. **Update OpenAPI YAML** (for Ask surface):
   ```bash
   # Edit the source of truth
   vim frontend_ask/public/openapi.yaml
   
   # Regenerate JSON
   cd frontend_ask
   npm run generate:openapi
   ```

3. **Update surface manifests**:
   - Update `llm.txt` with new behavior/guidance
   - Update MCP manifests if tools change
   - Update `ai.json` if significant structural changes

4. **Identify affected surfaces**:
   - Discovery changes? → Update Ask manifests
   - Publishing changes? → Update Post manifests
   - Truth-writing changes? → Update Presence (no manifests, but document in root llm.txt)

5. **Test builds**:
   ```bash
   cd frontend_ask && npm run build
   cd ../frontend_post && npm run build
   ```

6. **Commit all changes together**: OpenAPI YAML + JSON + all aligned manifests in one PR

### Adding a New Endpoint

1. **Implement in backend** first (`backend/src/server.js`)
2. **Determine surface**:
   - Read-only discovery? → Ask (update openapi.yaml)
   - Write/auth required? → Post (update llm.txt)
   - Truth-writing? → Presence (origin-restricted, don't advertise)
3. **Update appropriate surface manifests**:
   - Ask: Edit `openapi.yaml`, regenerate `openapi.json`, update llm.txt/MCP
   - Post: Update llm.txt and MCP manifest
4. **Update root manifest** if it affects surface overview
5. **Test and commit all changes together**

### Changing Authentication

1. **Update proxy auth logic** in `proxy/src/forward.js`
2. **Update proxy documentation** in `proxy/README.md`
3. **Update Post manifests** (auth requirements live on Post):
   - Update `llm.txt` with new auth policy
   - Update MCP manifest configuration
   - Update `ai.json` auth description
4. **Update root manifest** to reflect new auth policy
5. **Test with both browser and machine clients**

## Validation Checklist

Before deploying manifest changes:

- [ ] Backend implementation matches documented behavior
- [ ] OpenAPI YAML edited (if Ask surface changed)
- [ ] OpenAPI JSON regenerated from YAML (if YAML changed)
- [ ] Surface manifests reference correct OpenAPI URLs
- [ ] Ask manifests advertise only Discovery Protocol V1 read-only endpoints
- [ ] Ask manifests document tiered access (not "full-fidelity public")
- [ ] Post manifests advertise only write endpoints with origin-gated auth
- [ ] Post manifests clarify list price is optional (not required)
- [ ] Truth-writing endpoints documented as origin-restricted (presence.goflypost.com only)
- [ ] Presence has no AI/LLM manifests
- [ ] Root manifest references all three surfaces accurately
- [ ] llm.txt guidance is accurate and scoped to surface
- [ ] MCP tools reference real endpoints from backend
- [ ] No cross-surface contamination (Ask doesn't advertise write, Post doesn't advertise truth-writing)
- [ ] Build scripts work correctly
- [ ] Test builds complete successfully

## Common Mistakes to Avoid

1. **❌ Manually editing openapi.json** - Always edit YAML and regenerate JSON
2. **❌ Forgetting to regenerate openapi.json** - Run `npm run generate:openapi` after YAML changes
3. **❌ Copying manifests between surfaces** - Each surface has its own
4. **❌ Advertising write endpoints on Ask** - Ask is read-only discovery
5. **❌ Advertising truth-writing endpoints on Post** - Origin-restricted to presence.goflypost.com
6. **❌ Claiming "full-fidelity public"** - Access is tiered (public vs brokerage-scoped)
7. **❌ Claiming "list price required"** - List price is optional
8. **❌ Adding manifests to Presence** - Presence must remain browser-only
9. **❌ Documenting endpoints not in backend** - Backend is ground truth
10. **❌ Forgetting to update llm.txt** - It's the human-readable contract
11. **❌ Inconsistent MCP/ai.json/llm.txt** - Keep all three aligned
12. **❌ Missing Discovery Protocol V1 response format** - Must include protocol/version/success/events/meta

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
# Root manifest
curl https://goflypost.com/.well-known/llm.txt
curl https://goflypost.com/.well-known/ai.json

# Ask surface
curl https://ask.goflypost.com/.well-known/openapi.yaml
curl https://ask.goflypost.com/.well-known/openapi.json
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
- Check backend behavior in `backend/src/server.js` and `backend/src/utils/discoveryMapper.js`
- Edit `frontend_ask/public/openapi.yaml` to match backend
- Regenerate JSON: `cd frontend_ask && npm run generate:openapi`
- Update llm.txt and MCP manifests to match
- Commit YAML + JSON + manifests together

### "Build fails with missing files"
- Ensure surface has its own manifests in `public/.well-known/`
- Don't rely on shared `frontend/public/` location

## Support

For questions about manifest maintenance:
- Technical: support@goflypost.com
- Security: security@goflypost.com
- Documentation: https://goflypost.com/docs

## Version History

- **v2.0** (2026-01-19): Discovery Protocol V1 alignment
  - Updated Ask manifests to match Discovery Protocol V1 (protocol/version/success/events/meta)
  - Made lat/lng optional (defaults to Santa Monica)
  - Added radius_mi parameter (preferred, miles)
  - Documented tiered access (public vs brokerage-scoped)
  - Added timezone field to when object
  - Clarified list price is optional (not required)
  - Added root canonical manifest for goflypost.com
  - Documented truth-writing origin restrictions (presence.goflypost.com only)
  - Established openapi.yaml as source of truth with generated openapi.json
  - Added regeneration workflow (npm run generate:openapi)

- **v1.0** (2026-01-07): Initial manifest separation by surface
  - Split ai.json, llm.txt, MCP manifests per surface
  - Deprecated shared `frontend/public/` manifests
  - Aligned with canonical OpenAPI at https://api.goflypost.com/openapi.json
