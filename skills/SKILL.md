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
- **PRESENCE** — Buyers verify presence on-site via geofenced QR code (100 meter radius). Time-gated to active event window. No app required.
- **ASK** — Conversational query engine for the event registry. Queryable by API.
- **SHARE** — Agent-facing share page for each listing. Buyers can check in, add to calendar, get directions.

**The physical artifact:** A printed QR code stand pointing to presence.goflypost.com. The URL never changes because events are time and geo gated. Placed at the exit door of every open house. Permanent — works forever without reprinting.

**The North Star:** M2M real world discovery for live events. Open houses are the wedge. The registry is the asset.

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

**The wedge:** Agents with properties 14+ days on market are starting to feel
pressure but are still actively holding open houses. Per Alexis Gallardo
(Compass): if you haven't received an offer after 10 days, something is wrong.
At 14 DOM the agent is proactive, not defensive. At 60+ DOM agents have
typically stopped holding open houses entirely — no events means no use case.
Target 14-45 DOM. Do not target 60+ DOM listings.

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

## Why the Feedback Channel Is Collapsing (Research Finding — March 2026)

Three forces are simultaneously closing the agent-form feedback channel:

**1. Incentive misalignment.** The buyer's agent has zero upside and meaningful
downside in providing candid feedback. Honest responses can signal their client's
interest level, expose negotiating position, or be forwarded to a seller whose
incentives conflict with candor. This is not unprofessional — it is rational.

**2. Identity exposure.** In many MLS-integrated systems, feedback is routed
to the seller directly. Agents report sellers Googling them and calling to argue.
The rational response: radio buttons and "not interested." Candor and identity
are incompatible in the current structure. Agents give honest feedback only to
colleagues they personally know — "relationship-filtered candor."

**3. Generational attitude shift.** Younger agents view non-response as
legitimate. This will not improve with better automation or more follow-up
sequences.

**ShowingTime allows up to 9 automated follow-up requests per showing.**
That is a confession about how badly the channel performs.

**The failed QR code test:** A seller independently placed a generic anonymous
QR survey at their open house and got zero responses. This confirms that
anonymity alone is not enough. Flypost succeeds where generic surveys fail
because:
- The check-in is the hook (presence verification, calendar, directions)
- Feedback follows an interaction the buyer already initiated
- Presence is server-enforced (Haversine check, time gating, origin restriction)
- The signal is credible because it is verified

**The moat restatement:** Curb Hero cannot add anonymous feedback without
cannibalizing lead capture — their primary revenue engine. If they did, they
would destroy their 6,000+ CRM integration strategy. They know the use case.
Their business model structurally prevents them from serving it.

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

**Radius:** 0.1 km (100 meters) — configured via `PRESENCE_RADIUS_KM` env var

- Tight enough to exclude neighbors
- Loose enough for GPS drift inside concrete multi-story buildings
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
- `flypost.agentEmail` — MUST be set to agent's actual email for dashboard to work
- `occurrences[]` — array of time windows with startDate/endDate

**Critical note on agentEmail:** Always set to the agent's actual email when
posting an event. If set to bronco@goflypost.com, the agent cannot see their
events in the dashboard. This was the root cause of the March 28th monitoring
failure.

---

## Presence Frontend Flow (as of April 2026)

1. Buyer scans QR at exit door → presence.goflypost.com
2. Lands on: "Tell the seller" + [GO] button
3. Taps GO → iOS location permission prompt fires
4. On allow: geo + time gate validated server-side
5. Success screen: "You're In." — auto-advances to feedback after 2 seconds
6. Feedback screen: "ANONYMOUS & PRIVATE" badge, "Are you making an offer?" (👍🤷👎)
   - 👍 → "What did you like most?"
   - 🤷 → "What would make this the one?"
   - 👎 → "What didn't work for you?"
7. Submit → full-screen "THANK YOU." confirmation, no redirect

**Error states:**
- Location denied: instructional message with AA → Website Settings → Location → Allow steps
- No event found: "You don't appear to be at the open house. Make sure you're inside the property and try again."

**Key design decisions:**
- Auto-advance to feedback (not a button) maximizes conversion at peak engagement moment
- Anonymous badge shown before first question — unlocks honest responses
- No exit links on success or thank you screens
- Feedback is the product, not check-in
- Exit door placement beats sign-in sheet placement
- Verbal prompt from agent ("scan before you leave") is required activation mechanism

