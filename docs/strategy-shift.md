# Flypost v4 Strategy Shift: Global Event Identity & Post-Visit Intelligence

## Overview
This document describes the architectural pivot from brokerage-exclusive discovery to a **global, brokerage-agnostic event identity system** with a **post-visit intelligence ledger**. This shift establishes a new economic core around presence verification and buyer sentiment, moving away from pre-visit concierge/discovery features.

## Core Principles

### 1. Global Event Identity
**Events are now globally canonical, not brokerage-scoped.**

- **Identity Format**: `<normalized-address>|<start-time-window>`
  - Example: `123mainstreet-santamonica-ca-90405|2025-01-15T14`
- **Time Window**: ISO hour bucket (YYYY-MM-DDTHH) for time-aware events, or date bucket (YYYY-MM-DD) for date-only
- **Cross-Brokerage Recognition**: Multiple brokerages can reference and update the same canonical event
- **No Brokerage in Identity**: Brokerage metadata is stored separately; it does not participate in event identity

### 2. Attendance + Feedback Ledger
**Post-visit intelligence is first-class, not embedded in events.**

#### Attendance Records
Track verified presence at events:
- `attendanceId`: Stable identifier
- `eventId`: Links to canonical event
- `buyerToken`: Opaque/pseudonymous buyer identifier (no PII)
- `checkInTime`: ISO timestamp
- `dwellBand`: Optional dwell time classification
- `presenceProof`: Evidence of presence (geo_time, QR, or combined)

#### Feedback Records
Capture sentiment linked to attendance:
- `feedbackId`: Stable identifier
- `attendanceId`: Links to attendance record
- `eventId`: Denormalized for query convenience
- `answers`: Three required fields
  - `liked`: Free-form positive feedback
  - `disliked`: Free-form negative feedback
  - `wantsSimilar`: Boolean preference signal
- `brokerageAffiliation`: Optional brokerage routing
- `createdAt`: ISO timestamp

### 3. Presence as Value Gate
**Feedback requires verified attendance within a recency window.**

- **Presence Gate**: Feedback submission requires a recent attendance record
- **Recency Threshold**: 4 hours from check-in time
- **No Gaming**: Cannot submit feedback without check-in proof
- **Privacy Preserving**: Buyer identity is pseudonymous (opaque tokens)

### 4. Brokerage Routing Post-Event
**Brokerages get insights from their affiliated feedback.**

- Feedback can include optional `brokerageAffiliation` field
- Brokerage insights endpoint aggregates by affiliation
- Routing happens AFTER the visit, not before
- No brokerage gatekeeping of event visibility

## API Endpoints

### Presence Check-In
```
POST /v1/presence/check-in

Body:
{
  "eventId": "evt_..." (optional, will match nearest if omitted),
  "lat": 34.0195,
  "lng": -118.4912,
  "buyerToken": "buyer_opaque_token_123",
  "method": "geo_time" (optional: geo_time | qr | geo_time_qr),
  "timestamp": "2025-01-15T14:30:00Z" (optional)
}

Response:
{
  "success": true,
  "attendance": {
    "attendanceId": "att_...",
    "eventId": "evt_...",
    "checkInTime": "2025-01-15T14:30:00Z",
    "matchedBy": "nearest" | "explicit"
  }
}
```

### Feedback Submission
```
POST /v1/feedback/submit

Body:
{
  "attendanceId": "att_..." (optional, can use eventId + buyerToken instead),
  "eventId": "evt_..." (required if attendanceId not provided),
  "buyerToken": "buyer_opaque_token_123" (required if attendanceId not provided),
  "answers": {
    "liked": "Beautiful kitchen, great neighborhood",
    "disliked": "Small backyard",
    "wantsSimilar": true
  },
  "brokerageAffiliation": "brokerage-abc" (optional)
}

Response:
{
  "success": true,
  "feedback": {
    "feedbackId": "fbk_...",
    "eventId": "evt_...",
    "createdAt": "2025-01-15T16:00:00Z"
  }
}

Errors:
- 404: No attendance record found
- 403: Attendance too old (must be within 4 hours)
```

### Brokerage Insights
```
GET /v1/brokerages/:brokerageId/insights

Response:
{
  "success": true,
  "brokerageId": "brokerage-abc",
  "summary": {
    "totalFeedbackRecords": 42,
    "eventsWithFeedback": 15
  },
  "byEvent": [
    {
      "eventId": "evt_...",
      "totalResponses": 8,
      "wantsSimilarCount": 6,
      "likedSnippets": ["Beautiful kitchen", "Great location"],
      "dislikedSnippets": ["Small lot"]
    }
  ],
  "recentVerbatims": [...]
}
```

