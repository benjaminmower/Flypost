---
name: flypost
description: >
  Deep context about the Flypost product, business, technical decisions, and
  strategy. Use this skill whenever working on anything related to Flypost —
  including coding tasks, outreach copy, product decisions, competitive
  positioning, investor materials, or sales strategy. If the user mentions
  open houses, presence verification, anonymous feedback, stale listings,
  agents, or any Flypost feature, load this skill immediately.
---

# Flypost Context Skill

This skill gives Claude deep context about Flypost so it can assist effectively
without needing re-explanation of the product, history, or strategy.

---

## What Flypost Is

Flypost is a verified presence platform for real estate open houses.

**The moat in one sentence:** Zillow owns listings. Flypost owns presence.
You can't scrape it, synthesize it, or buy it from the MLS.

**Core primitives:**

- **POST** — Agents publish open house events in natural language via post.goflypost.com. OpenAI parses into structured Firestore records with geo coordinates, time windows, and schema.org Event format.
- **PRESENCE** — Buyers check in on-site via geofenced QR code (50 meter radius). Time-gated to active event window. No app required.
- **ASK** — Conversational query engine for the event registry. Queryable by API.
- **SHARE** — Agent-facing share page for each listing. Buyers can check in, add to calendar, get directions.

**The physical artifact:** A 3D-printed QR code pointing to presence.goflypost.com. The URL never changes because events are time and geo gated. Sits next to the sign-in sheet at every open house. Permanent — works forever without reprinting.

---

## The Core Insight

**The seller is the true client.** The seller pays the agent's commission.
The agent's job is to sell the house. Every pitch, every feature, every report
must answer the seller's question: "Is my agent actually doing anything, and
why isn't my house selling?"

Flypost gives agents verified data to answer both questions:
- Verified attendance proves traffic ("here's who came and when")
- Anonymous feedback explains why buyers didn't offer ("here's what they actually thought")

The MLS cannot produce emotional connection data. Zillow cannot produce it.
No competitor produces it. Flypost does.

Every competitor (Curb Hero, Spacio, Open Home Pro, ShowingTime) optimizes
for lead capture — name, email, phone. They require buyer identity.

Flypost captures what happens after the agent leaves the room. Buyers perform
for agents during open houses and tell the truth when they're gone.
Anonymous buyer feedback and verified attendance are a fundamentally
different primitive than a digital sign-in sheet.

**The wedge:** Agents with properties 28+ days on market are starting to feel
pressure but are still actively holding open houses. This is the sweet spot.
At 60+ DOM agents have typically stopped holding open houses entirely —
they're no longer running events, so a presence tool is irrelevant to them.
At 28 DOM the agent is proactive, not defensive, and open to trying something new.
Flypost gives them verified data to have honest conversations with their seller:
"Here's who came, when, and what they actually thought."

The ballot box analogy works well in outreach:
*"Honest reactions buyers won't share to an agent's face but would put in a ballot box."*

**Flypost as a seller retention tool:**
"Your agent can now show you exactly how many verified buyers walked through
your home, when they came, and what they actually thought. Not Zillow views.
Not sign-in sheet names. Verified presence and honest reactions."

This is why brokerages will mandate it — agents who use Flypost retain seller
clients better because they can prove they're generating qualified traffic and
real market feedback.

---

## Tech Stack

- **Backend:** Node.js / Express
- **Database:** Firebase / Firestore
- **Hosting:** Netlify (ask.goflypost.com, post.goflypost.com, presence.goflypost.com)
- **Proxy:** Google Cloud Run (proxyv4) — routes all /v1/ traffic to backend
- **AI:** OpenAI API (natural language parse and publish)
- **Auth:** Firebase Auth (magic link) — session scoped per domain currently.
  Future: configure auth cookie on `.goflypost.com` root domain to share
  sessions across post.goflypost.com and dashboard.goflypost.com seamlessly.
- **Marketing site:** Webflow (goflypost.com)
- **Schema standard:** schema.org Event / GeoCoordinates / PostalAddress
- **Dev tools:** Claude Code, GitHub Copilot, ChatGPT, GitHub

---

