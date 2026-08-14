# Flypost — Cold Start Restart Runbook

Written 2026-08-14 while mothballing Flypost, as a complete rebuild guide assuming you remember
nothing. All facts below were **verified live** against GCP/Firebase/DNS on that date (not just
inferred from the repo) unless marked otherwise. Cross-reference: `infra/proxyv4.yaml`,
`infra/flypostv4.yaml` (secrets redacted), `infra/cloudrun-env.md`, `infra/dns.md`,
`infra/firebase-config.md`, `infra/firestore.indexes.json`.

## 0. Accounts you need access to

- **GCP project**: `goflypost` (project number `498798854474`), owned by `bronco@goflypost.com`
  (has `roles/owner`).
- **Firebase project**: same project, `goflypost`.
- **Namecheap**: registrar for `goflypost.com` (registered 2023-03-22, expires 2028-03-22 — no
  urgency, but confirm which email/login owns the account).
- **Netlify**: 5 separate sites (see §4). Confirm which Netlify team/account owns them.
- **GitHub**: repo `goflypost/v4` — all Cloud Build triggers fire on push to `main` in this repo.
- **OpenAI**: platform.openai.com account that issued the current `OPENAI_API_KEY`.
- **Google Maps Platform**: for `GEOCODER_API_KEY` (Geocoding API).
- **Resend.com**: for the digest-email `RESEND_API_KEY`.
- **Anthropic**: for `scripts/ingest/`'s `ANTHROPIC_API_KEY`, if you revive the ingest agent.

## 1. Rebuild order (dependencies first)

### 1a. GCP project + APIs

If starting a genuinely new GCP project (not reusing `goflypost`), enable: Cloud Run, Cloud Build,
Artifact Registry, Firestore, Cloud Scheduler, Secret Manager, Cloud Functions, IAM.

### 1b. Service accounts + IAM

Live IAM bindings on `goflypost` as of this export (`gcloud projects get-iam-policy goflypost`):

| Service account | Roles | Purpose |
|---|---|---|
| `flypost-proxy-service-account@goflypost.iam.gserviceaccount.com` | `logging.logWriter`, `run.invoker`, `storage.admin` | Runtime identity for the `proxyv4` Cloud Run service |
| `cloud-build-deployer@goflypost.iam.gserviceaccount.com` | `artifactregistry.writer`, `iam.serviceAccountUser`, `logging.logWriter`, `run.admin`, `storage.admin` | Build/deploy identity used by the `proxyv4`, `flypost-concierge`, and `proxy-and-backend` Cloud Build triggers |
| `498798854474-compute@developer.gserviceaccount.com` | (default compute SA — broad) | Runtime identity for `flypostv4` AND build identity for the `flypostv4`/`hirenear` triggers. **Note**: this is GCP's default SA, not scoped like the others — worth replacing with a dedicated SA if rebuilding cleanly. |
| `firebase-adminsdk-fbsvc@goflypost.iam.gserviceaccount.com` | `firebase.sdkAdminServiceAgent`, `firebaseappcheck.admin`, `firebaseauth.admin`, `iam.serviceAccountTokenCreator`, `storage.admin` | Firebase Admin SDK (used by Cloud Functions, and this is the identity `firebase-admin` assumes when Application Default Credentials resolve on Firebase infra) |
| `secret-manager@goflypost.iam.gserviceaccount.com` | `secretmanager.admin` | **Purpose not documented anywhere in the repo.** Investigate before recreating — may be vestigial. |
| `github-actions-deployer@goflypost.iam.gserviceaccount.com` | `firebasehosting.admin` | GitHub Actions → Firebase Hosting deploy (no workflow file found in this repo scan — check `.github/workflows/` if it exists, or this may be orphaned) |
| `github-firebase-deploy@goflypost.iam.gserviceaccount.com` | `firebasehosting.admin`, `firebasestorage.admin` | Same as above — two similarly-named SAs exist; reconcile which is actually wired to a GitHub Action before recreating both |
| `github-action-1041044233@goflypost.iam.gserviceaccount.com` | `cloudfunctions.developer`, `firebaseauth.admin`, `firebasehosting.admin`, `iam.serviceAccountUser`, `run.viewer`, `serviceusage.apiKeysViewer`, `serviceusage.serviceUsageConsumer` | Auto-generated GitHub Actions identity (numeric suffix pattern) — likely tied to a Workload Identity Federation pool; check `roles/iam.workloadIdentityPoolAdmin` config under `bronco@goflypost.com` for the pool definition |
| `goflypost@appspot.gserviceaccount.com` | (App Engine default) | Present but not confirmed in active use by anything in this repo |

