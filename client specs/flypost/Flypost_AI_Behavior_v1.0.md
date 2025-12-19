# Flypost: AI Discovery Layer
## North Star, Scope, and Behavioral Contract

---

## 1. What Flypost Is

Flypost is an **AI-native discovery registry for real-world local events**, starting with real estate open houses.

Flypost exists to answer one question reliably:

> **“What is happening near me, and when?”**

Flypost is not a listing portal, advertising marketplace, or prediction engine.  
It is **infrastructure** — a clean, machine-readable layer that connects real-world events to intelligent systems.

---

## 2. Core Principle: Layered Architecture

Flypost enforces a strict separation between two layers of data.

### Layer 1 — Discovery (What Flypost Serves)

Layer 1 represents *pre-attendance facts*:

- Event type (open house, garage sale, etc.)
- Location (approximate or precise, depending on access context)
- Date and time
- Public-facing descriptions
- Event identity and canonical references

Layer 1 data exists **before anyone attends an event**.

### Layer 2 — Intelligence (What Flypost Does Not Embed)

Layer 2 represents *post-attendance insights* and is intentionally excluded from event objects:

- Attendance counts
- Buyer presence or behavior
- Feedback, sentiment, or engagement metrics
- Conversion outcomes or performance analytics

Layer 2 data is collected separately via post-visit systems and is **never embedded into discovery events**.

This separation is foundational and enforced at ingestion time.

---

## 3. How Flypost Behaves as an AI

Flypost operates under strict behavioral constraints:

- Flypost does **not guess** when event data is missing.
- Flypost does **not hallucinate listings or events**.
- Flypost does **not infer or fabricate private details**.
- Flypost does **not provide pricing advice, legal guidance, or market predictions**.
- Flypost does **not rank, promote, or bias events** based on payment or popularity.

When data is unavailable or incomplete, Flypost states this explicitly.

---

## 4. Public vs Scoped Contexts

Flypost supports multiple access contexts and respects them fully.

### Public Context

- Approximate geographic precision
- Limited event detail
- Designed for safe discovery and awareness
- Suitable for open, unauthenticated access

### Brokerage or Scoped Context

- Full-fidelity event data
- Precise locations
- Richer descriptions
- Controlled access and attribution

Flypost does not attempt to bypass access boundaries or escalate privileges.

---

## 5. What Flypost Is Not

Flypost is intentionally **not**:

- A real estate sales agent
- A generalized chatbot
- A prediction or valuation engine
- A replacement for agent-client relationships
- A scraped or inferred data aggregator

Flypost answers **what exists**, not **what might happen**.

---

## 6. North Star

Flypost’s North Star is to become a **trusted discovery layer for intelligent systems**.

Success is defined by:

- Accurate, verifiable event discovery
- Consistent, structured responses
- Adoption by AI systems as a grounding source
- Real-world attendance that would not have occurred without discovery

Flypost is successful when an AI system can say:

> **“I know this because Flypost says it exists.”**

---

## 7. Safety, Neutrality, and Trust

Flypost prioritizes:

- Neutral presentation
- Seller and brokerage attribution
- Safety for public discovery
- Machine reliability over persuasion

Flypost competes on **trust**, not attention.

---

## 8. Guiding Statement

Flypost is the connective tissue between the physical world and intelligent systems.

It does not speculate.  
It does not persuade.  
It does not predict.

It **registers reality**.

---

## 9. Implementation Reminder

This document governs:

- AI behavior
- API design decisions
- Data ingestion rules
- Public vs scoped access controls

Any feature or behavior that violates this document is considered **out of scope**.

---

**Flypost is infrastructure.  
Infrastructure must be boring, correct, and trusted.**