## Presence Verification

**Radius:** 0.05 km (50 meters)

- Tight enough to exclude neighbors
- Loose enough for GPS drift inside a house
- Configured via `PRESENCE_RADIUS_KM` env var
- Geo-matching is 2D (lat/lng only — no elevation). Condos are handled by
  the time gate, not vertical geo. This is a known limitation.
- When no eventId is passed, nearest event within radius wins automatically.
  Multiple nearby events on the same block resolve correctly by distance.

**Failure codes (all log to console.error as greppable JSON):**

```
MISSING_BUYER_TOKEN      — No buyerToken in body
INVALID_COORDINATES      — Non-finite lat/lng
NO_NEARBY_EVENT          — Geo-search returned nothing
EVENT_NOT_FOUND          — Explicit eventId not in DB
EVENT_FETCH_ERROR        — DB error fetching event
EVENT_NOT_ACTIVE         — No active occurrence window
EVENT_NOT_TIME_GATABLE   — Missing startDate or endDate
INVALID_EVENT_TIME_DATA  — Malformed date strings
EVENT_NOT_STARTED        — Before startDate
EVENT_ALREADY_ENDED      — After endDate
TOO_FAR_FROM_EVENT       — Distance > radius threshold
```

All failures grep with: `grep PRESENCE_CHECK_IN_FAILURE`

**Firestore event document key fields:**

- `flypost.eventId` — unique event identifier
- `flypost.queryable` — true (enables API heatmap queries)
- `flypost.realTimeData` — true
- `flypost.heroImageUrl` — property hero image URL from MLS
- `location.geo.latitude/longitude` — GeoCoordinates
- `hash.value` — SHA-256 of canonical record (immutability/verification)
- `flypost.agentEmail` — placeholder until agent claims via magic link
- `occurrences[]` — array of time windows with startDate/endDate

---

## Presence Frontend Flow (as of 2026-03-17)

1. Buyer scans QR → presence.goflypost.com
2. Taps "Check In Now" → iOS location permission prompt fires
3. On allow: geo + time gate validated server-side
4. Success screen: green checkmark animation + "CHECKED IN." + property address + hero image
5. Auto-advances to feedback after 2 seconds — no tap required
6. Feedback screen: "ANONYMOUS & PRIVATE" badge, wouldBuy (👍🤷👎), wantsSimilar (👍👎), free text liked/disliked
7. Submit → full-screen "THANK YOU." confirmation, no redirect

**Error states:**
- Location denied: instructional message with AA → Website Settings → Location → Allow steps
- No event found: "You don't appear to be at the open house. Make sure you're inside the property and try again."

**Key design decisions:**
- Auto-advance to feedback (not a button) maximizes conversion at peak engagement moment
- Anonymous badge shown before first question — unlocks honest responses
- No exit links on success or thank you screens
- Feedback is the product, not check-in

---

## Stats Endpoint

`GET /v1/events/:eventId/stats`

Returns:
```json
{
  "success": true,
  "eventId": "evt_abc123",
  "attendanceCount": 11,
  "feedbackCount": 5
}
```

- No auth required
- Runs attendance and feedback counts in parallel via Promise.all
- Uses Firestore count() aggregation
- Proxy rule added to cloudrun-proxy.js (must be before generic /:event_id rule)
- First step toward M2M heatmap API and brokerage dashboard integrations

**Key metric:** Feedback conversion rate = feedbackCount / attendanceCount
- 50%+ = product is working
- Below 30% = friction problem in feedback flow
- First test (2026-03-17): 11 check-ins, 5 feedback = 45% with no real buyers and no hero image

---

## Agent Dashboard (as of 2026-03-17)

Lives at post.goflypost.com — renders between the Active Session header
and the post form when agent is authenticated via Firebase auth.

**Behavior:**
- Queries `GET /v1/agents/:email/events` — backend endpoint that fetches
  Firestore events where `flypost.agentEmail` == authenticated user's email
- Returns last 30 days of events only — implemented as
  `where('startDate', '>=', cutoff).orderBy('startDate', 'desc')`
  where cutoff = now - 30 days as ISO string. No additional index needed
  because the range filter and orderBy are on the same field (startDate).
