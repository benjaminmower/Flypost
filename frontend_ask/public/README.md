# Flypost Ask - Public Directory

This directory contains static files for the public read-only API surface.

## Files

- **openapi.yaml**: OpenAPI 3.0 specification for the Flypost Ask API (source of truth)
- **openapi.json**: Machine-canonical OpenAPI JSON (generated from YAML)
- **.well-known/openapi.yaml**: Mirror of openapi.yaml (for AI plugin compatibility)
- **.well-known/ai-plugin.json**: AI plugin manifest for ChatGPT and other AI assistants (points to YAML for legacy compatibility)
- **.well-known/ai.json**: Modern AI manifest (points to JSON for machine-canonical contract)
- **.well-known/security.txt**: Security contact information per RFC 9116

## Maintenance

### OpenAPI Specification Synchronization

⚠️ **Important**: The OpenAPI spec exists in multiple locations and formats:

1. **Source of truth**: `openapi.yaml` - Edit this file when updating the API specification
2. **Generated file**: `openapi.json` - Automatically generated from YAML (do not edit manually)
3. **Mirror**: `.well-known/openapi.yaml` - Must be kept in sync with `openapi.yaml`

### Regenerating openapi.json

After updating `openapi.yaml`, regenerate the JSON file:

```bash
cd frontend_ask
npm run generate:openapi
```

This uses `js-yaml` to convert the YAML to JSON, ensuring they stay in sync.

### Updating the Mirror

When updating the API specification:
1. Edit `openapi.yaml`
2. Copy changes to `.well-known/openapi.yaml` (or use a symlink if your deployment supports it)
3. Run `npm run generate:openapi` to regenerate `openapi.json`

For production deployments, consider:
1. Using a symlink: `ln -s ../openapi.yaml .well-known/openapi.yaml`
2. Using a build script to copy the file and regenerate JSON
3. Configuring your web server to serve the same file at both paths
