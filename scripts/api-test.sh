#!/usr/bin/env bash
# Live Flypost API smoke test
# Verifies: Cloud Run proxy -> backend -> storage -> events/near loop

set -euo pipefail

# --- Config -------------------------------------------------------------

# You can either export FLYPOST_API_BASE before running,
# or pass it as the first argument to this script.
FLYPOST_API_BASE="${FLYPOST_API_BASE:-${1:-}}"

if [[ -z "${FLYPOST_API_BASE}" ]]; then
  echo "❌ FLYPOST_API_BASE is not set."
  echo "   Export it or pass it as an argument, e.g.:"
  echo "     export FLYPOST_API_BASE=\"https://proxyv4-...run.app\""
  echo "     ./test-flypost-live.sh"
  echo "   or:"
  echo "     ./test-flypost-live.sh https://proxyv4-...run.app"
  exit 1
fi

# Default test coordinates (Santa Monica)
TEST_LAT="34.0195"
TEST_LNG="-118.4912"
TEST_RADIUS="10"

# Check if jq is available (nice-to-have for parsing)
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
else
  HAS_JQ=0
fi

# --- Helpers ------------------------------------------------------------

log() {
  echo
  echo "▶ $*"
}

ok() {
  echo "✅ $*"
}

fail() {
  echo "❌ $*" >&2
  exit 1
}

curl_json() {
  local method="$1"
  local url="$2"
  local data="${3:-}"

  if [[ -n "$data" ]]; then
    curl -sS -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -sS -X "$method" "$url"
  fi
}

# --- Start --------------------------------------------------------------

echo "🌐 Using FLYPOST_API_BASE=${FLYPOST_API_BASE}"

# 1) Health check
log "Health check: GET /health"

HEALTH_RESP="$(curl_json GET "${FLYPOST_API_BASE}/health" || true)"

if [[ -z "${HEALTH_RESP}" ]]; then
  fail "No response from /health"
fi

if [[ "${HAS_JQ}" -eq 1 ]]; then
  STATUS="$(echo "${HEALTH_RESP}" | jq -r '.status // empty')"
else
  STATUS="$(echo "${HEALTH_RESP}" | grep -o '"status"\s*:\s*"[^"]*"' || true)"
fi

echo "Response:"
echo "${HEALTH_RESP}"

if [[ "${HAS_JQ}" -eq 1 ]]; then
  if [[ "${STATUS}" != "healthy" ]]; then
    fail "/health status is not 'healthy' (got: ${STATUS:-<missing>})"
  fi
fi

ok "Health endpoint responds and service appears up."

# 2) Parse and publish test event
log "Parse & publish: POST /api/parse-and-publish"

TEST_BODY=$(cat <<EOF
{
  "naturalLanguageInput": "Open house this Sunday from 1–4pm at 2212 Ocean Park Blvd, Santa Monica. 3 bed, 2 bath, listed at \$1.5M.",
  "userContext": {
    "channel": "live-smoke-test",
    "source": "test-flypost-live.sh"
  }
}
EOF
)

PARSE_RESP="$(curl_json POST "${FLYPOST_API_BASE}/api/parse-and-publish" "${TEST_BODY}" || true)"

if [[ -z "${PARSE_RESP}" ]]; then
  fail "No response from /api/parse-and-publish"
fi

echo "Response:"
echo "${PARSE_RESP}"

if [[ "${HAS_JQ}" -eq 1 ]]; then
  PARSE_SUCCESS="$(echo "${PARSE_RESP}" | jq -r '.success // false')"
  EVENT_ID="$(echo "${PARSE_RESP}" | jq -r '.data.eventId // empty')"
else
  PARSE_SUCCESS="$(echo "${PARSE_RESP}" | grep -q '"success"\s*:\s*true' && echo true || echo false)"
  EVENT_ID=""  # Harder to parse without jq; optional
fi

if [[ "${PARSE_SUCCESS}" != "true" ]]; then
  fail "Parse-and-publish did not succeed."
fi

ok "Parse-and-publish succeeded. Event ID: ${EVENT_ID:-<unknown (jq not installed)>}"

# 3) Events near
log "Events near: GET /v1/events/near?lat=${TEST_LAT}&lng=${TEST_LNG}&radius=${TEST_RADIUS}"

EVENTS_RESP="$(curl_json GET "${FLYPOST_API_BASE}/v1/events/near?lat=${TEST_LAT}&lng=${TEST_LNG}&radius=${TEST_RADIUS}" || true)"

if [[ -z "${EVENTS_RESP}" ]]; then
  fail "No response from /v1/events/near"
fi

echo "Response:"
echo "${EVENTS_RESP}"

if [[ "${HAS_JQ}" -eq 1 ]]; then
  EVENTS_SUCCESS="$(echo "${EVENTS_RESP}" | jq -r '.success // false')"
  TOTAL_EVENTS="$(echo "${EVENTS_RESP}" | jq -r '.data.total // 0')"
else
  EVENTS_SUCCESS="$(echo "${EVENTS_RESP}" | grep -q '"success"\s*:\s*true' && echo true || echo false)"
  TOTAL_EVENTS="?"
fi

if [[ "${EVENTS_SUCCESS}" != "true" ]]; then
  fail "/v1/events/near did not succeed."
fi

ok "Events near succeeded. Total events returned: ${TOTAL_EVENTS}"

echo
echo "🎉 Live Flypost API smoke test completed successfully."
echo "   Cloud Run proxy + backend + storage loop appears healthy."