- All stats fetched in parallel via Promise.all from `/v1/events/:eventId/stats`
- Auto-refreshes stats every 60 seconds for LIVE events only
- Groups events: LIVE → UPCOMING (soonest first) → ENDED (most recent first)

**Each event card shows:**
- Hero image thumbnail (flypost.heroImageUrl) if available
- Property address
- Date and time window in 12-hour format
- Status badge: LIVE (mint_leaf, pulsing dot) / UPCOMING / ENDED
- Attendance count and feedback count

**Architecture note:**
- Frontend does NOT query Firestore directly — all data goes through backend API
- Firestore composite index required: `flypost.agentEmail` ASC + `startDate` DESC
  Named "agent dashboard" in Firebase Console

**Future surface separation (post-MVP):**
- post.goflypost.com → posting only, single purpose
- dashboard.goflypost.com → agent home base, all listings and live stats
- Requires Firebase auth cookie on `.goflypost.com` root domain for shared sessions
- Do not build until 5+ agents are actively using both surfaces

**March 28th monitoring plan:**
- You post Alexis's event, set flypost.agentEmail to her email
- Send Alexis magic link to post.goflypost.com
- She authenticates once, sees her listings in YOUR LISTINGS section
- Watches check-ins and feedback update live during the open house
- No curl required, no you being present

Proprietary 0-100 composite score per listing. Inputs:
- Verified attendance count
- Feedback conversion rate
- wouldBuy distribution (yes/maybe/no ratio)
- wantsSimilar rate (buyer intent signal)
- Days on market at time of open house
- Number of open houses held

Answers: how engaged were your buyers?
- High attendance + low wouldBuy = pricing or property problem
- Low attendance + high wouldBuy = marketing problem
- High attendance + high conversion + majority wouldBuy = offer incoming

Requires 50+ real events before statistically meaningful. Do not build yet.
This is the sentence that turns Flypost from a check-in tool into a listing
intelligence platform.

---

## Business Model

- **$50 per open house** or **$150 per listing**
- US: ~5M home sales/year × 3 open houses avg = 15M events TAM
- At $50/event: $750M TAM at full penetration
- 1% penetration = $7.5M ARR
- Future layers: brokerage API access, ground-truth data licensing

---

## Competitive Landscape

| Competitor | Model | Gap |
|---|---|---|
| Curb Hero | Free lead capture, 6000+ CRM integrations | No anonymous feedback, no presence, no registry |
| Spacio | Paid analytics, brokerage dashboards | Identity-linked, agent-mediated |
| Open Home Pro | Simple lead capture, offline | No intelligence layer |
| ShowingTime | Private showing scheduling | Agent-mediated, not open houses |
| SurveyStance | iPad kiosk, emoji feedback | Hardware-dependent, no geofencing, unfunded |

**Key insight:** Curb Hero's own docs call anonymous buyer feedback
"the make or break moment" for stale listings — but their business model
requires identity. Anonymous feedback and lead capture are in direct tension.
Flypost chose the intelligence side.

---

## Sales Strategy

**Primary target:** Agents with listings 28-55 days on market

**Why 28 DOM is the sweet spot:** Agent is feeling early pressure but still
actively holding open houses. At 60+ DOM they've usually stopped holding events
entirely — no open houses means no use case for Flypost. At 28 DOM they're
proactive and open to new tools. Don't target 60+ DOM listings.

**Critical insight on cold outreach:** Cold email to agents does not work.
Agents buy from other agents. The channel is warm referrals and in-person
demos at brokerage meetings. 20 cold outreaches yielded zero conversions.
Stop optimizing copy. Fix distribution.

**What works:**
- Warm intros from existing agent users (Alexis Gallardo model)
- In-person demos at NAR chapter meetings and brokerage floor meetings
- CEO-level entry at brokerages (Rick Edler) to get in front of whole teams at once

**Email template for stale listing outreach:**
> "I noticed your listing at [address] has been on for [X] days with [Y] views.
> Flypost captures anonymous buyer feedback at open houses — honest reactions
> buyers won't share to an agent's face but would put in a ballot box.
> Would you be open to trying it on your next open house?"

