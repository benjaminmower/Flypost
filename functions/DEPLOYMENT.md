# Weekly Feedback Digest - Deployment Checklist

This document provides a step-by-step guide to deploy and verify the weekly feedback digest Cloud Function.

## Prerequisites

- [ ] Firebase CLI installed: `npm install -g firebase-tools`
- [ ] Authenticated with Firebase: `firebase login`
- [ ] Firebase project configured: Verify `.firebaserc` has correct project ID
- [ ] Node.js 18+ installed on deployment machine

## Pre-Deployment Steps

### 1. Review Configuration Files

- [ ] `firebase.json` - Verify functions configuration is present
- [ ] `firestore.indexes.json` - Required for efficient feedback queries
- [ ] `functions/package.json` - Review dependencies and Node version

### 2. Install Dependencies

```bash
cd functions
npm install
```

Expected output: ~242 packages installed with 0 vulnerabilities

### 3. Test Locally (Optional)

Run the test scripts to verify logic:

```bash
# Test window calculation
node functions/test-window-calculation.js

# Test aggregation logic with sample data
node functions/example-digest.js
```

Expected: Both scripts should complete without errors and show correct output

### 4. Review Code

- [ ] `functions/index.js` - Main function implementation
- [ ] Verify timezone is set to `America/Los_Angeles`
- [ ] Verify schedule is `0 0 * * 1` (every Monday at 00:00)
- [ ] Confirm no PII is logged (check all console.log statements)

## Deployment Steps

### 1. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

Wait for indexes to build (may take several minutes). Check status in Firebase Console.

### 2. Deploy the Function

```bash
firebase deploy --only functions:generateWeeklyFeedbackDigest
```

Expected output:
- Function deployed successfully
- Function URL displayed (if HTTP-triggered, but ours is scheduled)
- No errors or warnings

### 3. Verify Deployment

Check Firebase Console:
- [ ] Navigate to Functions section
- [ ] Verify `generateWeeklyFeedbackDigest` is listed
- [ ] Status should be "Active" or "Healthy"
- [ ] Check configuration:
  - Memory: 512 MiB
  - Timeout: 540 seconds
  - Schedule: `0 0 * * 1`
  - Timezone: `America/Los_Angeles`

### 4. Verify Cloud Scheduler

- [ ] Open GCP Console > Cloud Scheduler
- [ ] Find job for `generateWeeklyFeedbackDigest`
- [ ] Verify schedule: `0 0 * * 1`
- [ ] Verify timezone: `America/Los_Angeles (PST/PDT)`
- [ ] Status should be "Enabled"

## Post-Deployment Verification

### 1. Check Function Logs

```bash
firebase functions:log --only generateWeeklyFeedbackDigest
```

Or view in Firebase Console > Functions > Logs

### 2. Manual Test Trigger (Optional)

**Warning:** This will generate a digest for the current prior week immediately.

Option A - Via GCP Console:
1. Navigate to Cloud Scheduler
2. Find the scheduled job
3. Click "Force Run"
4. Wait 1-2 minutes
5. Check function logs

Option B - Via Firebase Emulator (for development):
```bash
firebase emulators:start --only functions
# Note: Scheduled functions can't be directly triggered in emulator
```

### 3. Verify Output

- [ ] Check Firestore Console
- [ ] Navigate to `weeklyDigests` collection
- [ ] Verify document exists with ID in format `YYYY-MM-DD`
- [ ] Verify document structure matches schema:
  - `windowStartIso` (string)
  - `windowEndIso` (string)
  - `generatedAtIso` (string)
  - `eventDigests` (array)
- [ ] Verify no PII in stored data

### 4. Check First Production Run

Wait until the next Monday at 00:00 LA time:

- [ ] Monitor function logs on Monday morning
- [ ] Verify function executed successfully
- [ ] Check new document in `weeklyDigests` collection
- [ ] Verify data looks correct (counts, IDs, etc.)
- [ ] Check execution time (should be well under 540 seconds)

## Monitoring Setup

### 1. Set Up Alerts

Consider setting up alerts in GCP for:
- Function execution failures
- Function timeout errors
- Unusual execution duration

### 2. Regular Checks

- [ ] Weekly: Review generated digests for data quality
- [ ] Monthly: Check function logs for any warnings
- [ ] Quarterly: Review and optimize if needed

## Rollback Procedure

If issues are discovered after deployment:

```bash
# List function versions
firebase functions:list

# Delete the function
firebase functions:delete generateWeeklyFeedbackDigest

# Fix the issue in code
# ... make changes ...

# Redeploy
firebase deploy --only functions:generateWeeklyFeedbackDigest
```

## Common Issues

### Issue: Function times out
**Solution:** Increase timeout in function configuration (max 540 seconds for 2nd gen)

### Issue: "Permission denied" errors
**Solution:** Check IAM roles for Cloud Functions service account in GCP Console

### Issue: Empty digests every week
**Solution:** 
1. Verify feedback data exists in Firestore
2. Check `createdAt` field format (must be ISO UTC string)
3. Verify date range calculation is correct

### Issue: Missing event details in digest
**Solution:** 
- Event enrichment is optional - digest will still work
- Verify event documents exist in `events` collection
- Check event ID matches between collections

## Security Checklist

- [ ] No API keys or secrets in function code
- [ ] No PII logged in function logs
- [ ] Service account has minimal required permissions
- [ ] Firestore security rules prevent unauthorized access to digests

## Performance Optimization

If digests take too long to generate:

1. **Batch size tuning**: Adjust batch sizes in `batchQueryAttendance` and `batchQueryEvents`
2. **Parallel queries**: Consider using `Promise.all()` for independent queries
3. **Caching**: Cache event data if events are reused across weeks
4. **Pagination**: For very large datasets, implement pagination

## Next Steps

After successful deployment:

- [ ] Document process for accessing/forwarding digests
- [ ] Train stakeholders on digest format and interpretation
- [ ] Plan for email integration (future enhancement)
- [ ] Set up dashboard for historical digest analysis
