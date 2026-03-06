# AI/MCP Manifest Refactoring - Implementation Summary

## Overview

This implementation successfully refactors AI/LLM manifest files to properly separate capabilities by surface (ask, post, presence) and align with the canonical OpenAPI specification at `https://api.goflypost.com/openapi.json`.

## Files Created

### Ask Surface (Read-Only Discovery)
- `frontend_ask/public/.well-known/ai.json` - OpenAI plugin manifest for discovery
- `frontend_ask/public/.well-known/llm.txt` - LLM guidance for read-only operations
- `frontend_ask/public/.well-known/mcp.flypost.ask.v1.json` - Model Context Protocol tools

**Advertised Endpoints:**
- `GET /v1/events/near` - Location-based event search
- `GET /v1/events/{event_id}` - Single event retrieval

### Post Surface (Write/Publish)
- `frontend_post/public/.well-known/ai.json` - OpenAI plugin manifest for publishing
- `frontend_post/public/.well-known/llm.txt` - LLM guidance for write operations
- `frontend_post/public/.well-known/mcp.flypost.post.v1.json` - Model Context Protocol tool

**Advertised Endpoints:**
- `POST /api/parse-and-publish` - Parse and publish events (requires x-flypost-write-token)

### Presence Surface (Browser-Only)
- No manifests created ✅
- Build produces no `.well-known/` directory ✅
- Verified to remain browser-only ✅

## Files Modified

### Build Scripts
1. `frontend_ask/scripts/copy-assets.js`
   - Changed to copy from `frontend_ask/public/.well-known/`
   - Added proper error handling (exit on missing manifests)
   - No longer uses shared `frontend/public/` location

2. `frontend_post/scripts/copy-assets.js`
   - Changed to copy from `frontend_post/public/.well-known/`
   - Added proper error handling (exit on missing manifests)
   - No longer uses shared `frontend/public/` location

3. `.gitignore`
   - Added `frontend_presence/node_modules/` and `frontend_presence/dist/`

## Documentation Added

1. **MANIFEST_MAINTENANCE.md** - Comprehensive maintenance guide covering:
   - Surface separation rationale
   - What each surface advertises and why
   - How to update manifests safely
   - Canonical OpenAPI as source of truth
   - Build process explanation
   - Validation checklist
   - Common mistakes to avoid
   - Testing procedures
   - Troubleshooting guide

2. **frontend/public/DEPRECATED_README.md** - Deprecation notice explaining:
   - Why shared manifests are deprecated
   - New surface-specific approach
   - Migration status
   - Future cleanup plans

## Key Design Decisions

### 1. Canonical OpenAPI Reference
All manifests reference `https://api.goflypost.com/openapi.json` as the single source of truth rather than duplicating OpenAPI content.

**Rationale:**
- Prevents drift between surfaces and canonical spec
- Single point of update when APIs change
- Reduces maintenance burden
- Aligns with problem statement requirements

### 2. Surface-Specific Manifests
Each surface maintains its own manifests rather than sharing from a common location.

**Rationale:**
- Prevents cross-contamination (write endpoints on read surfaces)
- Clear separation of concerns
- Independent deployment and versioning
- Easier to maintain and validate

### 3. Fail-Fast Build Scripts
Both Ask and Post build scripts exit with error code 1 if required manifests are missing.

**Rationale:**
- Early detection of deployment issues
- Prevents deploying frontends without required manifests
- Consistent behavior across all surfaces
- Better CI/CD integration

### 4. No Presence Manifests
Presence surface has no manifests and no copy-assets script.

**Rationale:**
- Captures proximity-verified truth (browser-only)
- Must not advertise machine-addressable APIs
- Security and data integrity requirements
- Aligns with problem statement requirements

### 5. MCP Manifest Naming
Used surface-specific names: `mcp.flypost.ask.v1.json` and `mcp.flypost.post.v1.json`

**Rationale:**
- Clear identification of surface
- Prevents confusion between read/write tools
- Supports versioning per surface
- Aligns with problem statement requirements

## Validation Results

### Build Tests
✅ All builds pass successfully:
- `frontend_ask` build completes and copies manifests
- `frontend_post` build completes and copies manifests
- `frontend_presence` build completes with no manifests

### JSON Validation
✅ All JSON manifests are valid:
- `ai.json` files parse correctly
- `mcp.*.json` files parse correctly
- All schemas are well-formed

### Endpoint Alignment
✅ All advertised endpoints exist in documented APIs:
- Ask surface endpoints match PUBLIC_API_IMPLEMENTATION.md
- Post surface endpoint matches frontend/public/openapi.json
- All MCP tools reference real production endpoints

