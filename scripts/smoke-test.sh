#!/usr/bin/env bash
set -euo pipefail

PROJECT=$(gcloud config get-value project)
REGION="us-west1"
PROXY_SERVICE="proxyv4"
TARGET_SERVICE="flypostv4"

echo "Using project: ${PROJECT}"
echo "Region: ${REGION}"
echo "Proxy service: ${PROXY_SERVICE}"
echo "Target service: ${TARGET_SERVICE}"
echo

PROXY_URL=$(gcloud run services describe "${PROXY_SERVICE}" --region="${REGION}" --format='value(status.url)')
TARGET_URL=$(gcloud run services describe "${TARGET_SERVICE}" --region="${REGION}" --format='value(status.url)')

if [[ -z "${PROXY_URL}" || -z "${TARGET_URL}" ]]; then
  echo "Error: failed to resolve one or both service URLs" >&2
  echo "  PROXY_URL='${PROXY_URL}'"
  echo "  TARGET_URL='${TARGET_URL}'"
  exit 1
fi

echo "proxy_url=${PROXY_URL}"
echo "target_url=${TARGET_URL}"
echo

# --- Direct backend health ---
echo "=== 1) Direct backend /health ==="
if ! curl -fsS "${TARGET_URL%/}/health" | sed 's/^/  /'; then
  echo "Backend /health check FAILED" >&2
  exit 1
fi
echo

# --- Proxy health (root) ---
echo "=== 2) Proxy root / ==="
if ! curl -fsS "${PROXY_URL%/}/" | sed 's/^/  /'; then
  echo "Proxy root check FAILED" >&2
  exit 1
fi
echo

# --- Proxy → backend /health ---
echo "=== 3) Proxy → backend /health ==="
if ! curl -fsS "${PROXY_URL%/}/health" | sed 's/^/  /'; then
  echo "Proxy /health relay FAILED" >&2
  exit 1
fi
echo

echo "✅ Smoke test passed: backend healthy, proxy healthy, and /health relayed via proxy."
