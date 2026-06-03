# 90405 Seed Workflow

Use this workflow to make the Flypost PWA and Discovery API feel alive in one
dense geography before expanding.

## Target

Launch geography:

```text
90405 / Santa Monica
Center: 34.0089, -118.4716
Hyperlocal radius: 1.25 miles
```

Success target:

- 25 active events within 1.25 miles
- at least 5 categories represented
- every event has coordinates
- every event has start/end times
- every event has a public `shareUrl`
- image-backed events where practical for the PWA deck

## Categories

Seed across these Discovery categories:

- `garage_sale`
- `open_house`
- `live_event`
- `happy_hour`
- `community_alert`
- `missing_pet`
- `job_posting`
- `apartment`

## Ingestion Options

Agent service loop:

```bash
cd scripts/ingest
FLYPOST_API_BASE=https://api.goflypost.com \
FLYPOST_WRITE_TOKEN=$FLYPOST_WRITE_TOKEN \
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
MAX_SOURCES=10 \
npm start
```

The agent publishes events and records proof URLs in `scripts/ingest/proofs.log`.
See [Agent As A Service](agent-as-a-service.md).

Natural-language publish:

```bash
curl -X POST "https://api.goflypost.com/api/parse-and-publish" \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: $FLYPOST_WRITE_TOKEN" \
  -d '{"text":"Garage sale Saturday 9am-2pm at 123 Main St, Santa Monica, CA 90405. Household items, books, and kids toys."}'
```

Structured upsert:

```bash
curl -X POST "https://api.goflypost.com/v1/events/upsert" \
  -H "Content-Type: application/json" \
  -H "x-flypost-write-token: $FLYPOST_WRITE_TOKEN" \
  -d @event.json
```

PWA flyer publish:

```text
https://app.goflypost.com/post
```

Use the PWA when an image should appear in the swipe deck.

## QA Query

After seeding, verify nearest-first discovery:

```bash
curl "https://api.goflypost.com/v1/events/near?lat=34.0089&lng=-118.4716&radius_mi=1.25"
```

Expected:

- response envelope has `protocol: "flypost-discovery"`
- events are within the requested radius
- events are sorted by ascending `distance_mi`
- events with no geo are absent
- `meta.count` equals `events.length`

For a quick sort check:

```bash
curl -s "https://api.goflypost.com/v1/events/near?lat=34.0089&lng=-118.4716&radius_mi=1.25" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); console.log((j.events||[]).map(e=>[e.distance_mi,e.what?.type,e.what?.label,e.where?.address]).slice(0,10));})"
```

## PWA Check

Open:

```text
https://app.goflypost.com
```

From a 90405 location or browser location override:

- allow location
- confirm the deck shows nearby image-backed flyers
- confirm the first cards match the lowest `distance_mi` events
- swipe right and confirm `/saved` works
- tap a card and confirm `shareUrl` opens

## Seed Record Template

Track each seeded item:

```text
source:
category:
title:
address:
start:
end:
image:
eventId:
shareUrl:
qa_status:
```

## Expansion Rule

Do not expand geography until the 90405 query reliably returns a useful local
set. Density beats coverage.