### Canonical Reference
✅ All manifests reference canonical OpenAPI:
- Ask ai.json: `"url": "https://api.goflypost.com/openapi.json"`
- Post ai.json: `"url": "https://api.goflypost.com/openapi.json"`
- Ask llm.txt: `canonical_openapi: https://api.goflypost.com/openapi.json`
- Post llm.txt: `canonical_openapi: https://api.goflypost.com/openapi.json`
- MCP manifests: `"base_url": "https://api.goflypost.com"`

## Requirements Traceability

### Problem Statement Requirements Met

#### Frontend_ask ✅
- ✅ Added `.well-known/ai.json` describing read-only surface
- ✅ Links to canonical OpenAPI
- ✅ Description clearly states discovery-only
- ✅ Added `.well-known/llm.txt` (Ask-scoped)
- ✅ Added MCP manifest exposing only read-only tools
- ✅ No write/publish endpoints advertised

#### Frontend_post ✅
- ✅ Added `.well-known/ai.json` describing write/publish surface
- ✅ Links to canonical OpenAPI
- ✅ Documents authentication expectations
- ✅ Added `.well-known/llm.txt` (Post-scoped)
- ✅ Added MCP manifest referencing write endpoints
- ✅ Updated build script to stop copying from shared location

#### Frontend_presence ✅
- ✅ No `.well-known/ai.json`
- ✅ No `.well-known/llm.txt`
- ✅ No `.well-known/mcp.*.json`
- ✅ No OpenAPI specs
- ✅ Build does not copy manifests

#### Deprecate / Remove ✅
- ✅ Added DEPRECATED_README.md to frontend/public/
- ✅ Build scripts updated to not use shared manifests
- ✅ No frontend implicitly inherits manifests

#### Standardize locations ✅
- ✅ Ask: `/.well-known/ai.json`
- ✅ Ask: `/.well-known/llm.txt`
- ✅ Ask: `/.well-known/mcp.flypost.ask.v1.json`
- ✅ Post: `/.well-known/ai.json`
- ✅ Post: `/.well-known/llm.txt`
- ✅ Post: `/.well-known/mcp.flypost.post.v1.json`

#### Documentation ✅
- ✅ Added MANIFEST_MAINTENANCE.md explaining surface separation

## Acceptance Criteria Status

- [ ] `GET https://api.goflypost.com/openapi.json` returns canonical spec (production deployment, not modified by this PR)
- ✅ `ask.goflypost.com/.well-known/ai.json` advertises only read-only and links to canonical (will deploy with this PR)
- ✅ `post.goflypost.com/.well-known/ai.json` advertises only write/publish with auth notes (will deploy with this PR)
- ✅ `ask.goflypost.com/.well-known/llm.txt` exists and is discovery-scoped (will deploy with this PR)
- ✅ `post.goflypost.com/.well-known/llm.txt` exists and is write-scoped with auth (will deploy with this PR)
- ✅ Presence does not serve AI/LLM manifests (verified in build)
- ✅ MCP manifests split by surface with correct naming
- ✅ MCP manifests reference only real production endpoints
- ✅ Build scripts no longer cross-pollinate
- ✅ Documentation explains surface separation

## Testing Performed

### Unit Testing
- JSON validation for all manifests
- Endpoint existence verification
- Canonical OpenAPI reference validation

### Integration Testing
- Frontend_ask build test (passed)
- Frontend_post build test (passed)
- Frontend_presence build test (passed, no manifests)
- Manifest file presence verification
- Error handling verification

### Code Review
- Two rounds of code review completed
- All actionable feedback addressed
- Error handling consistency improved
- Build integrity ensured

## Migration Notes

### For Existing Deployments

1. **No immediate action required** - existing deployments continue to work
2. **Shared manifests deprecated** - plan to migrate within 3-6 months
3. **New deployments** - must use surface-specific manifests

### Future Cleanup

Once all deployments use surface-specific manifests:
1. Remove or archive `frontend/public/.well-known/`
2. Remove or archive `frontend/public/llm.txt`
3. Remove or archive `frontend/public/mcp.*.json`
4. Remove or archive `frontend/public/openapi.json`

Suggest waiting 3-6 months before cleanup to ensure smooth migration.

## Next Steps

### Immediate (Before Merge)
- ✅ All code changes complete
- ✅ All tests passing
- ✅ Documentation complete
- ✅ Code review feedback addressed

### Post-Merge
1. Deploy to staging environments
2. Verify manifest accessibility at staging URLs
3. Test with AI assistants (ChatGPT, Claude, etc.)
4. Deploy to production
5. Monitor for issues
6. Update any external documentation

### Long-Term
1. Update canonical OpenAPI when APIs change
2. Update surface manifests in same PR as API changes
3. Monitor for drift between manifests and API
4. Complete cleanup of deprecated shared manifests after migration period

## Support

For questions about this implementation:
- Technical: support@goflypost.com
- Security: security@goflypost.com
- Documentation: See MANIFEST_MAINTENANCE.md

## Version

Implementation Version: 1.0
Date: 2026-01-07
Author: GitHub Copilot