**No repo file declares any of this** — it all lives in GCP IAM only. If rebuilding in a fresh
project, recreate at minimum: a dedicated proxy runtime SA (`run.invoker`, `logging.logWriter`,
`storage.admin` if the proxy touches Storage directly — verify it still needs `storage.admin`,
that's a broad grant) and a dedicated build-deploy SA (`run.admin`, `artifactregistry.writer`,
`iam.serviceAccountUser`, `logging.logWriter`).

### 1c. Artifact Registry

```bash
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker --location=us-west1
```
(Confirmed live repo: `cloud-run-source-deploy`, Docker format, `us-west1`.)

### 1d. Firestore

```bash
gcloud firestore databases create --location=<pick a region> --type=firestore-native
```
Live database: `projects/goflypost/databases/(default)`, mode Native (confirmed via
`firebase firestore:databases:list`). **Location was not re-confirmed in this pass — check the
Firebase Console before recreating, since location can't be changed after creation.**

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```
using `infra/firestore.indexes.json` — this is the **live, verified export** (5 indexes: 3 on
`events`, 1 each on `api_keys` and `webhooks`; separately, `functions/`'s digest queries need
single-field ascending indexes on `feedback.createdAt` and `attendance.createdAt`, which Firestore
auto-creates on first query if missing — the repo's checked-in `firestore.indexes.json` only had
these 2, and was missing the other 5 that exist live. **`infra/firestore.indexes.json` supersedes
the repo-root copy — treat the repo-root file as stale.**

**Firestore security rules — CAPTURED.** Retrieved live via the Firebase Rules Management API
(no CLI command exists for this) and saved to `infra/firestore.rules` — see that file's header
comment for the exact retrieval command if you need to re-pull it before this project is deleted.
Deploy on rebuild with:
```bash
firebase deploy --only firestore:rules
```
Read `infra/firebase-config.md` §4 before assuming this is a drop-in — the live rules deny all
client access to `attendance`/`feedback`/`weeklyDigests` (no explicit rule = fallback deny),
meaning those collections are backend-Admin-SDK-only. Confirm this matches your mental model of
the presence-checkin write path before relying on it.

### 1e. Firebase Storage — ⚠️ live rules deny everything, repo file is stale

Repo has `firebase/storage.rules` (governs `/flyers/{userId}/{file}` — public read, owner write).
**The live ruleset on the actual `goflypost.firebasestorage.app` bucket is `allow read, write: if
false` for everything** — a full mismatch. See `infra/firebase-config.md` §5 for detail. Before
redeploying storage rules on rebuild, decide which behavior you actually want (the permissive repo
file, assuming it was ever correct, or the locked-down live state, which may have been intentional
or may be an accidental regression) — don't blindly `firebase deploy --only storage` without
reading both first.

There's also a **second bucket/domain, `cdn.goflypost.com`**, with its own (also deny-all) ruleset,
not referenced anywhere in the repo — investigate its purpose before rebuild.

```bash
firebase deploy --only storage   # only after deciding which rules content is correct
```
Confirm bucket name(s) in Firebase Console → Storage — two candidates found live:
`goflypost.firebasestorage.app` and `cdn.goflypost.com`.

### 1f. Firebase Auth

Manually reconfigure in Console (not exportable via CLI):
- Enable **Email link (passwordless) sign-in** under Authentication → Sign-in method.
- Add authorized domains: `post.goflypost.com`, `app.goflypost.com`, `presence.goflypost.com`,
  plus `localhost` for dev. See `infra/firebase-config.md` §1 for the checklist — this needs
  console verification, not automatable.
- Re-register web apps under Project Settings → Your apps to get fresh `VITE_FIREBASE_*` values.

### 1g. Secret Manager

```bash
firebase functions:secrets:set DIGEST_TRIGGER_TOKEN   # openssl rand -base64 32
firebase functions:secrets:set RESEND_API_KEY          # from resend.com dashboard
firebase functions:secrets:set DIGEST_RECIPIENTS       # comma-separated emails
```

### 1h. Deploy Cloud Run services

**flypostv4 (backend) first** — proxyv4 depends on its URL at deploy time.
```bash
cd backend
gcloud builds submit --config cloudbuild.yaml .
# or trigger via the Cloud Build trigger once recreated (see §1j)
```
Then set its env vars (none of this is in `cloudbuild.yaml` — set manually):
```bash
gcloud run services update flypostv4 --region us-west1 \
  --set-env-vars "FRONTEND_URL=https://app.goflypost.com,https://ask.goflypost.com,NODE_ENV=production,GOOGLE_CLOUD_PROJECT=goflypost,ENABLE_CONCIERGE=true,GEOCODER_PROVIDER=google,GEOCODER_CACHE_TTL_SECONDS=86400" \
  --set-secrets "OPENAI_API_KEY=<secret-name>:latest,GEOCODER_API_KEY=<secret-name>:latest"
