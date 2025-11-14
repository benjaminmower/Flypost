# Netlify Environment Variable Configuration

## Required Environment Variable

### VITE_API_BASE

Set this variable in your Netlify site's environment settings to point to the Cloud Run proxy URL.

**Example value:**
```
https://proxyv4-498798854474.us-west1.run.app
```

**Steps to configure:**

1. Log in to Netlify and navigate to your site
2. Go to **Site settings** → **Environment variables**
3. Add a new variable:
   - **Key:** `VITE_API_BASE`
   - **Value:** Your Cloud Run proxy URL (e.g., `https://proxyv4-498798854474.us-west1.run.app`)
4. Save the variable
5. **Important:** Redeploy your site for the change to take effect

**Note:** The proxy URL should **not** include a trailing slash or the `/api` prefix. The frontend code will automatically append the appropriate paths (e.g., `/api/health`, `/api/v1/events/near`).

## Local Development

When running the frontend locally, `VITE_API_BASE` defaults to `http://localhost:3001`. You can override this for local testing:

```bash
VITE_API_BASE=http://localhost:3001 npm run dev
```

or test against a deployed proxy:

```bash
VITE_API_BASE=https://proxyv4-498798854474.us-west1.run.app npm run dev
```
