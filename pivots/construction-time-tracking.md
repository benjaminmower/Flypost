# Pivot: Construction Subcontractor Time Tracking

## Why this pivot

The real-estate open-house hypothesis didn't land. But the primitive Flypost built — geo-gated, pseudonymous, time-windowed check-ins keyed on a localStorage ULID, with no raw GPS retention — is a closer fit for construction time tracking than it ever was for open houses.

Construction time tracking is a validated category (Procore, ExakTime, busybusy, Raken, Workyard at the software tier; Triax, Eyrus, WakeCap at the hardware tier). The incumbents are beatable at the SMB/sub tier where:

- Tools are GC-first, sub-hostile. Subs hate being forced onto a GC's system.
- Hardware-based incumbents cost $50k+ to deploy. There's a $20-beacon, BYO-phone gap.
- Certified payroll (Davis-Bacon) is a real compliance burden underserved at SMB scale.
- Workers and unions increasingly push back on retain-everything GPS surveillance — our "verify then discard" stance is genuinely differentiated.

**The wedge:** the tool subs use to defend their *own* hours, not another GC dashboard.

## What carries over from Flypost

- Presence verification (Haversine, time gate, origin restriction) in `backend/src/routes/presence.js`
- Pseudonymous identity: `buyerToken` ULID in localStorage (`frontend_presence/src/main.js`)
- Firestore + Cloud Run proxy + Netlify frontend pattern
- The privacy posture: verify presence, discard raw GPS
- Magic-link auth for the eventual admin/foreman tier (Firebase Auth)

What does *not* carry over: the LLM event parser, the open-house-specific feedback schema (`wouldBuy`, `different`), the brokerage-keyed event identity.

## Product shape

### The check-in moment

Worker arrives at a jobsite, scans a posted QR code (encodes `siteId`), opens a web page. Two scans per day:

- **First scan** = clock in. Opens a session.
- **Second scan** = clock out. Closes the session. Hours = `lastOut − firstIn`. No mid-day break tracking in v0.

QR code first (no hardware, works on 100% of sites day one). BLE beacons are an upgrade path for sites that need stronger spoof resistance or passive duration tracking — deferred until QR-only proves the wedge.

### Identity is progressive

The deciding insight from this pivot's design conversation:

- **Unknown UUID** → trigger onboarding form (name, trade, sub, foreman).
- **Known but incomplete profile** → flag and prompt for missing fields next time the app opens.
- **Known and complete** → silent check-in.

Same idea as Flypost's existing buyerToken model, but the profile gets richer over time. Workers don't fight a form on day one if there's nothing to ask. They do fill it once, then it's invisible.

### Onboarding form (kept short on purpose)

- Name
- Trade (dropdown — plumber, electrician, drywall, laborer, carpenter, ironworker, …)
- Subcontractor (dropdown — pre-approved per site by the GC/site admin)
- Foreman (text)

Nothing else at the gate. Cost code, photo, phone number → "complete your profile later" prompts. Every field added is a fight at 6:30am with a tired worker.

### Sub and trade come from the site's approved list

The GC or site admin pre-loads `approvedSubs[]` and `approvedTrades[]` on the jobsite record. Worker picks from a dropdown, never types free text. This avoids the "Acme" / "Acme Plumbing" / "Acme Plumbing LLC" data nightmare from day one.

In v0 this list is seeded by script. The admin UI to manage it comes after one real site is running.

## Architecture sketch

### Firestore (new collections, alongside existing `events` / `attendance`)

```
jobsites/{siteId}
  siteName, address, location.geo { latitude, longitude }
  approvedSubs:   [{ subId, name }]
  approvedTrades: [string]
  status: active | complete
  gcOwnerEmail
  createdAt

workers/{workerToken}
  workerToken              # localStorage ULID — same mechanism as buyerToken
  name, trade, subId, foreman
  profileComplete: bool
  createdAt, updatedAt

sessions/{sessionId}
  workerToken, siteId
  dayKey: YYYY-MM-DD       # one session per worker/site/day
  firstInAt, lastOutAt     # UTC ISO
  durationMinutes          # computed on close
  firstInProof, lastOutProof: { method: "qr", lat, lng, distanceM }
  status: open | closed
```

`attendance` (existing one-shot event collection) is *not* overloaded — sessions are a different shape.

### Backend routes (new files in `backend/src/routes/`)