**QR code placement pitch:**
Don't replace the sign-in sheet. Sign-in sheet captures leads.
QR code captures honest feedback. Two jobs, next to each other.

**The seller-first pitch (use this, not the agent-first pitch):**
"Your agent can show your seller exactly how many verified buyers walked
through the home, when they came, and what they actually thought. Not Zillow
views. Verified presence and honest reactions. That's what keeps sellers from
firing their agent at 45 DOM."

**The Zillow gap pitch:**
"Zillow tells agents their listing got 10,000 views but nothing about
who walked through the door or why they didn't make an offer."

---

## Active Pipeline (as of 2026-03-17)

- **Alexis Gallardo** (Compass) — Open house March 28/29, confirmed deployment,
  actively referring other agents. Most important relationship in the pipeline.
- **Guy Reid** (Douglas Elliman) — Text sent re: 2530 Beverley Ave open house
- **Rick Edler** (Vista Sotheby's CEO) — Met Dec 2025. His verbatim feedback:
  "It doesn't add value for the person selling the house. An app that shows
  that X is a client of X brokerage and knows when you visit an open house
  and asks you about the emotional connection to a property — what you don't
  like almost more than what you do like. The MLS is not able to deal with
  emotional connection which is what sells a house. Giving a brokerage a tool
  that allows their client to visit ANY open house and give feedback on it —
  3 questions: what you liked, what you didn't like, do you want houses similar
  to this — is what he would pay for."
  Flypost cannot handle PII so a full buyer identity app is not possible.
  However the 3 questions Rick specified are exactly what Flypost built.
  The March 29th report from Alexis's open house is the proof to send him.
  Do not request a meeting — send the report with one line: "Rick — first
  verified buyer feedback data from a Compass open house. Thought you'd want
  to see it." Let him respond.
  **Brokerage team meetings: first Wednesday of every month, Cheesecake Factory.**
  Target April first Wednesday for in-person demo with Vista team.
- **Will Cooper** (BHHS Utah) — Text sent, family connection
- **Neyshia Go** (Sotheby's) — Email sent, 82 DOM listing
- Megan's Marine St report sent — awaiting response

---

## March 28th Pre-Flight Checklist

1. Get Alexis's listing address — not on her Compass page yet as of 2026-03-17
2. Post event via post.goflypost.com with real MLS listing URL
3. Confirm heroImageUrl populated in Firestore after posting
4. Go to the address in person — test geofence by hitting presence endpoint on phone
5. Confirm event appears in YOUR LISTINGS on agent dashboard
6. Send Alexis magic link to post.goflypost.com so she can watch live
7. Have QR stands (in QC/shipping) or Compass-branded cardstock as backup
8. After event: curl stats endpoint, generate report for Alexis
9. March 29th: send Rick Edler the report with one line — no ask

**Success metric:** 50%+ feedback conversion rate (feedbackCount / attendanceCount)

---

**Benjamin "Bronco" Mower** — sole founder, 100% equity

- Built entirely with AI tools (Claude Code, GitHub Copilot, ChatGPT)
- Managing construction in Palisades fire rebuild while building Flypost
- Moving to Salt Lake City (family)
- YC Spring 2026 — applied 2026-03-11, rejected 2026-03-13, no feedback given
- Crunchbase: https://www.crunchbase.com/organization/flypost

---

## Investor Framing

- Physical world data primitive (a16z 2026 thesis: "interest returning to physical world")
- Vertical AI with proprietary data that compounds
- Ground truth in an era of synthetic data
- The data asset (attendance registry) grows with every check-in and cannot be replicated
- Poster Score is the proprietary intelligence layer that justifies data licensing

---

## Repo Notes

- Repo is private — keep it private
- Main entry: `backend/src/server.js`
- Presence logic: `backend/src/routes/presence.js`
- Proxy config: `proxy/cloudrun-proxy.js` — all new /v1/ routes must be added here
- Package: Node.js / Express, Firebase Admin, OpenAI SDK, date-fns-tz, AJV, express-rate-limit
- License: Apache-2.0
