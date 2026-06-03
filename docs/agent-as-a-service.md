# Flypost Agent As A Service

The Flypost agent service is the supply-side loop for the Discovery Protocol.
It finds local event sources, extracts events, publishes them to Flypost, and
then proves each published event is retrievable.

The guarantee is not attendance or third-party LLM impressions. The guarantee is
mechanical:

- the event was accepted into the Flypost registry
- the event has a canonical `eventId`
- the event has a public `shareUrl`
- the event is retrievable by ID
- the event appears in `GET /v1/events/near` for its coordinates
- the exact proof URLs are recorded

## Current Implementation

The service loop lives in:

```text
scripts/ingest/agent.js
```

It uses:

- Anthropic for source discovery and event extraction
- Playwright/fetch for source retrieval
- SQLite for duplicate tracking
- `POST /api/parse-and-publish` for publishing
- `GET /v1/events/{event_id}` and `GET /v1/events/near` for proof

## Run Modes

Dry run:

```bash
cd scripts/ingest
npm install
cp .env.example .env
npm start -- --dry-run
```

Live run:

```bash
cd scripts/ingest
FLYPOST_API_BASE=https://api.goflypost.com \
FLYPOST_WRITE_TOKEN=$FLYPOST_WRITE_TOKEN \
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
MAX_SOURCES=10 \
VERIFY_AFTER_PUBLISH=true \
VERIFY_RADIUS_MI=1.25 \
npm start
```

## Inputs

Configured seed sources live in:

```text
scripts/ingest/sources.config.js
```

The agent starts from these sources, asks for additional local source URLs, and
continues until `MAX_SOURCES` is reached.

## Outputs

Local state:

```text
scripts/ingest/ingest.sqlite
scripts/ingest/decisions.log
scripts/ingest/proofs.log
```

`ingest.sqlite` tracks duplicates and proof URLs. `proofs.log` is newline JSON
with records like:

```json
{
  "timestamp": "2026-06-03T00:00:00.000Z",
  "eventId": "evt_example_123",
  "proofEventUrl": "https://api.goflypost.com/v1/events/evt_example_123",
  "proofNearUrl": "https://api.goflypost.com/v1/events/near?lat=34.01&lng=-118.47&radius_mi=1.25",
  "shareUrl": "https://goflypost.com/e/example/evt_example_123_fpid",
  "byIdOk": true,
  "nearOk": true,
  "verified": true,
  "verifiedAt": "2026-06-03T00:00:01.000Z"
}
```

## Customer-Facing Guarantee

Use this language:

```text
Your event will be published into the Flypost local discovery registry and we
will give you proof: the public share URL and the exact API calls that return
your event by ID and by nearby location.
```

Avoid this language:

```text
Your event will be shown by ChatGPT, Claude, Gemini, or Perplexity.
People will attend.
You will get a fixed number of impressions.
```

Those outcomes depend on demand channels outside the registry. Flypost can
guarantee inclusion, retrievability, structure, and surfaces. Flypost-owned
surfaces such as the PWA and concierge can also guarantee serving behavior when
users query within the event radius.

## Service Loop

1. Load configured source URLs.
2. Fetch source content.
3. Extract concrete upcoming events.
4. Skip duplicates by source URL and start date.
5. Publish new events.
6. Verify by ID.
7. Verify by `/near`.
8. Store proof URLs.
9. Repeat until source, token, or time budget is exhausted.

## Next Hardening Steps

- Run under Cloud Scheduler or GitHub Actions with a small `MAX_SOURCES`.
- Add a production write token dedicated to ingestion.
- Store proofs centrally instead of only local SQLite/log files.
- Add source quality scores and suppression for noisy sources.
- Add alerting when publish succeeds but proof verification fails.
