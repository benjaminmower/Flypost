# Flypost Ask - Public Directory

This directory contains static files for the public read-only API surface.

## Files

- **openapi.yaml**: OpenAPI 3.0 specification for the Flypost Ask API
- **.well-known/openapi.yaml**: Mirror of openapi.yaml (for AI plugin compatibility)
- **.well-known/ai-plugin.json**: AI plugin manifest for ChatGPT and other AI assistants
- **.well-known/security.txt**: Security contact information per RFC 9116

## Maintenance

⚠️ **Important**: `openapi.yaml` and `.well-known/openapi.yaml` are intentionally duplicated.
When updating the API specification, update both files or use a symlink if your deployment supports it.

For production deployments, consider:
1. Using a symlink: `ln -s ../openapi.yaml .well-known/openapi.yaml`
2. Using a build script to copy the file
3. Configuring your web server to serve the same file at both paths