## North Star Enforcement at Ingestion

**Architectural Separation: Layer 1 (Discovery) vs Layer 2 (Intelligence)**

To maintain clean architectural boundaries, the event ingestion endpoints enforce strict separation:

### Layer 1: Discovery (Events)
- **What/Where/When**: Event metadata, location, time, description
- **Ingested via**: `/v1/events/upsert` and `/api/parse-and-publish`
- **Storage**: `events` collection

### Layer 2: Intelligence (Post-Visit)
- **Who/How**: Attendance, presence proof, feedback, sentiment
- **Collected via**: `/v1/presence/check-in` and `/v1/feedback/submit`
- **Storage**: `attendance` and `feedback` collections

### Forbidden Fields
The following fields are **stripped** during event ingestion (with warning logged):
- `attendance`, `attendees`
- `buyerToken`, `presenceProof`
- `feedback`, `sentiment`
- `insights`, `brokerageAffiliation`
- Any field starting with `intelligence*`

**Rationale**: Intelligence data must be collected separately post-visit with presence verification. Embedding it in events would bypass the presence gate and compromise the economic model.

### Source Provenance
Events track their origin via `flypost.sources` array:
```json
{
  "flypost": {
    "sources": [
      {
        "sourceType": "mls",
        "sourceId": "MLS-12345",
        "addedAt": "2025-01-20T14:00:00Z"
      },
      {
        "sourceType": "scraper",
        "sourceId": "SCRAPE-789",
        "addedAt": "2025-01-20T15:00:00Z"
      }
    ]
  }
}
```

**Deduplication**: Sources are deduped by `sourceType + sourceId`. Updates from the same source refresh the timestamp.

## Legacy Features (Non-Core)

The following features are now considered **legacy** and are not part of the core economic value:

### Brokerage-Exclusive Concierge
- **Status**: Legacy
- **Location**: `/api/chat` endpoint (conditionally enabled)
- **Description**: Brokerage-scoped LLM-powered discovery chat
- **Reasoning**: Discovery is not the economic core; presence + sentiment is

### Brokerage-Scoped Event Visibility
- **Status**: Deprecated (but still supported during migration)
- **Old Behavior**: Events were scoped to brokerages via `canonicalKey`
- **New Behavior**: Events are globally visible; `brokerageId` is metadata only

## Migration Path

### For Existing Code
1. **Use `eventIdentity`** instead of `canonicalKey` for new queries
2. `canonicalKey` still computed for backward compatibility
3. Both `findEventByIdentity` and `findEventByCanonicalKey` available during transition
4. Eventually remove `canonicalKey` support

### For New Features
1. Always use `computeEventIdentity()` for event deduplication
2. Store attendance/feedback in new collections, not embedded in events
3. Use presence gates for value-gated features
4. Route via `brokerageAffiliation`, not event ownership

## Storage Collections

### Events (Modified)
- **Primary Collection**: `events`
- **Key Fields**:
  - `flypost.eventIdentity`: Global canonical identity (NEW)
  - `flypost.canonicalKey`: Legacy brokerage-scoped key (deprecated)
  - `brokerageId`: Metadata only, not part of identity

### Attendance (New)
- **Collection**: `attendance`
- **Indexes**: `eventId`, `buyerToken`, `attendanceId` (primary key)

### Feedback (New)
- **Collection**: `feedback`
- **Indexes**: `brokerageAffiliation`, `eventId`, `attendanceId`, `feedbackId` (primary key)

## Testing Strategy

### Unit Tests
- Event identity determinism and normalization
- Time window computation (hour vs date buckets)
- Edit-instead-of-create with new identity

### Integration Tests
- Cross-brokerage event deduplication
- Presence check-in creates attendance
- Feedback requires recent attendance
- Presence gate enforcement (4-hour window)
- Brokerage insights aggregation

### Acceptance Criteria
- Same event from different brokerages updates one record
- Feedback submission fails without check-in
- Feedback submission fails with old check-in (>4 hours)
- Insights endpoint correctly aggregates by brokerage affiliation

## Future Enhancements

### Not in This PR
- LLM synthesis of insights (kept intentionally basic)
- UI for check-in/feedback (API only in this PR)
- Advanced presence verification (QR codes, geofencing)
- Dwell time tracking
- Buyer preference profiles
- Cross-event similarity matching

## Summary

This shift establishes Flypost v4's new architectural truth:
1. **Events are global**, not brokerage-owned
2. **Intelligence lives in ledgers**, not embedded in events
3. **Presence gates value**, feedback requires check-in
4. **Brokerages route post-event**, via affiliation not ownership
5. **Discovery is legacy**, intelligence is core
