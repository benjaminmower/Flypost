#!/usr/bin/env bash
set -euo pipefail

PROJECT=$(gcloud config get-value project)
REGION="us-west1"
PROXY_SERVICE="proxyv4"
TARGET_SERVICE="flypostv4"
SA="flypost-proxy-service-account@${PROJECT}.iam.gserviceaccount.com"

echo "Using project: ${PROJECT}"
echo "Region: ${REGION}"
echo "Proxy service: ${PROXY_SERVICE}"
echo "Target service: ${TARGET_SERVICE}"
echo "Impersonating service account: ${SA}"
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

echo "=== 0) Getting ID token for backend (TARGET_URL) ==="
TARGET_TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="${SA}" \
  --audiences="${TARGET_URL}") || {
  echo "Failed to obtain identity token for backend" >&2
  exit 1
}
echo "Got backend identity token (length=${#TARGET_TOKEN})"
echo

# --- Direct backend health (authenticated) ---
echo "=== 1) Direct backend /health (authenticated) ==="
if ! curl -fsS \
  -H "Authorization: Bearer ${TARGET_TOKEN}" \
  "${TARGET_URL%/}/health" | sed 's/^/  /'; then
  echo "Backend /health check FAILED" >&2
  exit 1
fi
echo

# --- Proxy health (unauthenticated root) ---
echo "=== 2) Proxy root / (unauthenticated) ==="
if ! curl -fsS "${PROXY_URL%/}/" | sed 's/^/  /'; then
  echo "Proxy root check FAILED" >&2
  exit 1
fi
echo

# --- Proxy → backend /health (unauthenticated to proxy) ---
echo "=== 3) Proxy → backend /health (unauthenticated to proxy) ==="
if ! curl -fsS "${PROXY_URL%/}/health" | sed 's/^/  /'; then
  echo "Proxy /health relay FAILED" >&2
  exit 1
fi
echo

echo "✅ Smoke test passed: backend healthy (auth), proxy healthy, and /health relayed via proxy."
