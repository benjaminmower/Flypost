#!/usr/bin/env bash
# quick-tests.sh — Flypost v4 proxy/backend quick validation (instrumented)
set -Eeuo pipefail

# Debug mode: set DEBUG=1 to enable trace
if [[ "${DEBUG:-0}" == "1" ]]; then
  set -x
fi

trap 'echo "ERROR: command failed at ${BASH_SOURCE}:${LINENO} (exit $?)" >&2' ERR

# Soft timeout defaults
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"
CURL_MAX_TIME="${CURL_MAX_TIME:-15}"

# Dependency checks
for cmd in curl jq gcloud; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: missing dependency: ${cmd}" >&2
    exit 1
  fi
done

# Config (env overrides supported)
PROJECT="${PROJECT:-goflypost}"
REGION="${REGION:-us-west1}"
BACKEND="${BACKEND:-https://flypostv4-a7jlfl42zq-uw.a.run.app}"
PROXY="${PROXY:-https://proxyv4-498798854474.us-west1.run.app}"
ORIGIN="${ORIGIN:-https://flypost.netlify.app}"

echo "Using:"
echo "  PROJECT=${PROJECT}"
echo "  REGION=${REGION}"
echo "  BACKEND=${BACKEND}"
echo "  PROXY=${PROXY}"
echo "  ORIGIN=${ORIGIN}"
echo

step() {
  echo
  echo "=== Step $1: $2 ==="
}

curl_json() {
  curl -sS \
    --connect-timeout "${CURL_CONNECT_TIMEOUT}" \
    --max-time "${CURL_MAX_TIME}" \
    "$@"
}

# Step 1: Backend privacy
step 1 "Backend privacy (unauthenticated)"
code=$(curl_json -o /dev/null -w "%{http_code}" "${BACKEND}/v1/events/near")
echo "Status: ${code}"
if [[ "${code}" == "401" || "${code}" == "403" ]]; then
  echo "OK (backend is private)"
else
  echo "WARNING: expected 401/403, got ${code}"
fi

# Step 2: Backend authenticated
step 2 "Backend identity token"
echo "Obtaining identity token..."
TOKEN="$(gcloud auth print-identity-token 2>/dev/null || true)"
if [[ -z "${TOKEN}" ]]; then
  echo "ERROR: could not obtain identity token. Run: gcloud auth login"
  exit 1
fi
code=$(curl_json -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "${BACKEND}/v1/events/near")
echo "Status: ${code}"
if [[ "${code}" != "200" ]]; then
  echo "ERROR: expected 200, got ${code}"
  exit 1
fi
echo "OK"

# Step 3: Proxy health
step 3 "Proxy health"
code=$(curl_json -o /dev/null -w "%{http_code}" "${PROXY}/health")
echo "Status: ${code}"
[[ "${code}" == "200" ]] && echo "OK" || { echo "ERROR: expected 200"; exit 1; }

# Step 4: Proxy near with CORS
step 4 "Proxy /v1/events/near + CORS"
respHeaders=$(mktemp)
curl_json -D "${respHeaders}" -o /dev/null -H "Origin: ${ORIGIN}" "${PROXY}/v1/events/near"
status=$(grep -m1 -E '^HTTP/' "${respHeaders}" | awk '{print $2}')
acao=$(awk -F': ' 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin/{print $2}' "${respHeaders}" | tr -d '\r' | tail -n1)
echo "Status: ${status}"
echo "Access-Control-Allow-Origin: ${acao:-<missing>}"
if [[ "${status}" == "200" && "${acao}" == "${ORIGIN}" ]]; then
  echo "OK"
else
  echo "WARNING: expected ACAO=${ORIGIN}"
  sed 's/^/  HDR: /' "${respHeaders}" | sed -n '1,40p'
fi
rm -f "${respHeaders}"

# Step 5: Parse & publish event
step 5 "Proxy parse & publish (garage sale)"
payload='{"naturalLanguageInput":"Garage sale Saturday 9am-1pm at 45 Oak Ln Springfield IL. Contact Amy amy@example.com"}'
resp=$(curl_json -H "Origin: ${ORIGIN}" -H "Content-Type: application/json" -d "${payload}" "${PROXY}/api/parse-and-publish" || true)
echo "Raw response (truncated): $(echo "${resp}" | cut -c1-200)..."
ok=$(echo "${resp}" | jq -r '.success // false' 2>/dev/null || echo false)
event1=$(echo "${resp}" | jq -r '.data.eventId // empty' 2>/dev/null || echo "")
if [[ "${ok}" != "true" || -z "${event1}" ]]; then
  echo "ERROR: parse publish failed"; echo "${resp}" | jq . || echo "${resp}"
  exit 1
fi
echo "OK eventId=${event1}"

# Step 6: Verify event appears
step 6 "Verify event appears in /near"
eventsJson=$(curl_json -H "Origin: ${ORIGIN}" "${PROXY}/v1/events/near")
count=$(echo "${eventsJson}" | jq -r 'if (.data|type)=="object" then (.data.total // ((.data.events // []) | length)) else 0 end' 2>/dev/null || echo 0)
found=$(echo "${eventsJson}" | jq -r --arg id "${event1}" '(((.data.events // []) | map(.flypost.eventId)) | any(. == $id))' 2>/dev/null || echo false)
echo "Events count (reported): ${count}"
if [[ "${found}" == "true" ]]; then
  echo "OK found newly created eventId"
else
  echo "WARNING: new eventId not found (may lack geo; fallback logic should show events without radius filtering)"
fi

# Step 7: Second parse (explicit date-time to avoid validation failure)
step 7 "Second parse unique ID"
payload2='{"naturalLanguageInput":"Community concert on December 15, 2025 at 7:00 PM at 123 Main St Springfield IL. Contact Bob bob@example.com"}'
resp2=$(curl_json -H "Origin: ${ORIGIN}" -H "Content-Type: application/json" -d "${payload2}" "${PROXY}/api/parse-and-publish" || true)
ok2=$(echo "${resp2}" | jq -r '.success // false' 2>/dev/null || echo false)
event2=$(echo "${resp2}" | jq -r '.data.eventId // empty' 2>/dev/null || echo "")
echo "New eventId: ${event2:-<missing>}"
if [[ "${ok2}" == "true" && -n "${event2}" && "${event2}" != "${event1}" ]]; then
  echo "OK eventId is unique"
else
  echo "ERROR: second parse failed or not unique"; echo "${resp2}" | jq . || echo "${resp2}"
  exit 1
fi

# Step 8: Error path CORS
step 8 "Proxy error path CORS"
err=$(curl_json -D - -o /dev/null -H "Origin: ${ORIGIN}" "${PROXY}/v1/events/nearzzz" || true)
statusErr=$(echo "${err}" | head -n1 | awk '{print $2}')
acaoErr=$(echo "${err}" | awk -F': ' 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin/{print $2}' | tr -d '\r' | tail -n1)
echo "Status: ${statusErr:-<unknown>}"
echo "Access-Control-Allow-Origin: ${acaoErr:-<missing>}"
[[ -n "${acaoErr}" ]] && echo "OK error path includes CORS" || echo "WARNING: missing CORS on error path"

# Step 9: Recent proxy logs
step 9 "Recent proxy /near statuses"
gcloud logging read \
  "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"proxyv4\" resource.labels.location=\"${REGION}\" httpRequest.requestUrl=~\"/v1/events/near\"" \
  --project="${PROJECT}" --limit=10 --format='table(timestamp,httpRequest.status,httpRequest.requestUrl)' || echo "Log query failed"

echo
echo "All quick tests complete."