**QR stand copy (physical artifact):**
"Tell the seller.
It's anonymous."

**Activation finding (March 28/29 2026):**
Passive QR placement produced 0 completions from ~25 buyers over 2 days.
Alexis confirmed ~8 buyers scanned but old "Check In Now" language killed conversion.
New copy deployed April 7th. First real test: April 18/19 open house.

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

---

## Agent Dashboard (as of 2026-03-17)

Lives at post.goflypost.com — renders between the Active Session header
and the post form when agent is authenticated via Firebase auth.

**Behavior:**
- Queries `GET /v1/agents/:email/events` — backend endpoint that fetches
  Firestore events where `flypost.agentEmail` == authenticated user's email
- Returns last 30 days of events only
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

**Future surface separation (post-MVP):**
- post.goflypost.com → posting only
- dashboard.goflypost.com → agent home base
- Do not build until 5+ agents are actively using both surfaces

---

## Poster Score (Do Not Build Yet)

Proprietary 0-100 composite score per listing. Inputs:
- Verified attendance count
- Feedback conversion rate
- wouldBuy distribution (yes/maybe/no ratio — stored as makeOffer in future)
- wantsSimilar rate (buyer intent signal)
- Days on market at time of open house
- Number of open houses held

Requires 50+ real events before statistically meaningful. Do not build yet.
This is the sentence that turns Flypost from a check-in tool into a listing
intelligence platform.

---

## Business Model

**Individual agents:**
- $150/listing (covers all open houses) — lead with this
- $50/open house — fallback

**Brokerage platform:**
- $10-15/agent/month
- Most expensive competing tool agents pay: ~$20/agent/month (per Rick Edler)
- 400-agent brokerage at $10/month = $4,000/month
- 2 brokerage contracts = $6-10k/month = founder goes full time

**TAM (realistic):**
- ~10,000 large brokerages in the US
- 5% penetration at $10/agent/month, avg 40 agents = $2.4M ARR
- 10% penetration = $4.8M ARR
- SAM is not the pitch — the data asset compounding is the pitch

**Pricing rules:**
- Never mention price in cold outreach
- Do not negotiate down from $150
- At the moment an agent asks a seller to cut $25,000, $50 is not a conversation worth having
- Frame around outcome, not cost

---

## Competitive Landscape

| Competitor | Model | Gap |
|---|---|---|
| Curb Hero | Free lead capture, 6000+ CRM integrations | No anonymous feedback, no presence, no registry — business model conflict |
| Spacio | Paid analytics, brokerage dashboards | Identity-linked, agent-mediated |
| Open Home Pro | Simple lead capture, offline | No intelligence layer |
| ShowingTime | Private showing scheduling | Agent-mediated, channel collapsing, 9 follow-ups = admission of failure |
| SurveyStance | iPad kiosk, emoji feedback | Hardware-dependent, no geofencing, unfunded |
| Generic QR surveys | Anonymous buyer feedback | No presence verification, empirically produces zero responses |

---

## Sales Strategy

**Primary target:** Agents with listings 14-45 DOM
- 14 DOM: agent feels first doubt, still holding open houses, proactive
- 45 DOM: still active but getting defensive
- 60+ DOM: stop holding open houses — no use case for Flypost

**Distribution reality (confirmed April 2026):**
Cold email to agents does not work. Empirically proven:
- 20 emails pre-March 19: zero responses
- 24 emails March 19: zero responses
- 16 emails April 7: pending

Agents buy from other agents. The only channel that works is warm referral.
Stop optimizing cold email copy. Fix distribution.

**What works:**
- Warm intros from existing agent users (Alexis Gallardo model)
- In-person demos at brokerage floor meetings
- CEO-level entry at brokerages (Rick Edler model)

**Cold email format (use only when warm intro not possible):**

Subject: "Why are buyers leaving [address]?"

Body:
- Line 1: specific address and DOM count
- Line 2: ballot box analogy
- Line 3: "We just ran our first deployment with a Compass agent in West LA."
- Line 4: "Worth a conversation?"
- Sign off as Bronco
- Plain text, no bullets, no bold, no price

Send Sunday night or Monday morning — agents debriefing weekend open houses,
pain is fresh.

