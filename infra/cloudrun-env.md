# Cloud Run Environment Variables

**Status: VERIFIED live** on 2026-08-14 via `gcloud run services describe --format export` for
both services. Full YAML exports are at `infra/proxyv4.yaml` and `infra/flypostv4.yaml` (the
latter has its two secret values redacted — see note at bottom).

Two Cloud Run services exist in project `goflypost`, region `us-west1`:

- **`proxyv4`** — the public-facing API proxy (`proxy/cloudrun-proxy.js`), mapped to
  `api.goflypost.com`. All `/v1/` routes must be registered here per `CLAUDE.md`.
- **`flypostv4`** — the backend (`backend/src/server.js`). `proxyv4` calls it via `BACKEND_URL`.

Names and sources only — **no secret values are recorded in this table**.

## proxyv4 — live env vars (confirmed, nothing redacted — none of these are secret)

| Var | Live value | Purpose | Source |
|---|---|---|---|
| `BACKEND_URL` | `https://flypostv4-a7jlfl42zq-uw.a.run.app` | URL of the `flypostv4` backend | **Computed at deploy time** by the `proxyv4` Cloud Build trigger (id `ebbc10ba-4b01-4b34-916d-b108c485a0b1`) via `gcloud run services describe flypostv4 --format='value(status.url)'`, per `proxy/cloudbuild.yaml`. Re-derived on every deploy — will change if `flypostv4` is ever redeployed to a new URL. |
| `FRONTEND_ORIGIN` | `https://flypost.netlify.app,https://app.goflypost.com` | Allowed CORS origins | `proxy/cloudbuild.yaml` substitution `_FRONTEND_ORIGIN` (hardcoded in the committed file, not a trigger-level override) |
| `PROXY_USE_ID_TOKEN` | `true` | Enables Firebase ID token verification path | `proxy/cloudbuild.yaml` substitution `_PROXY_USE_ID_TOKEN` |
| `FIREBASE_PROJECT_ID` | `goflypost` | Firebase project for Admin SDK / token verification | `proxy/cloudbuild.yaml`, set to Cloud Build's `$PROJECT_ID` |
| `PORT` | `8080` | HTTP listen port | Cloud Run runtime default, also set in Dockerfile (`ENV PORT=8080`) |

### ⚠️ Finding: the write-token / edge-auth gate is effectively OFF

`cloudrun-proxy.js` has live code paths for `EDGE_SHARED_KEY`, `EDGE_ENFORCE`, `FLYPOST_WRITE_TOKEN`,
`VISTA_WRITE_TOKEN`, `BHHS_UTAH_WRITE_TOKEN`, and `COMPASS_WRITE_TOKEN` (lines 29-35, gating
`/api/*` POST writes and an edge-key check). **None of these are set on the live `proxyv4`
service** — the exported YAML above shows only the 4 vars in the table. With `EDGE_ENFORCE` unset,
`cloudrun-proxy.js:134` treats the edge-key check as disabled, and with `WRITE_TOKENS` empty,
`cloudrun-proxy.js:104` returns `false` (no token required) — meaning **write-token enforcement is
currently not active in production**, whatever gate this was meant to provide. This may be
intentional (write access controlled elsewhere, e.g. Firebase Auth) or a dropped rollout — flag
for your own judgment; not fixing it as part of this archive task.

**proxyv4 service account:** `flypost-proxy-service-account@goflypost.iam.gserviceaccount.com`
(IAM roles: `roles/logging.logWriter`, `roles/run.invoker`, `roles/storage.admin` — see RESTART.md
for full IAM detail).

## flypostv4 — live env vars

| Var | Live value | Purpose | Source | Secret? |
|---|---|---|---|---|
| `FRONTEND_URL` | `https://flypost.netlify.app,https://app.goflypost.com,https://ask.goflypost.com,https://flypost-concierge-498798854474.us-west1.run.app` | CORS allow-origins | Set manually on the service (not in any committed cloudbuild.yaml) | No |
| `OPENAI_API_KEY` | `sk-proj-...` (redacted) | OpenAI API access for event parsing | Set manually on the service | **Yes — secret, live value in `infra/flypostv4.yaml` was redacted before commit** |
| `NODE_ENV` | `production` | Standard Node env flag | Set manually | No |
| `GOOGLE_CLOUD_PROJECT` | `goflypost` | Firestore project ID | Set manually | No |
| `ENABLE_CONCIERGE` | `true` | Feature flag for Web Concierge | Set manually | No |
| `GEOCODER_API_KEY` | `AIzaSy...` (redacted) | Google Maps Geocoding API key | Set manually | **Yes — secret, redacted before commit** |
| `GEOCODER_PROVIDER` | `google` | Geocoding provider (note: differs from `.env.example` default of `nominatim`) | Set manually | No |
| `GEOCODER_CACHE_TTL_SECONDS` | `86400` | Geocode cache TTL | Set manually | No |

**flypostv4 service account:** `498798854474-compute@developer.gserviceaccount.com` (GCP's default
compute service account — broader/less scoped than `proxyv4`'s dedicated service account; worth
tightening if rebuilding).

