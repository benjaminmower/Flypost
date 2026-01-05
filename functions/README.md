# Weekly Feedback Digest - Cloud Function

## Overview

This Firebase Cloud Function generates a weekly digest of feedback data every Monday at 00:00 America/Los_Angeles timezone. The digest aggregates feedback from the prior week (Monday 00:00 LA to Monday 00:00 LA) and persists it to Firestore for manual review and forwarding.

## Collections Used

### Input Collections

1. **`feedback`** - Feedback submissions from event attendees
   - `feedbackId` (string): Unique identifier
   - `createdAt` (string): ISO UTC timestamp (e.g., "2025-12-20T05:23:18.332Z")
   - `eventId` (string): Event identifier
   - `attendanceId` (string): Reference to attendance record
   - `answers` (object): { liked, disliked, wantsSimilar }
   - `brokerageAffiliation` (string, optional): Brokerage ID
   - `occurrenceId` (string, optional): Multi-slot occurrence ID

2. **`attendance`** - Check-in records for event presence
   - `attendanceId` (string): Unique identifier
   - `eventId` (string): Event identifier
   - `occurrenceId` (string, optional): Multi-slot occurrence ID
   - `checkInTime` (string): ISO UTC timestamp
   - `buyerToken` (string): Opaque buyer identifier (not logged)
   - `presenceProof` (object): Geo/time proof of presence
   - `createdAt` (string): ISO UTC timestamp

3. **`events`** (optional enrichment) - Event details
   - `eventId` (string): Unique identifier (document ID)
   - `location.address` (object): streetAddress, city, state, postalCode
   - `offers.url` or `url` (string): External listing URL

### Output Collection

**`weeklyDigests/{YYYY-MM-DD}`** - Weekly digest documents

Document ID format: `YYYY-MM-DD` (the Monday date in LA timezone, e.g., "2026-01-05")

## Digest Schema

```json
{
  "windowStartIso": "2025-12-29T08:00:00.000Z",
  "windowEndIso": "2026-01-05T08:00:00.000Z",
  "generatedAtIso": "2026-01-05T08:01:23.456Z",
  "eventDigests": [
    {
      "eventId": "evt_abc123",
      "feedbackCount": 15,
      "uniqueBuyers": 12,
      "totalCheckIns": 18,
      "wantsSimilarCount": 10,
      "occurrenceIds": ["occ_slot1", "occ_slot2"],
      "eventAddress": "123 Main St, Santa Monica, CA",
      "listingUrl": "https://example.com/listing/123"
    }
  ]
}
```

### Field Descriptions

- **`windowStartIso`** (string): Start of the weekly window in UTC ISO format (Monday 00:00 LA converted to UTC)
- **`windowEndIso`** (string): End of the weekly window in UTC ISO format (next Monday 00:00 LA converted to UTC)
- **`generatedAtIso`** (string): Timestamp when the digest was generated
- **`eventDigests`** (array): Array of event-level aggregations, sorted by feedback count (descending)
  - **`eventId`** (string): Event identifier
  - **`feedbackCount`** (number): Total number of feedback responses for this event
  - **`uniqueBuyers`** (number): Count of unique buyers who provided feedback (derived from attendance records)
  - **`totalCheckIns`** (number): Total check-ins for this event across all attendance records
  - **`wantsSimilarCount`** (number): Count of respondents who indicated they want similar events
  - **`occurrenceIds`** (array of strings): List of occurrence IDs if the event has multiple slots/occurrences
  - **`eventAddress`** (string, optional): Formatted address string if event document is available
  - **`listingUrl`** (string, optional): External listing URL if available in event document

## Schedule

The function runs on a cron schedule:
- **Schedule**: `0 0 * * 1` (Every Monday at 00:00)
- **Timezone**: `America/Los_Angeles`
- **Memory**: 512 MiB
- **Timeout**: 540 seconds (9 minutes)

## Weekly Window Calculation

1. Determine current time in LA timezone
2. Find the start of the current week (Monday 00:00 LA)
3. Go back one week to get prior week start
4. Prior week end is the start of current week
5. Convert both boundaries to UTC ISO strings
6. Use string range queries on `createdAt` field

Example:
- If function runs on Monday 2026-01-05 00:00 LA
- Window: Monday 2025-12-29 00:00 LA to Monday 2026-01-05 00:00 LA
- UTC: "2025-12-29T08:00:00.000Z" to "2026-01-05T08:00:00.000Z"
- Document ID: "2026-01-05"

