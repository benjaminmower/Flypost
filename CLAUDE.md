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
- Presence logic: `backend/src/routes/presence.js` — Haversine + time gate + origin restriction
- Never rename `wouldBuy` — 14+ files
- Never store raw GPS after verification — privacy commitment
- Repo is private
- `flypost.agentEmail` must be agent's real email or dashboard breaks

## Presence
- 100m radius (PRESENCE_RADIUS_KM), 2D only, nearest event wins if no eventId
- Failure codes: `grep PRESENCE_CHECK_IN_FAILURE`
- buyerToken = localStorage ULID, pseudonymous

## Firestore Fields
- `flypost.eventId`, `flypost.agentEmail`, `flypost.heroImageUrl`
- `location.geo.latitude/longitude`
- `occurrences[]` — startDate/endDate (UTC ISO)
- `flypost.timezone` — "America/Los_Angeles"

## Coding Conventions
- State files to be touched before editing
- Flag breaks before writing code
- Frontend copy ≠ backend changes
- Don't rename DOM IDs without JS counterparts
- No analytics hooks — labels safe to rename

## Do Not Build Yet
- Poster Score — needs 50+ events
- dashboard.goflypost.com split — needs 5+ agents
- Root domain auth cookie — defer
- wantsSimilar field — not implemented
- wouldBuy → makeOffer rename — next major refactor