**Not currently set on flypostv4** (present in code/`.env.example` but absent from live env):
`PORT` (Cloud Run default), `FIRESTORE_EMULATOR_HOST` (dev-only, correctly absent), `PRESENCE_RADIUS_KM`
(defaults to `0.1` in code), `FEEDBACK_RECENCY_THRESHOLD_HOURS` (defaults to `4`), `CONCIERGE_ALLOWED_ORIGINS`
(defaults to `https://ask.goflypost.com,https://webflow.io` in code — confirm this default is
acceptable in production since it's not overridden), `BACKEND_INTERNAL_URL` (defaults to
`http://localhost:3001` — not applicable since concierge runs in-process here), `OG_DEFAULT_IMAGE`
(hardcoded fallback used).

## ⚠️ Handling of the two live secrets found during this export

`gcloud run services describe flypostv4 --format export` returns environment variables **in
plaintext**, including `OPENAI_API_KEY` and `GEOCODER_API_KEY`. Per your instruction to never write
secret values into the repo, `infra/flypostv4.yaml` has both values replaced with
`<REDACTED-OPENAI_API_KEY>` / `<REDACTED-GEOCODER_API_KEY>` before being written to disk — the raw
export was never saved. To retrieve the actual values yourself:

```bash
gcloud run services describe flypostv4 --region us-west1 \
  --format="value(spec.template.spec.containers[0].env)"
```

`proxyv4`'s export has no secrets in it — all 4 of its env vars are non-sensitive, so
`infra/proxyv4.yaml` is the untouched, complete `gcloud ... --format export` output.

## Firebase Functions secrets (functions/index.js) — separate from Cloud Run

These are Firebase Functions v2 secrets (`defineSecret`), stored in Google Secret Manager, not
Cloud Run env vars.

| Var | Purpose | Source |
|---|---|---|
| `DIGEST_TRIGGER_TOKEN` | Auth token for `X-Digest-Token` header on the HTTP-triggered digest functions | `firebase functions:secrets:set DIGEST_TRIGGER_TOKEN` — **secret** |
| `RESEND_API_KEY` | Resend.com API key for sending digest emails | `firebase functions:secrets:set RESEND_API_KEY` — **secret** |
| `DIGEST_RECIPIENTS` | Comma-separated recipient email list | `firebase functions:secrets:set DIGEST_RECIPIENTS` — sensitive (PII), treat as secret |

Retrieve current values (if you have Secret Manager access):
```bash
firebase functions:secrets:access DIGEST_TRIGGER_TOKEN
firebase functions:secrets:access RESEND_API_KEY
firebase functions:secrets:access DIGEST_RECIPIENTS
```
There's also a `secret-manager@goflypost.iam.gserviceaccount.com` service account in the project —
purpose not documented anywhere in the repo; check its IAM bindings before assuming it's unused.

## scripts/ingest agent — separate secret surface

`scripts/ingest/.env.example` (local-only ingest agent, not deployed to Cloud Run) references:
`FLYPOST_WRITE_TOKEN`, `ANTHROPIC_API_KEY`. These are local-machine secrets for a script that
posts events into Flypost via the public API — not part of any cloud service's config, but you'll
need a fresh `ANTHROPIC_API_KEY` if you ever run this agent again.

## Frontend build-time vars (Netlify) — public, not secret

Client-side Vite `VITE_*` vars are baked into the JS bundle at build time and are intentionally
public (per `SETUP_FRONTENDS.md`).

| Var | Used by | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `frontend_ask`, `frontend_post`, `frontend_app`, `frontend_presence` | `https://api.goflypost.com` |
| `VITE_FIREBASE_API_KEY` | `frontend_post`, `frontend_app`, `frontend_presence` | Firebase Web API key (public) |
| `VITE_FIREBASE_AUTH_DOMAIN` | same | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | same | `goflypost` |
| `VITE_FIREBASE_APP_ID` | same | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | same | Firebase Analytics (if used) |

Retrieve current values from each Netlify site's **Site configuration → Environment variables**,
or `netlify env:list` per site once the `netlify` CLI is linked and authed (not attempted in this
pass — Netlify CLI auth wasn't in scope of this export).

## Full list of secrets to retrieve/regenerate (do not commit)

- `OPENAI_API_KEY` (flypostv4) — live value confirmed present, redacted from this archive
- `GEOCODER_API_KEY` (flypostv4) — live value confirmed present, redacted from this archive
- `DIGEST_TRIGGER_TOKEN`, `RESEND_API_KEY` (Firebase Functions secrets) — not fetched, presumed live
- `DIGEST_RECIPIENTS` (Firebase Functions secret, PII) — not fetched
- `FLYPOST_WRITE_TOKEN`, `VISTA_WRITE_TOKEN`, `BHHS_UTAH_WRITE_TOKEN`, `COMPASS_WRITE_TOKEN`,
  `EDGE_SHARED_KEY` — **confirmed NOT set on proxyv4 currently**; only regenerate these if you intend
  to re-enable the write-token gate (see finding above)
- `ANTHROPIC_API_KEY` (local, `scripts/ingest/` only — not cloud infra)
- Firebase Web API config (`VITE_FIREBASE_*`) — not secret, but pull fresh from Firebase Console if lost