## Query Strategy

### Feedback Query
Uses Firestore string range filters on `createdAt`:
```javascript
feedback.where('createdAt', '>=', windowStartIso)
        .where('createdAt', '<', windowEndIso)
```

**Index Requirement:** A single-field ascending index on `feedback.createdAt` is required. This index supports both range operators (`>=` and `<`) on the same field. The index is defined in `firestore.indexes.json` and will be automatically created during deployment.

### Attendance Batch Query
Attendance records are fetched in batches using the `__name__` (document ID) field with the `in` operator, respecting Firestore's 10-item limit per query:
```javascript
attendance.where('__name__', 'in', [id1, id2, ..., id10])
```

### Event Enrichment
Events are fetched individually by document ID to avoid `in` operator limitations and provide more reliable results.

## Privacy & Security

**No PII is logged:**
- `buyerToken` is never logged (only used for uniqueness counting)
- Feedback `answers` text (liked/disliked) is never logged
- Organizer contact information is never logged
- Only aggregate counts and event IDs appear in logs

**What is logged:**
- Aggregate counts (feedback count, unique buyers, check-ins)
- Event IDs
- Document IDs
- Window boundaries
- Function execution status

## Deployment

### Prerequisites
1. Firebase project initialized (`firebase init`)
2. Firebase CLI installed (`npm install -g firebase-tools`)
3. Authenticated with Firebase (`firebase login`)

### Install Dependencies
```bash
cd functions
npm install
```

### Deploy the Function
```bash
# Deploy only the scheduled function
firebase deploy --only functions:generateWeeklyFeedbackDigest

# Or deploy all functions
firebase deploy --only functions
```

### Verify Deployment
```bash
# List deployed functions
firebase functions:list

# View logs
firebase functions:log
```

## Manual Testing

### Option 1: Emulator (Local Testing)
```bash
# Start Firebase emulators
firebase emulators:start

# In another terminal, trigger the function manually
# (Note: Scheduled functions can't be directly triggered in emulator)
```

### Option 2: Production Testing
```bash
# View the function in Firebase Console
# Go to: https://console.firebase.google.com/project/goflypost/functions

# Manually trigger via Cloud Functions console or CLI
# Note: This will generate a digest for the prior week immediately
```

### Option 3: Test with Custom Date
You can temporarily modify the function to test with a custom date by passing a specific date to `calculateWeeklyWindow(customDate)` for development purposes.

## Monitoring

### View Generated Digests
```bash
# Using Firebase Console
# Navigate to: Firestore Database > weeklyDigests collection

# Or query via code/CLI
```

### Check Function Logs
```bash
firebase functions:log --only generateWeeklyFeedbackDigest
```

### View Execution History
Check the Firebase Console Functions dashboard for:
- Execution count
- Error rate
- Average execution time
- Memory usage

## Manual Forwarding

Once the digest is generated, you can:
1. Access the document in Firestore Console: `weeklyDigests/{YYYY-MM-DD}`
2. Copy the `eventDigests` array
3. Format as needed for email or other notification channels
4. Send to appropriate stakeholders

Future enhancement: Add email integration to automatically send digests.

## Troubleshooting

### Function Not Running
- Check Cloud Scheduler in GCP Console
- Verify function is deployed: `firebase functions:list`
- Check IAM permissions for Cloud Scheduler

### Empty Digests
- Verify feedback data exists in the prior week window
- Check `createdAt` timestamps are in ISO UTC format
- Ensure attendance records have matching `attendanceId` values

### Missing Event Details
- Event enrichment is optional - digest will still generate without it
- Verify event documents exist in `events` collection
- Check that event IDs match between feedback and events collections

### Query Errors
- Ensure Firestore indexes exist for `feedback.createdAt`
- Check Firestore usage limits haven't been exceeded
- Verify Firebase Admin SDK is initialized correctly

## Next Steps

Potential enhancements:
1. **Email Integration**: Automatically send digest via SendGrid/Mailgun
2. **Configurable Recipients**: Store email list in Firestore config document
3. **Rich Formatting**: Generate HTML email with charts/graphs
4. **Multi-Period Support**: Daily/monthly digests in addition to weekly
5. **Filtering**: Support filtering by brokerage or event type
6. **Anomaly Detection**: Flag unusual patterns or outliers

## References

- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [date-fns-tz Documentation](https://github.com/marnusw/date-fns-tz)
