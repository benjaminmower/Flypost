# Firebase Console Configuration (not in repo)

Project: **goflypost** (`.firebaserc` default). Everything below lives only in the Firebase
Console / Google Cloud Console and must be manually re-created on rebuild — it is not represented
in any file in this repository.

**Status: NOT YET VERIFIED.** Firebase CLI was not authenticated as the project owner when this was
drafted (see RESTART.md auth note). This file lists *what to go check and record*, not confirmed
current values. Log into https://console.firebase.google.com/project/goflypost and fill in each
section below, or run the CLI commands where given.

## 1. Firebase Auth — authorized domains

Console path: **Authentication → Settings → Authorized domains**

Must include (at minimum, inferred from which frontends use Firebase Auth per `SETUP_FRONTENDS.md`):
- `post.goflypost.com` (magic-link sign-in for publisher flow)
- `app.goflypost.com` (magic-link sign-in for PWA — has `/finishSignIn` redirect route)
- `presence.goflypost.com` (uses Firebase Bearer token per `MANIFEST_MAINTENANCE.md`)
- `localhost` (dev)
- Default `goflypost.firebaseapp.com` / `goflypost.web.app` (auto-added by Firebase)

Record actual list here once checked:
```
<UNKNOWN — paste from console>
```

## 2. Firebase Auth — sign-in method

Console path: **Authentication → Sign-in method**

- **Email link (passwordless) sign-in**: must be **enabled** — this is the "magic link" auth
  method referenced throughout `CLAUDE.md` and `SETUP_FRONTENDS.md`.
- Action URL / dynamic link domain settings — record whatever custom action URL config exists
  (email templates reference `/finishSignIn` on `post.goflypost.com` and `app.goflypost.com`).
- Email templates: **Authentication → Templates → Email address sign-in** — check for
  custom sender name / from-address / redirect URL customization.

## 3. Firebase project settings

Console path: **Project settings → General**

Record (all public/non-secret, needed to reconstruct `VITE_FIREBASE_*` env vars):
```
Project ID:        goflypost
Project number:    <UNKNOWN — paste from console>
Web API Key:       <UNKNOWN — paste from console>  (this is the VITE_FIREBASE_API_KEY)
Auth domain:        <UNKNOWN>.firebaseapp.com
App ID(s):          <UNKNOWN — one per registered web app>
Measurement ID:      <UNKNOWN — if Analytics enabled>
```

There may be multiple registered "Web apps" under one Firebase project (one per frontend site, or
shared) — check **Project settings → Your apps** and record each App ID and its nickname.

## 4. Firestore — VERIFIED LIVE

```
Mode:      FIRESTORE_NATIVE (confirmed via `gcloud firestore databases describe`)
Location:  nam5 (multi-region US — NOT us-west1, note for rebuild since this can't be changed later)
Created:   2025-06-10T17:27:00Z
PITR:      Point-in-time recovery ENABLED
```

**Security rules — retrieved and saved to `infra/firestore.rules`.** No CLI command exists for
this (`firebase firestore:rules:get` doesn't exist), so it was pulled via the Rules Management API
directly (see comment header in that file for the exact command). This is the single most
important recovery in this whole archive since it existed nowhere in version control.

**⚠️ Rules content is stricter than you might expect** — worth reading before rebuilding:
- `events/{eventId}`: public read, **all writes denied at the rules layer** — writes only happen
  via the backend's Admin SDK, which bypasses rules entirely. This matches the architecture (backend
  writes events, not clients).
- `api_keys`, `webhooks`, `event_submissions`: fully locked to clients (read AND write denied).
- Everything else: fallback deny-all.
- Notably: **no explicit rule for `attendance`, `feedback`, or `weeklyDigests`** — these fall
  through to the fallback deny-all, meaning **all client access to those collections is denied**,
  consistent with presence/feedback being written via the backend (Admin SDK) rather than directly
  from `presence.goflypost.com`'s browser JS. Confirm this matches your understanding of the
  presence-checkin flow before rebuilding — if the frontend ever expected direct Firestore writes
  from the client for these collections, it would have been failing silently against these rules.

## 5. Cloud Storage (Firebase Storage) — VERIFIED LIVE, ⚠️ MISMATCH FOUND

Two Storage rulesets exist for this project (found via the same Rules Management API query):

| Bucket / release | Ruleset created | Live rules |
|---|---|---|
| `goflypost.firebasestorage.app` (the default bucket — matches what `firebase/storage.rules` in the repo targets) | 2025-06-18 | `allow read, write: if false;` — **deny everything** |
| `cdn.goflypost.com` (a **second, custom-domain-backed bucket not referenced anywhere in the repo**) | 2025-12-11 | `allow read, write: if false;` — **deny everything** |

**⚠️ This does not match the repo.** `firebase/storage.rules` (committed, referenced by
`firebase.json`) specifies public read + owner-write for `/flyers/{userId}/{file}` — but the
*live* rules on the bucket it targets deny everything unconditionally. Either:
1. `firebase deploy --only storage` was never run after that rules file was written (most likely), or
2. Something else deployed a locked-down ruleset afterward and the repo file went stale.

**Practical implication: flyer image uploads/reads may currently be broken in production** if
anything depends on the permissive rules in the repo file. This wasn't diagnosed further (out of
scope — this is an archive task, not a fix), but flag it before you consider Storage "captured
and correct" — the repo file is aspirational, not what's actually enforced.

**`cdn.goflypost.com`** is a second bucket/domain with its own ruleset, not mentioned in
`firebase.json`, `CLAUDE.md`, or any doc scanned. Investigate what it's for (possibly a CDN-fronted
public asset bucket set up separately) before assuming Storage config is fully represented by the
one file in this repo.

Get exact bucket names and CORS config once you're back in for a real rebuild:
```bash
firebase apps:list   # or check Project Settings > Your apps in console for bucket refs
gsutil cors get gs://goflypost.firebasestorage.app
gsutil cors get gs://cdn.goflypost.com   # if this is a real GCS bucket and not just a custom domain mapping
```

## 6. Firebase Functions (separate from Cloud Run)

- Deployed functions: `generateWeeklyFeedbackDigest`, `generateWeeklyFeedbackDigestHttp`,
  `generatePerEventFeedbackDigest`, `generatePerEventFeedbackDigestHttp` (`functions/index.js`).
  Region: `us-central1` (per `gcloud config list` — `functions.region`).
- These rely on 3 Secret Manager secrets — see `infra/cloudrun-env.md` — plus Cloud Scheduler jobs
  that Firebase creates automatically for `onSchedule` functions. See RESTART.md for the
  regeneration steps and scheduler verification.
- Verify current deployed list:
  ```bash
  firebase functions:list
  ```

## 7. Firebase Hosting

`firebase.json` declares a `hosting` block serving `public/` — this is **separate from the Netlify
sites** and may be an older/parallel deployment target. Check whether
`goflypost.web.app` / `goflypost.firebaseapp.com` is actually in use for anything, or whether it's
vestigial from before the Netlify multi-site split:
```bash
firebase hosting:sites:list
```

## Verification checklist

- [ ] Authorized domains list confirmed and pasted in §1
- [ ] Email link sign-in confirmed enabled, §2
- [ ] Web API key / App IDs pasted in §3
- [ ] Firestore location + mode confirmed, §4
- [ ] **Live Firestore rules copied into `infra/firestore.rules`** — §4, highest priority gap
- [ ] Storage bucket name + CORS recorded, §5
- [ ] Functions list confirmed matches `functions/index.js`, §6
- [ ] Firebase Hosting checked for stale/active use, §7