```
(Consider moving `OPENAI_API_KEY`/`GEOCODER_API_KEY` into Secret Manager + `--set-secrets` on
rebuild, rather than plaintext `--set-env-vars` as they currently are — plaintext env vars are
readable by anyone with `run.viewer` on the service, which is a wider set than Secret Manager IAM.)

**Then proxyv4:**
```bash
cd proxy
gcloud builds submit --config cloudbuild.yaml .
```
`proxy/cloudbuild.yaml` auto-derives `BACKEND_URL` from the live `flypostv4` URL and sets
`FRONTEND_ORIGIN`, `PROXY_USE_ID_TOKEN`, `FIREBASE_PROJECT_ID` — no manual env var step needed here
UNLESS you want to re-enable the write-token/edge-key gate (see finding in `cloudrun-env.md`):
```bash
gcloud run services update proxyv4 --region us-west1 \
  --set-env-vars "EDGE_ENFORCE=true" \
  --set-secrets "EDGE_SHARED_KEY=...,FLYPOST_WRITE_TOKEN=...,VISTA_WRITE_TOKEN=...,BHHS_UTAH_WRITE_TOKEN=...,COMPASS_WRITE_TOKEN=..."
```
Regenerate all of these with `openssl rand -hex 32` — the old values (if you had them) are gone;
they were never in this repo or its build config.

### 1i. Deploy Firebase Functions

```bash
cd functions
npm install
firebase deploy --only functions
```
This deploys `generateWeeklyFeedbackDigest`, `generateWeeklyFeedbackDigestHttp`,
`generatePerEventFeedbackDigest`, `generatePerEventFeedbackDigestHttp` and auto-creates their Cloud
Scheduler jobs. Verify:
```bash
gcloud scheduler jobs list --location us-central1
```
Live confirmed jobs (both `ENABLED`, schedule `0 0 * * 1`, `America/Los_Angeles`):
`firebase-schedule-generateWeeklyFeedbackDigest-us-central1`,
`firebase-schedule-generatePerEventFeedbackDigest-us-central1`.

### 1j. Recreate Cloud Build triggers

None of these exist as files in the repo (no `.github/workflows/` triggers found) — they were
created via Console/`gcloud builds triggers create` and connected to GitHub. Live triggers, all on
`goflypost/v4` repo, branch `^main$`, all via the GitHub App connection (not a webhook secret you
need to manage — reconnect via **Cloud Build → Triggers → Connect Repository** in Console):

| Trigger name | Config source | Service account | Deploys |
|---|---|---|---|
| `proxyv4` | Trigger-defined build steps (Dockerfile-based, in `proxy/`) | `cloud-build-deployer` | `proxyv4` |
| `flypostv4` | Trigger-defined build steps (Dockerfile-based, in `backend/`) | `498798854474-compute@developer` | `flypostv4` |
| `proxy-and-backend` | `cloudbuild.yaml` (repo root) | `cloud-build-deployer` | backend only, per current root `cloudbuild.yaml` content — **name is misleading, it doesn't touch the proxy** |
| `flypost-concierge` | Trigger-defined build steps | `cloud-build-deployer` | `flypost-concierge` (superseded/orphaned service — see below, low priority to recreate) |

For `proxyv4` and `flypostv4`, the actual build steps are almost certainly better sourced from
`proxy/cloudbuild.yaml` and `backend/cloudbuild.yaml` respectively (both exist in-repo and match
what the services are doing) rather than reconstructed from trigger JSON — **point new triggers at
those files via `--build-config` rather than re-entering inline steps.**

```bash
gcloud builds triggers create github \
  --repo-name=v4 --repo-owner=goflypost --branch-pattern="^main$" \
  --build-config=proxy/cloudbuild.yaml --name=proxyv4

