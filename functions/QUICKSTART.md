# Weekly Feedback Digest - Quick Reference

## What is the Weekly Digest?

An automated weekly report that aggregates feedback from event attendees for the prior week (Monday 00:00 to Monday 00:00 LA time).

## Where to Find Digests

**Location:** Firestore > `weeklyDigests` collection

**Document ID Format:** `YYYY-MM-DD` (the Monday date in LA timezone)
- Example: `2026-01-05` represents the digest for Dec 29, 2025 - Jan 5, 2026

## Digest Structure

```json
{
  "windowStartIso": "2025-12-29T08:00:00.000Z",  // Start of week (UTC)
  "windowEndIso": "2026-01-05T08:00:00.000Z",    // End of week (UTC)
  "generatedAtIso": "2026-01-05T08:01:23.456Z",  // When digest was created
  "eventDigests": [ /* array of event summaries */ ]
}
```

## Event Digest Fields

Each event in the `eventDigests` array contains:

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | string | Unique event identifier |
| `feedbackCount` | number | Total feedback responses received |
| `uniqueBuyers` | number | Number of unique buyers who gave feedback |
| `totalCheckIns` | number | Total check-ins for this event |
| `wantsSimilarCount` | number | Count of people who want similar events |
| `occurrenceIds` | array | Multi-slot occurrence IDs (if applicable) |
| `eventAddress` | string (optional) | Formatted address if available |
| `listingUrl` | string (optional) | External listing URL if available |

## Key Metrics Explained

### feedbackCount vs uniqueBuyers vs totalCheckIns

- **feedbackCount**: Number of feedback submissions (one per attendee)
- **uniqueBuyers**: Number of distinct buyers who gave feedback (de-duplicated by buyerToken)
- **totalCheckIns**: Total attendance records, including those without feedback

**Example:**
```json
{
  "feedbackCount": 8,      // 8 feedback submissions
  "uniqueBuyers": 7,       // 7 unique buyers (one came twice)
  "totalCheckIns": 12      // 12 total check-ins (4 didn't give feedback)
}
```

### wantsSimilarCount

Indicates interest level. Higher values suggest the event was well-received.

**Calculation:** Count of feedback where `answers.wantsSimilar === true`

### occurrenceIds

For multi-slot events (same location, different times):
- Empty array `[]`: Single occurrence event
- Multiple IDs: Event had multiple time slots

## Interpreting Results

### High Engagement Event
```json
{
  "eventId": "evt_123",
  "feedbackCount": 15,
  "uniqueBuyers": 15,
  "totalCheckIns": 18,
  "wantsSimilarCount": 12
}
```
- 15 feedback responses from 15 unique buyers
- 18 total check-ins (3 people didn't give feedback)
- 80% (12/15) want similar events → High interest

### Low Engagement Event
```json
{
  "eventId": "evt_456",
  "feedbackCount": 2,
  "uniqueBuyers": 2,
  "totalCheckIns": 10,
  "wantsSimilarCount": 0
}
```
- Only 2 feedback responses out of 10 check-ins
- 20% feedback rate
- 0% want similar events → Low interest or poor experience

### Multi-Slot Event
```json
{
  "eventId": "evt_789",
  "feedbackCount": 25,
  "uniqueBuyers": 25,
  "totalCheckIns": 30,
  "wantsSimilarCount": 20,
  "occurrenceIds": ["occ_sat_2pm", "occ_sun_11am", "occ_sun_2pm"]
}
```
- Event had 3 different time slots
- 25 feedback submissions across all slots
- Strong interest (80% want similar)

## Using the Digest

### Weekly Review Process

1. **Access the digest**: Open Firestore Console > `weeklyDigests/{date}`
2. **Sort by engagement**: Events are already sorted by `feedbackCount` (high to low)
3. **Identify top performers**: Look for high `wantsSimilarCount` ratios
4. **Flag low engagement**: Events with low feedback rates may need follow-up
5. **Review addresses**: Use `eventAddress` to identify locations
6. **Check listings**: Use `listingUrl` to view full property details

### Exporting for Analysis

**Firebase Console:**
1. Navigate to the digest document
2. Copy the JSON
3. Paste into spreadsheet or analysis tool

**Using Firebase CLI:**
```bash
# Export specific digest
firebase firestore:get weeklyDigests/2026-01-05

# Export all digests
firebase firestore:export --collection-ids weeklyDigests
```

### Forwarding to Stakeholders

1. Copy the digest JSON from Firestore Console
2. Format as needed (email, Slack, dashboard)
3. Highlight key metrics:
   - Total events with feedback
   - Top 3 events by engagement
   - Events with high `wantsSimilarCount`
   - Low-engagement events needing attention

## Example Email Format

```
Weekly Feedback Digest: Jan 5, 2026
Coverage: Dec 29, 2025 - Jan 5, 2026

Summary:
- 15 events received feedback
- 127 total feedback responses
- 92% average satisfaction rate

Top Performers:
1. 123 Main St, Santa Monica - 15 responses, 80% want similar
2. 456 Oak Ave, Los Angeles - 12 responses, 75% want similar
3. 789 Pine St, Venice - 10 responses, 90% want similar

Needs Attention:
- 321 Elm St, Culver City - 2 responses, 0% want similar
```

## Troubleshooting

### Empty Digest (no events)
- No feedback was submitted during the week
- Check that feedback collection has data
- Verify `createdAt` timestamps are in ISO UTC format

### Missing Event Details
- Event enrichment is optional
- Event document may not exist in `events` collection
- Event ID in feedback may not match event document ID

### Duplicate Events
- Same event should only appear once
- If duplicates appear, check for inconsistent event IDs in feedback

## Privacy & Security

**What's included:**
- Aggregate counts only
- Event IDs and addresses
- Listing URLs

**What's NOT included:**
- Buyer tokens (opaque identifiers never exposed)
- Feedback text (liked/disliked answers)
- Organizer contact information
- Individual buyer information

All digests contain only aggregate statistics suitable for business intelligence.

## Future Enhancements

Planned improvements:
- Automated email delivery
- Rich HTML formatting
- Trend analysis (week-over-week)
- Anomaly detection
- Configurable recipient lists
- Dashboard visualization

## Questions?

For technical issues or feature requests, contact the development team or file an issue in the repository.