- `POST /v1/jobsites/scan` — single endpoint for both in and out
  1. Verify location within `PRESENCE_RADIUS_KM` of site (reuse Haversine from `backend/src/routes/presence.js:36-48`).
  2. Compute `dayKey` from site timezone.
  3. Find or create session for `(workerToken, siteId, dayKey)`. Open → close, Closed → re-open, None → create.
  4. Return `action`, `session`, `worker.profileComplete`.
- `POST /v1/workers/profile` — upsert profile. Validates `trade` ∈ `approvedTrades`, `subId` ∈ `approvedSubs`.
- `GET /v1/workers/:workerToken` — fetch profile.
- `GET /v1/jobsites/:siteId` — public site info, drives the dropdowns.

**All four routes must be registered in `proxy/cloudrun-proxy.js`** — non-negotiable per CLAUDE.md. Pattern is at lines 196–214.

### Frontend (`frontend_presence/`)

Reuse the existing presence app shell. New flow at `presence.goflypost.com/?site=XYZ`:

- Read/create `workerToken` in localStorage (rename `getBuyerToken()` → `getWorkerToken()` in `frontend_presence/src/main.js:31`).
- Tap → request geolocation → POST `/v1/jobsites/scan`.
- Branch on response:
  - `checked_in` + incomplete profile → show onboarding form, then confirmation.
  - `checked_in` + complete → silent confirmation.
  - `checked_out` → "You worked N minutes."

Files touched: `index.html` (new views), `src/main.js` (state machine), `src/api.js` (new methods). Glass-card styling reused as-is.

## v0 scope (vertical slice)

The smallest thing that proves the loop:

1. One hardcoded jobsite (`site_demo_001`), seeded via `scripts/seed-jobsite.js`.
2. One printed QR encoding `https://presence.goflypost.com/?site=site_demo_001`.
3. Worker can scan in, fill the form once, scan out, see their hours.

Not in v0:
- Admin UI for site setup or sub list management
- Sub dashboard of crew hours
- GC reports, certified payroll exports
- Beacons, Web Bluetooth, tags
- Photo verification, biometrics
- Lunch deduction, mid-day breaks
- Cross-device identity (new phone = new UUID; "claim previous worker" comes later)

## Verification (manual, end-to-end)

1. Seed `site_demo_001` at a real address.
2. Print QR. Stand within 100m.
3. **Unknown worker** (cleared localStorage): scan → form → submit → "clocked in". Verify `workers/{token}` and `sessions/{id}` in Firestore.
4. **Scan again** a few minutes later: no form, "clocked out, N minutes". Session `status: closed`, duration set.
5. **Scan a third time** same day: session re-opens. Confirm semantics are intended.
6. **Negative**: scan from >100m → rejected, no session.
7. **Negative**: no `site` query param → graceful error.
8. **Cross-day**: scan today after yesterday's session left open → new session, yesterday's untouched.

No automated tests in v0. The win is shipping the loop and watching one real sub use it.

## Open questions for next iteration

- **Cross-device identity**: how does a worker who buys a new phone keep their history? Phone number + magic-link "claim" flow is the obvious answer, but adds friction.
- **Disputes**: when a worker says "I was there" and the system says no, who arbitrates? Foreman view that lets a foreman vouch is probably the answer.
- **Gate-attested sites (the 5%)**: a foreman/gate tablet that bulk-checks-in a crew is a configuration of this same system, not a separate product.
- **Beacon attestation**: ESP32 with rotating tokens, signed by a site key — the upgrade path when QR spoofing becomes a real problem. Phone-attested vs beacon-attested vs mutual is the design fork.
- **Certified payroll**: structured presence → WH-347 generation is the compliance wedge that justifies a price step-up.
- **Free-text subs reconciliation**: if we ever allow free text (we shouldn't in v0), an LLM cleanup pass to canonicalize "Acme" / "Acme Plumbing LLC" reuses the `llmParser.js` pattern.

## Files this pivot would touch

New:
- `backend/src/routes/jobsites.js`
- `backend/src/routes/workers.js`
- `scripts/seed-jobsite.js`

Modified:
- `backend/src/server.js` — mount new routers
- `proxy/cloudrun-proxy.js` — register `/v1/jobsites/*` and `/v1/workers/*`
- `frontend_presence/index.html` — new views
- `frontend_presence/src/main.js` — state machine, rename token helper
- `frontend_presence/src/api.js` — new API client methods

Untouched: existing `events` / `attendance` / `presence.js`, `post.goflypost.com`, `ask.goflypost.com`, `llmParser.js`. The real-estate code keeps working while this runs in parallel.