gcloud builds triggers create github \
  --repo-name=v4 --repo-owner=goflypost --branch-pattern="^main$" \
  --build-config=backend/cloudbuild.yaml --name=flypostv4
```

### 1k. DNS (Namecheap)

See `infra/dns.md` for full detail. Summary of records to recreate:

| Host | Type | Value |
|---|---|---|
| `@` (root) | (whatever Netlify's apex instructions say at setup time) | → Netlify |
| `app` | CNAME | `flypost.netlify.app` |
| `post` | CNAME | `flypost-post.netlify.app` |
| `ask` | CNAME | `flypost-ask.netlify.app` |
| `presence` | CNAME | `presence-flypost.netlify.app` |
| `api` | CNAME | `ghs.googlehosted.com` (after running `gcloud beta run domain-mappings create --service proxyv4 --domain api.goflypost.com --region us-west1`) |

### 1l. Netlify sites

5 sites, each connected to `goflypost/v4` GitHub repo with a different `base` directory:

| Site (domain) | Repo dir | Build cmd | Publish dir |
|---|---|---|---|
| `goflypost.com` | `frontdoor_netlify/` | none (static) | `frontdoor_netlify/` |
| `app.goflypost.com` | `frontend_app/` | `npm install && npm run build` | `dist` |
| `ask.goflypost.com` | `frontend_ask/` | `npm install && npm run build` | `dist` |
| `post.goflypost.com` | `frontend_post/` | `npm install && npm run build` | `dist` |
| `presence.goflypost.com` | `frontend_presence/` | `npm install && npm run build` | `dist` |

Set `VITE_*` env vars per site (values from Firebase Console, §1f) in Netlify's Site configuration
→ Environment variables. Connect custom domain per site, which triggers Netlify's own TLS
provisioning once the CNAME (§1k) resolves.

## 2. Things found during this export that don't fit cleanly anywhere above

- **`flypost-concierge`** — a live Cloud Run service, builds from the same `v4` repo, has a
  (currently orphaned — DNS doesn't point at it) Cloud Run domain mapping to `ask.goflypost.com`.
  Not referenced in any committed doc or `CLAUDE.md`. Best guess: an earlier architecture where
  the concierge chat ran as its own service, later folded into `flypostv4` behind the
  `ENABLE_CONCIERGE` flag, and never torn down. **Not being treated as critical infra per your
  direction — but if you do a teardown pass, this is a real, running, billable Cloud Run service
  and its now-dead domain mapping, both safe to delete after confirming zero traffic in Cloud
  Run's request logs.**
- **Two nearly-identical GitHub Actions service accounts** (`github-actions-deployer` and
  `github-firebase-deploy`, both with `firebasehosting.admin`) plus a third auto-generated one
  (`github-action-1041044233`). No `.github/workflows/` directory was found in this repo during
  the scan, so it's unclear which (if any) of these three is still wired to an active GitHub
  Action. If reviving CI, check GitHub repo Settings → Actions, and GCP's Workload Identity
  Federation pools (`roles/iam.workloadIdentityPoolAdmin` is granted to `bronco@goflypost.com`,
  implying a pool exists) before assuming any of these three are needed.
- **`secret-manager@goflypost.iam.gserviceaccount.com`** — has `roles/secretmanager.admin`, not
  referenced by name anywhere in the repo. Purpose unknown; investigate before recreating.
- **Explicitly out of scope for this archive** (per your direction): Cloud Run services
  `hirenear`, `renu-backend`, `v3-01` and their build triggers — these are other apps sharing the
  `goflypost` GCP project, unrelated to Flypost.
- **`credentials.json` / `token.json`** at repo root are gitignored and contain a live Google OAuth
  client secret + Gmail refresh token (scope: `gmail.compose`). Unrelated to Flypost's cloud infra
  — looks like a personal utility script's credentials. Not exported here (correctly gitignored),
  but noted so future-you knows these exist locally and would need separate handling (rotate the
  OAuth client / revoke the refresh token at https://myaccount.google.com/permissions if this
  machine is being wiped).
- **Root `cloudbuild.yaml` vs `backend/cloudbuild.yaml`** — near-duplicates. The root one has no
  hardcoded `goflypost` project references removed (uses `goflypost` literally rather than
  `$PROJECT_ID` in the image tag), while `backend/cloudbuild.yaml` and `proxy/cloudbuild.yaml` are
  more portable. If rebuilding under a different GCP project ID, the root `cloudbuild.yaml` (used
  by the `proxy-and-backend` trigger) needs manual editing.
- **`GEOCODER_PROVIDER=google`** is live on `flypostv4`, but `.env.example` documents the default
  as `nominatim` (free, no key needed). If cost is a concern on rebuild, `nominatim` is a viable
  fallback that removes the `GEOCODER_API_KEY` dependency entirely.

## 3. Verification checklist post-rebuild

- [ ] `curl https://api.goflypost.com/v1/...` returns expected response (proxy → backend chain works)
- [ ] Magic-link sign-in completes end-to-end on `post.goflypost.com` and `app.goflypost.com`
- [ ] A presence check-in succeeds within 100m radius, fails outside it (`PRESENCE_RADIUS_KM`)
- [ ] `firebase functions:list` shows all 4 digest functions, Cloud Scheduler shows both jobs `ENABLED`
- [ ] Firestore rules re-applied from Console copy (§1d) — test that unauthenticated writes are
      actually rejected, since this couldn't be verified from repo state alone
- [ ] All 5 Netlify sites resolve on their custom domains with valid TLS
- [ ] `infra/firestore.indexes.json` indexes show `READY` state in Firebase Console (not `BUILDING`)

## 4. What this archive could NOT capture

- Whatever is actually wired in GitHub Actions (no workflow files in repo to inspect)
- Netlify env var values (Netlify CLI not authed during this pass)
- Definitive purpose of `secret-manager` SA, the two/three GitHub deploy SAs, and the
  `cdn.goflypost.com` bucket
- Firebase Functions secret *values* (`DIGEST_TRIGGER_TOKEN`, `RESEND_API_KEY`,
  `DIGEST_RECIPIENTS`) — names/purpose captured, values not fetched
- Root cause of the Storage rules mismatch (repo file vs. live deny-all) — flagged, not diagnosed

Everything else — Cloud Run configs, env var names/sources, Firestore indexes AND rules, Storage
rules (even though they don't match repo), DNS, domain mappings, IAM, scheduled jobs, build
triggers — was retrieved live and verified during this session.
