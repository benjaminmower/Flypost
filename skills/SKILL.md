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

Every competitor (Curb Hero, Spacio, Open Home Pro, ShowingTime) optimizes
for lead capture — name, email, phone. They require buyer identity.

Flypost captures what happens after the agent leaves the room. Buyers perform
for agents during open houses and tell the truth when they're gone.
Anonymous buyer feedback and verified attendance are a fundamentally
different primitive than a digital sign-in sheet.

**The wedge:** Stale listings. Agents with properties 51+ days on market
(national median is 66 days as of Jan 2026) are losing credibility with sellers.
Flypost gives them verified data to have honest conversations:
"Here's who came, when, and what they actually thought."

The ballot box analogy works well in outreach:
*"Honest reactions buyers won't share to an agent's face but would put in a ballot box."*

---

## Tech Stack

- **Backend:** Node.js / Express
- **Database:** Firebase / Firestore
- **Hosting:** Netlify (ask.goflypost.com, post.goflypost.com, presence.goflypost.com)
- **AI:** OpenAI API (natural language parse and publish)
- **Email/Auth:** Resend (magic link auth)
- **Marketing site:** Webflow (goflypost.com)
- **Schema standard:** schema.org Event / GeoCoordinates / PostalAddress
- **Dev tools:** Claude Code, GitHub Copilot, ChatGPT, GitHub

---

## Presence Verification

**Radius:** 0.05 km (50 meters)
- Tight enough to exclude neighbors
- Loose enough for GPS drift inside a house
- Configured via `PRESENCE_RADIUS_KM` env var

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
- `location.geo.latitude/longitude` — GeoCoordinates
- `hash.value` — SHA-256 of canonical record (immutability/verification)
- `flypost.agentEmail` — placeholder until agent claims via magic link
- `occurrences[]` — array of time windows with startDate/endDate

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

**Primary target:** Agents with listings 51+ days on market

**Email template that works:**
> "I noticed your listing at [address] has been on for [X] days with [Y] views.
> Flypost captures anonymous buyer feedback at open houses — honest reactions
> buyers won't share to an agent's face but would put in a ballot box.
> Would you be open to trying it on your next open house?"

**QR code placement pitch:**
Don't replace the sign-in sheet. Sign-in sheet captures leads.
QR code captures honest feedback. Two jobs, next to each other.

**The Zillow gap pitch:**
"Zillow tells agents their listing got 10,000 views but nothing about
who walked through the door or why they didn't make an offer."

---

## Active Pipeline (as of 2026-03-11)

- **Alexis Gallardo** (Compass) — April open house confirmed, actively referring other agents
- **Guy Reid** (Douglas Elliman) — Text sent re: 2530 Beverley Ave open house
- **Rick Edler** (Vista Sotheby's CEO) — Zoom requested, met Dec 2025, advised pivot to emotional intelligence moat
- **Will Cooper** (BHHS Utah) — Text sent, family connection
- **Neyshia Go** (Sotheby's) — Email sent, 82 DOM listing
- Megan's Marine St report sent — awaiting response

---

## Founder

**Benjamin "Bronco" Mower** — sole founder, 100% equity
- Built entirely with AI tools (Claude Code, GitHub Copilot, ChatGPT)
- Managing construction in Palisades fire rebuild while building Flypost
- Moving to Salt Lake City (family)
- YC Spring 2026 application submitted 2026-03-11
- Crunchbase: https://www.crunchbase.com/organization/flypost

---

## YC Application Key Framing

- **What does it make:** "Presence. You can't scrape it, synthesize it, or buy it from the MLS."
- **Competitors:** Curb Hero and Spacio solve lead capture. Flypost solves intelligence.
- **Why this:** Obsessed with A-frames on street corners. The behavior is entrenched — just needs an ROI layer.
- **Domain expertise:** Witnessed buyer give false positive feedback to agent's face, then honest feedback the moment she stepped outside. That scene is why Flypost exists.

---

## a16z / Investor Framing

- Physical world data primitive (a16z 2026 thesis: "interest returning to physical world")
- Vertical AI with proprietary data that compounds
- Ground truth in an era of synthetic data
- The data asset (attendance registry) grows with every check-in and cannot be replicated

---

## Repo Notes

- Repo is private — keep it private
- Main entry: `backend/src/server.js`
- Presence logic: `backend/src/routes/presence.js`
- Package: Node.js / Express, Firebase Admin, OpenAI SDK, date-fns-tz, AJV, express-rate-limit
- License: Apache-2.0
