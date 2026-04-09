# Flypost — Claude Code Context

## Stack
- Backend: Node.js / Express — `backend/src/server.js`
- Database: Firebase / Firestore
- Proxy: Google Cloud Run (proxyv4) — `proxy/cloudrun-proxy.js`
- Frontend: Netlify — presence.goflypost.com, post.goflypost.com, ask.goflypost.com
- Auth: Firebase Auth (magic link)
- AI: OpenAI API (event parsing)

## Critical Rules
- ALL new /v1/ routes must be added to `proxy/cloudrun-proxy.js` or they will 404
- Presence logic lives in `backend/src/routes/presence.js` — do not modify without understanding Haversine check, time gating, and origin restriction
- Never rename backend field `wouldBuy` — it exists in 14+ files
- Never store raw GPS coordinates after verification — privacy policy commitment
- Repo is private — do not reference externally

## Presence Verification
- Radius: 100m (PRESENCE_RADIUS_KM env var)
- 2D only — lat/lng, no elevation
- Failure codes grep: `grep PRESENCE_CHECK_IN_FAILURE`
- buyerToken is localStorage ULID — pseudonymous, never linked to identity

## Firestore Key Fields
- `flypost.eventId` — unique event identifier
- `flypost.agentEmail` — must be set to agent's actual email for dashboard
- `flypost.heroImageUrl` — property hero image
- `location.geo.latitude/longitude` — event coordinates
- `occurrences[]` — array of startDate/endDate windows (UTC ISO strings)
- `flypost.timezone` — always "America/Los_Angeles" currently

## Frontend Copy (current)
- Landing: "Tell the seller" + [GO] button
- Success state: "You're In."
- Feedback question: "Are you making an offer?"
- 👍 → "What did you like most?"
- 🤷 → "What would make this the one?"
- 👎 → "What didn't work for you?"
- Anonymous badge: "ANONYMOUS & PRIVATE"

## Coding Conventions
- Scope every change — state what files will be touched before touching them
- Flag anything that breaks before writing code
- Frontend copy changes never require backend changes
- Do not rename DOM IDs (view-checkin, btn-checkin) without renaming JS counterparts simultaneously
- No analytics hooks in current frontend — safe to rename labels freely

## Do Not Build Yet
- Poster Score (composite listing intelligence score) — needs 50+ real events
- dashboard.goflypost.com separation from post.goflypost.com — needs 5+ active agents
- Firebase auth cookie on root domain — defer until multi-surface needed
- wantsSimilar field — not yet implemented
- wouldBuy → makeOffer field rename — defer to next major refactor

## Active Priorities (April 2026)
1. April 18/19 open house — new Alexis listing in 90404, address TBD
2. QR stands: print with "Tell the seller. It's anonymous."
3. Compass experience manager meeting — Alexis facilitating
4. Rick Edler — send report after April 18/19, one line, no ask
