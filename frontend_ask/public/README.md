# Flypost Ask - Public Directory

This directory contains static files for the public read-only API surface.

## File Inventory

### Root
- **openapi.yaml** — OpenAPI 3.0 spec for the Flypost Ask API (source of truth)
- **openapi.json** — Machine-canonical OpenAPI JSON (generated from `openapi.yaml`)

### .well-known/
- **openapi.yaml** — Mirror of root `openapi.yaml` (for AI plugin compatibility)
- **ai-plugin.json** — Legacy ChatGPT/OpenAI plugin manifest (points to `/openapi.yaml`)
- **ai.json** — Modern AI manifest (points to `/openapi.json`)
- **mcp.flypost.ask.v1.json** — MCP tool definitions for the Flypost Ask v1 surface
- **llm.txt** — Human/LLM-readable usage guide (llm.txt v2 format)
- **security.txt** — Security contact per RFC 9116

## Maintenance

### OpenAPI Synchronization

The OpenAPI spec lives in three places that must stay in sync:

1. **Source of truth**: `openapi.yaml` — edit this when updating the API spec
2. **Generated**: `openapi.json` — regenerate after editing YAML (do not edit manually)
3. **Mirror**: `.well-known/openapi.yaml` — must be identical to root `openapi.yaml`

### Regenerating openapi.json

```bash
cd frontend_ask
npm run generate:openapi
```

### Updating the Mirror

When updating `openapi.yaml`:
1. Edit root `openapi.yaml`
2. Copy contents to `.well-known/openapi.yaml` (they must be identical)
3. Run `npm run generate:openapi` to regenerate `openapi.json`
