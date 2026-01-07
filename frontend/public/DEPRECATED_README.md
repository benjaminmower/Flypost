# Deprecated Shared Manifests

## ⚠️ DEPRECATION NOTICE

This directory (`frontend/public/`) previously contained shared AI/LLM manifests that were copied to all frontends during build. This approach is **deprecated** as of 2026-01-07.

## Why Deprecated?

The shared manifest approach caused several issues:
1. **Cross-contamination**: Wrong APIs advertised on wrong domains (e.g., write endpoints on read-only Ask surface)
2. **Drift**: Manifests referenced outdated endpoints not aligned with canonical OpenAPI
3. **Security**: Mixing read and write capabilities on single surface
4. **Maintenance**: Single point of failure for all surfaces

## New Approach

Each surface now maintains its own manifests:

- **frontend_ask/public/.well-known/** - Read-only discovery manifests
- **frontend_post/public/.well-known/** - Write/publish manifests
- **frontend_presence** - No manifests (browser-only, no M2M APIs)

## Migration Status

✅ **Completed** (2026-01-07):
- Surface-specific manifests created
- Build scripts updated to use surface-specific locations
- Documentation added (see MANIFEST_MAINTENANCE.md)

## Files in This Directory

These files are **no longer copied** by new frontends:

- `.well-known/ai.json` - Use surface-specific versions instead
- `llm.txt` - Use surface-specific versions instead
- `openapi.json` - Reference canonical at https://api.goflypost.com/openapi.json
- `mcp.flypost.get.v1.json` - Replaced by `mcp.flypost.ask.v1.json`
- `mcp.flypost.parse.v1.json` - Replaced by `mcp.flypost.post.v1.json`

## What to Do

**For new work**: Use surface-specific manifests in `frontend_ask/public/.well-known/` or `frontend_post/public/.well-known/`

**For legacy deployments**: These files may remain for backward compatibility with existing deployments until they are migrated

## Future Cleanup

These files may be removed entirely once:
1. All deployments use surface-specific manifests
2. No build scripts reference this location
3. Sufficient migration period has passed (suggest 3-6 months)

## Questions?

See `MANIFEST_MAINTENANCE.md` in the repository root for complete documentation on the new manifest organization.
