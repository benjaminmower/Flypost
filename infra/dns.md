# DNS & Domain Mapping

**Status: VERIFIED live** on 2026-08-14 via `dig`, `whois`, and
`gcloud beta run domain-mappings list`. Findings below are actual, not inferred.

## Domains in use

Root domain: **goflypost.com**

| Subdomain | Resolves to (live `dig`) | Hosting | Notes |
|---|---|---|---|
| `goflypost.com` (root) | `75.2.60.5`, `99.83.231.61` (Netlify LB IPs) | Netlify — `frontdoor_netlify/` (marketing/docs/ToS/privacy, proxies `/e/*` to `api.goflypost.com`) | |
| `api.goflypost.com` | `CNAME ghs.googlehosted.com` | **Cloud Run domain mapping → `proxyv4`** (confirmed via `gcloud beta run domain-mappings list`) | |
| `app.goflypost.com` | `CNAME flypost.netlify.app` | Netlify — `frontend_app/` | |
| `post.goflypost.com` | `CNAME flypost-post.netlify.app` | Netlify — `frontend_post/` | |
| `ask.goflypost.com` | `CNAME flypost-ask.netlify.app` | Netlify — `frontend_ask/` | **Mismatch — see below** |
| `presence.goflypost.com` | `CNAME presence-flypost.netlify.app` | Netlify — `frontend_presence/` | |

### ⚠️ Orphaned Cloud Run domain mapping on `ask.goflypost.com`

`gcloud beta run domain-mappings list --region us-west1` shows a mapping:

```
DOMAIN              SERVICE
api.goflypost.com   proxyv4
ask.goflypost.com   flypost-concierge
```

But live DNS for `ask.goflypost.com` is a CNAME to `flypost-ask.netlify.app` — Netlify, not Cloud
Run. The GCP-side domain mapping to `flypost-concierge` is **stale/unused**: DNS doesn't point at
it, so it's dead weight, not live infra. This corroborates the earlier finding that
`flypost-concierge` (a Cloud Run service building from the same `v4` GitHub repo, not referenced
in any committed doc) is a superseded leftover — per your direction, documenting only, not treating
as critical. If tearing down infra later, this domain mapping can be deleted independently of DNS:
```bash
gcloud beta run domain-mappings delete --domain ask.goflypost.com --region us-west1
```

`app.goflypost.com` also appears in `proxy` and `flypostv4`'s live `FRONTEND_ORIGIN`/`FRONTEND_URL`
env vars alongside `https://flypost.netlify.app` — the bare Netlify subdomain is a real, currently
allowed CORS origin, not just a leftover reference.

## Registrar — confirmed via whois

```
Registrar: NameCheap, Inc.
Registrar URL: http://www.namecheap.com
Creation Date: 2023-03-22
Registry Expiry Date: 2028-03-22   ← plenty of runway, no urgent action
Nameservers: dns1.registrar-servers.com / dns2.registrar-servers.com (Namecheap's own DNS — domain
             is using Namecheap's nameservers, not a third-party DNS provider like Cloudflare)
```

DNS records themselves (CNAMEs above) are managed in the **Namecheap dashboard → Advanced DNS**
for `goflypost.com`, under the account that registered the domain in March 2023. Confirm which
Namecheap login owns it (check `benjaminmower@gmail.com` or any linked business email against
Namecheap's account-recovery flow if credentials are lost).

## Recreating from scratch (if DNS is ever wiped)

For each Netlify-hosted subdomain (`goflypost.com` root, `app`, `post`, `ask`, `presence`):
- `CNAME` record pointing at the site's default `*.netlify.app` subdomain (values captured above),
  or whatever Netlify's **Domain settings → Custom domains** page instructs after creating/relinking
  the site. Netlify auto-provisions Let's Encrypt TLS once DNS is verified.

For `api.goflypost.com` (Cloud Run):
```bash
gcloud beta run domain-mappings create --service proxyv4 --domain api.goflypost.com --region us-west1
# then add the CNAME it outputs (currently: ghs.googlehosted.com) in Namecheap
```

## Netlify site → repo directory map (for reference when recreating sites)

| Netlify site (custom domain) | Repo directory | Build command | Publish dir |
|---|---|---|---|
| `goflypost.com` | `frontdoor_netlify/` | (static, no build step per its `netlify.toml` — only redirects) | root of `frontdoor_netlify/` |
| `app.goflypost.com` | `frontend_app/` | `npm install && npm run build` | `dist` |
| `ask.goflypost.com` | `frontend_ask/` | `npm install && npm run build` | `dist` |
| `post.goflypost.com` | `frontend_post/` | `npm install && npm run build` | `dist` |
| `presence.goflypost.com` | `frontend_presence/` | `npm install && npm run build` | `dist` |

Root-level `netlify.toml` (repo root) duplicates `frontend_app/netlify.toml` — if Netlify is
configured to build from repo root for the `app.goflypost.com` site, that's the one it reads.
