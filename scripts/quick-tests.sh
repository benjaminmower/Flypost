#!/usr/bin/env bash
# quick-tests.sh — Flypost v4 proxy/backend quick validation
set -euo pipefail

# Config (update if needed)
PROJECT="goflypost"
REGION="us-west1"
BACKEND="https://flypostv4-a7jlfl42zq-uw.a.run.app"
PROXY="https://proxyv4-498798854474.us-west1.run.app"
ORIGIN="https://flypost.netlify.app"

echo "Using:"
echo "  PROJECT=${PROJECT}"
echo "  REGION=${REGION}"
echo "  BACKEND=${BACKEND}"
echo "  PROXY=${PROXY}"
echo "  ORIGIN=${ORIGIN}"
echo

echo "1) Backend privacy: unauthenticated should be 401/403"
code=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND}/v1/events/near")
echo "   Status: ${code}"
if [[ "${code}" == "401" || "${code}" == "403" ]]; then
  echo "   OK (backend is private)"
else
  echo "   WARNING: expected 401/403, got ${code}"
fi
echo

echo "2) Backend with identity token should be 200"
TOKEN="$(gcloud auth print-identity-token)"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "${BACKEND}/v1/events/near")
echo "   Status: ${code}"
if [[ "${code}" == "200" ]]; then
  echo "   OK"
else
  echo "   ERROR: expected 200, got ${code}"; exit 1
fi
echo

echo "3) Proxy health should be 200"
code=$(curl -s -o /dev/null -w "%{http_code}" "${PROXY}/health")
echo "   Status: ${code}"
if [[ "${code}" == "200" ]]; then
  echo "   OK"
else
  echo "   ERROR: expected 200, got ${code}"; exit 1
fi
echo

echo "4) Proxy GET /v1/events/near should be 200 and include CORS"
respHeaders=$(mktemp)
curl -s -D "${respHeaders}" -o /dev/null -H "Origin: ${ORIGIN}" "${PROXY}/v1/events/near"
status=$(grep -m1 -E '^HTTP/' "${respHeaders}" | awk '{print $2}')
cors=$(grep -i '^access-control-allow-origin:' "${respHeaders}" | awk '{print $2}' | tr -d '\r')
echo "   Status: ${status}"
echo "   Access-Control-Allow-Origin: ${cors:-<missing>}"
if [[ "${status}" == "200" && "${cors}" == "${ORIGIN}" ]]; then
  echo "   OK"
else
  echo "   WARNING: expected 200 + ACAO=${ORIGIN}"
fi
rm -f "${respHeaders}"
echo

echo "5) Proxy POST /api/parse-and-publish should succeed and return an eventId"
payload='{"naturalLanguageInput":"Garage sale Saturday 9am-1pm at 45 Oak Ln Springfield IL. Contact Amy amy@example.com"}'
resp=$(curl -s -H "Origin: ${ORIGIN}" -H "Content-Type: application/json" -d "${payload}" "${PROXY}/api/parse-and-publish")
echo "   Raw response (truncated): $(echo "${resp}" | cut -c1-200)..."
ok=$(echo "${resp}" | jq -r '.success // false')
event1=$(echo "${resp}" | jq -r '.data.eventId // empty')
if [[ "${ok}" == "true" && -n "${event1}" ]]; then
  echo "   OK eventId=${event1}"
else
  echo "   ERROR: parse publish failed"; echo "${resp}" | jq .; exit 1
fi
echo

echo "6) Verify event appears in proxy GET /v1/events/near"
eventsJson=$(curl -s -H "Origin: ${ORIGIN}" "${PROXY}/v1/events/near")
count=$(echo "${eventsJson}" | jq -r '.data.total // .data.events | length')
found=$(echo "${eventsJson}" | jq -r --arg id "${event1}" '.data.events[]?.flypost.eventId | select(.==$id)' || true)
echo "   Events count (reported): ${count}"
if [[ "${found}" == "${event1}" ]]; then
  echo "   OK found newly created eventId"
else
  echo "   WARNING: new eventId not found in near response"
fi
echo

echo "7) Parse again to confirm unique eventId per submission"
payload2='{"naturalLanguageInput":"Community concert Friday 7pm at 123 Main St Springfield IL. Contact Bob bob@example.com"}'
resp2=$(curl -s -H "Origin: ${ORIGIN}" -H "Content-Type: application/json" -d "${payload2}" "${PROXY}/api/parse-and-publish")
ok2=$(echo "${resp2}" | jq -r '.success // false')
event2=$(echo "${resp2}" | jq -r '.data.eventId // empty')
echo "   New eventId: ${event2}"
if [[ "${ok2}" == "true" && -n "${event2}" && "${event2}" != "${event1}" ]]; then
  echo "   OK eventId is unique"
else
  echo "   ERROR: eventId missing or not unique"; echo "${resp2}" | jq .; exit 1
fi
echo

echo "8) Proxy CORS on error path (negative test) — call non-existent path"
err=$(curl -s -D - -o /dev/null -H "Origin: ${ORIGIN}" "${PROXY}/v1/events/nearzzz" || true)
status=$(echo "${err}" | head -n1 | awk '{print $2}')
acao=$(echo "${err}" | awk -F': ' 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin/{print $2}' | tr -d '\r')
echo "   Status: ${status} (expected non-200)"
echo "   Access-Control-Allow-Origin: ${acao:-<missing>}"
if [[ -n "${acao}" ]]; then
  echo "   OK error path includes CORS"
else
  echo "   WARNING: missing CORS on error path"
fi
echo

echo "9) Optional: summarize recent proxy request statuses for /v1/events/near"
gcloud logging read \
  "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"proxyv4\" resource.labels.location=\"${REGION}\" httpRequest.requestUrl=~\"/v1/events/near\"" \
  --project="${PROJECT}" --limit=10 --format='table(timestamp,httpRequest.status,httpRequest.requestUrl)' || true

echo
echo "All quick tests complete."