**Voss principles that apply:**
- Label their pain in the subject line — they open because it's their listing
- "Worth a conversation?" is a calibrated question — gives them control
- Never ask how much it's worth to them — they'll anchor low
- State the price ($150) and stop talking

---

## Outreach Agent (scripts/outreach/) — Built 2026-03-19

```bash
cd scripts/outreach
node outreach.js              # full run
node outreach.js --reset-drafts  # regenerate drafts without re-scraping
```

- Scrapes Redfin for Santa Monica listings (update MIN_DOM from 30 to 14)
- Extracts agent contact info, falls back to brokerage site
- Generates personalized cold emails via Anthropic API
- Saves to Gmail drafts — Bronco reviews and sends manually
- SQLite dedup — idempotent across runs
- Do not run more than once per day (Redfin rate limiting)

**Environment:**
```
ANTHROPIC_API_KEY=sk-ant-...
GMAIL_CREDENTIALS_PATH=../../credentials.json
GMAIL_TOKEN_PATH=../../token.json
```

---

## Active Pipeline (as of April 7, 2026)

- **Alexis Gallardo** (Compass) — Most important relationship. Committed beta
  user. New listing coming in 90404, open house April 18/19. Meeting with
  Compass Santa Monica experience manager Thursday April 10th — she is
  facilitating the intro. Granville went under contract.
- **Compass Experience Manager** (Santa Monica) — Alexis meeting Thursday.
  This is the brokerage entry point. Need real buyer feedback data before
  this conversation. April 18/19 is the proof of concept.
- **Rick Edler** (Vista Sotheby's CEO) — Met Dec 2025. Gave exact product spec
  verbatim. Do not contact until after April 18/19 open house. Send one-line
  report, no ask, let him respond. Brokerage meetings: first Wednesday of month,
  Cheesecake Factory. Target May first Wednesday.
- **Andrew Pearce** (Sotheby's) — Warm contact, daughter's soccer team.
  Outreach sent April 2026. Keep casual.
- **Will Cooper** (BHHS Utah) — Family connection. Text sent.
- **16 Santa Monica agents** — Cold emails sent April 7, 2026. Pending.

---

## April 18/19 Pre-Flight Checklist

1. Get new listing address from Alexis (~1 week out)
2. Post event via post.goflypost.com with MLS URL
3. Confirm heroImageUrl populated in Firestore
4. Set flypost.agentEmail to Alexis's actual email
5. Test geofence in person at property before open house
6. Print new QR stands: "Tell the seller. It's anonymous."
7. Place stand at exit door — not sign-in sheet
8. Be present in person — verbal prompt to every buyer
9. After event: pull stats, generate report
10. Send Rick Edler one-line report — no ask

**Success metric:** 50%+ feedback conversion rate

---

## Founder

**Benjamin "Bronco" Mower** — sole founder, 100% equity

- Built entirely with AI tools (Claude Code, GitHub Copilot, ChatGPT)
- Managing construction in Palisades fire rebuild while building Flypost
- Moving to Salt Lake City (family)
- YC Spring 2026 — applied 2026-03-11, rejected 2026-03-13, no feedback given
- Revenue target to go full time: $6-10k/month
- Crunchbase: https://www.crunchbase.com/organization/flypost

---

## Investor Framing

- Physical world data primitive (a16z 2026 thesis: "interest returning to physical world")
- Vertical AI with proprietary data that compounds
- Ground truth in an era of synthetic data — cannot be scraped, synthesized, or bought
- The attendance registry grows with every check-in and cannot be replicated
- Structurally advantaged: dominant players cannot enter without cannibalizing
  their core lead-capture revenue model
- B2B brokerage revenue funds operation; M2M data layer is the exit story
- "Zillow owns listings. Flypost owns presence."

---

## Repo Notes

- Repo is private — keep it private
- Main entry: `backend/src/server.js`
- Presence logic: `backend/src/routes/presence.js`
- Proxy config: `proxy/cloudrun-proxy.js` — all new /v1/ routes must be added here
- Outreach agent: `scripts/outreach/outreach.js`
- Package: Node.js / Express, Firebase Admin, OpenAI SDK, date-fns-tz, AJV, express-rate-limit
- License: Apache-2.0
- Do NOT rename `wouldBuy` field — exists in 14+ files, defer to major refactor
