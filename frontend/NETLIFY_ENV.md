# Netlify Environment Configuration

## Required Environment Variables

When deploying the Flypost v4 frontend to Netlify, you need to configure the following environment variable to point to the deployed Cloud Run proxy:

### VITE_API_BASE

**Key:** `VITE_API_BASE`  
**Value:** `https://proxy-498798854474.us-west1.run.app`

This environment variable tells the frontend where to send API requests. The proxy handles CORS headers and authentication to the backend service.

## How to Set Environment Variables in Netlify

1. Log in to your Netlify dashboard
2. Navigate to your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**
5. Enter the key name: `VITE_API_BASE`
6. Enter the value: `https://proxy-498798854474.us-west1.run.app`
7. Click **Save**
8. Trigger a new deploy for the changes to take effect

## Local Development

For local development, you can override the API base to point to your local backend:

```bash
VITE_API_BASE=http://localhost:3001 npm run dev
```

Or create a `.env.local` file in the frontend directory:

```
VITE_API_BASE=http://localhost:3001
```

**Note:** The `.env.local` file should not be committed to the repository (it's already in .gitignore).

## Default Behavior

If `VITE_API_BASE` is not set, the frontend will default to using the production proxy URL (`https://proxy-498798854474.us-west1.run.app`). This ensures the deployed frontend works out-of-the-box, but you'll want to set the environment variable explicitly for clarity and easier updates.

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console, verify:
- The `VITE_API_BASE` environment variable is set correctly in Netlify
- The URL includes the protocol (`https://`) but no trailing slash
- You've triggered a new deploy after setting the environment variable

### 404 Errors

If you see 404 errors for API requests:
- Ensure the proxy is deployed and accessible at the configured URL
- Verify the proxy is configured to handle requests under the `/api/*` path prefix
- Check that all API calls in the frontend include the `/api` prefix
