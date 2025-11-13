#!/usr/bin/env bash
set -euo pipefail

PROJECT=$(gcloud config get-value project)
PROXY_SERVICE="proxyv4"
TARGET_SERVICE="flypostv4"

PROXY_URL=$(gcloud run services describe "${PROXY_SERVICE}" --region=us-west1 --format='value(status.url)')
TARGET_URL=$(gcloud run services describe "${TARGET_SERVICE}" --region=us-west1 --format='value(status.url)')

# --- Added safety check here ---
if [[ -z "${PROXY_URL}" || -z "${TARGET_URL}" ]]; then
  echo "Error: failed to resolve one or both service URLs" >&2
  exit 1
fi
# -------------------------------

echo "proxy_url=${PROXY_URL}"
echo "target_url=${TARGET_URL}"

# Try to get an identity token impersonating the proxy service account (works for private or public target)
SA="flypost-proxy-service-account@${PROJECT}.iam.gserviceaccount.com"
TOKEN=$(gcloud auth print-identity-token --impersonate-service-account="${SA}" --audiences="${TARGET_URL%/}" 2>/dev/null || true)

if [[ -n "${TOKEN}" ]]; then
  echo "calling target directly with impersonated identity token"
  DIRECT=$(curl -sS -H "Authorization: Bearer ${TOKEN}" "${TARGET_URL%/}/health")
else
  echo "no impersonation token, trying public call"
  DIRECT=$(curl -sS "${TARGET_URL%/}/health")
fi

echo "calling proxy /api/health"
PROXY=$(curl -sS "${PROXY_URL%/}/api/health")

# If jq is available, compare structured fields; otherwise print raw JSONs
if command -v jq >/dev/null 2>&1; then
  echo "comparing fields"
  DIRECT_STATUS=$(jq -r '.status // empty' <<<"$DIRECT")
  PROXY_STATUS=$(jq -r '.status // empty' <<<"$PROXY")
  DIRECT_VER=$(jq -r '.version // empty' <<<"$DIRECT")
  PROXY_VER=$(jq -r '.version // empty' <<<"$PROXY")

  echo "target status=${DIRECT_STATUS} version=${DIRECT_VER}"
  echo "proxy  status=${PROXY_STATUS} version=${PROXY_VER}"

  if [[ "$DIRECT_STATUS" != "$PROXY_STATUS" ]] || [[ "$DIRECT_VER" != "$PROXY_VER" ]]; then
    echo "mismatch between target and proxy responses" >&2
    echo "DIRECT: $DIRECT" >&2
    echo "PROXY:  $PROXY" >&2
    exit 2
  fi
else
  echo "jq not installed; printing raw JSONs for manual inspection"
  echo "DIRECT: $DIRECT"
  echo "PROXY:  $PROXY"
fi

echo "smoke test passed"
