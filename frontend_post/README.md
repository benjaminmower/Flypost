# Flypost Post - Publisher Interface

Authenticated publisher surface for posting events with Firebase Email Link authentication.

## Environment Variables

Configure these in your Netlify site settings:

### Required

- `VITE_API_BASE_URL` - API base URL (default: `https://api.goflypost.com`)
  - Example: `https://api.goflypost.com`
  - **Do not include trailing slash or `/api` prefix**

- `VITE_FIREBASE_API_KEY` - Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain (e.g., `your-project.firebaseapp.com`)
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID

### Optional

- `VITE_FIREBASE_APP_ID` - Firebase app ID
- `VITE_FIREBASE_MEASUREMENT_ID` - Firebase measurement ID (for Analytics)

## Local Development

```bash
cd frontend_post
npm install
npm run dev
```

The dev server will run on http://localhost:5175

Create a `.env.local` file for local development:

```env
VITE_API_BASE_URL=https://api.goflypost.com
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-app-id
```

## Build

```bash
npm run build
```

This will:
1. Build the Vite app to `dist/`
2. Copy capability assets from `../frontend/public/` to `dist/`
   - `.well-known/ai.json`
   - `llm.txt`
   - `openapi.json`
   - `mcp.flypost.get.v1.json`
   - `mcp.flypost.parse.v1.json`

## Deployment

Deploy to Netlify at `post.goflypost.com`:

1. Create a new Netlify site
2. Link to this repository
3. Set base directory: `frontend_post`
4. Set build command: `npm install && npm run build`
5. Set publish directory: `dist`
6. Configure environment variables (see above)
7. Deploy!

Alternatively, use the included `netlify.toml` configuration.

## API Endpoints Used

- `POST /api/parse-and-publish` - Authenticated event publishing (requires Firebase ID token)

## Authentication Flow

1. User enters email and clicks "Send Link"
2. Firebase sends a magic link email
3. User clicks the link, which redirects to `/finishSignIn`
4. App completes sign-in and redirects to home page
5. User can now publish events with authenticated API calls

## Features

- Firebase Email Link (passwordless) authentication
- Authenticated API calls with Bearer token
- Event parsing and publishing
- Tailwind CSS for styling
- Responsive design
