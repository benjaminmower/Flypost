# Flypost Frontend Setup Documentation

This document describes the setup of two separate Vite-based frontends for Flypost:
- `frontend_ask` - Anonymous chat interface at `ask.goflypost.com`
- `frontend_post` - Authenticated publisher interface at `post.goflypost.com`

## Architecture Overview

Both frontends are built with:
- **Vite** for fast development and optimized production builds
- **Vanilla JavaScript** (ES6 modules)
- **Tailwind CSS** via CDN for styling
- **Environment variables** for configuration

## Directory Structure

```
v4/
├── frontend_ask/
│   ├── src/
│   │   ├── main.js        # Application logic
│   │   └── api.js         # API calls
│   ├── scripts/
│   │   └── copy-assets.js # Build script to copy capability assets
│   ├── index.html         # Entry point
│   ├── package.json       # Dependencies
│   ├── vite.config.js     # Vite configuration
│   ├── netlify.toml       # Netlify deployment config
│   └── README.md          # Site-specific documentation
│
├── frontend_post/
│   ├── src/
│   │   ├── main.js        # Application logic
│   │   ├── api.js         # API calls
│   │   └── firebase.js    # Firebase authentication
│   ├── scripts/
│   │   └── copy-assets.js # Build script to copy capability assets
│   ├── index.html         # Entry point
│   ├── package.json       # Dependencies (includes Firebase)
│   ├── vite.config.js     # Vite configuration
│   ├── netlify.toml       # Netlify deployment config
│   └── README.md          # Site-specific documentation
│
└── frontend/public/       # Single source of truth for capability assets
    ├── .well-known/
    │   └── ai.json
    ├── llm.txt
    ├── openapi.json
    ├── mcp.flypost.get.v1.json
    └── mcp.flypost.parse.v1.json
```

## Build Process

Both sites use the same build pattern:

1. **Vite Build**: Compiles and bundles the application to `dist/`
2. **Asset Copy**: Post-build script copies capability assets from `frontend/public/` to `dist/`

The capability assets maintain their paths:
- `/.well-known/ai.json` → Accessible at `https://{domain}/.well-known/ai.json`
- `/openapi.json` → Accessible at `https://{domain}/openapi.json`
- `/llm.txt` → Accessible at `https://{domain}/llm.txt`
- etc.

## Environment Variables

### Frontend Ask (`ask.goflypost.com`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | `https://api.goflypost.com` | API proxy base URL |

### Frontend Post (`post.goflypost.com`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | `https://api.goflypost.com` | API proxy base URL |
| `VITE_FIREBASE_API_KEY` | Yes | - | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | - | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | - | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | No | - | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | No | - | Firebase measurement ID |

## API Endpoints and Authentication

### Ask Site (Anonymous)
- **Endpoint**: `POST /api/chat`
- **Authentication**: None (origin-gated at proxy)
- **Origin**: Must be `ask.goflypost.com`

### Post Site (Authenticated)
- **Endpoint**: `POST /api/parse-and-publish`
- **Authentication**: `Authorization: Bearer <firebaseIdToken>`
- **Origin**: Must be `post.goflypost.com`

The API proxy at `https://api.goflypost.com` enforces origin-based security:
- Ask site can POST to `/api/chat` without auth
- Post site requires Firebase ID token for POST operations

## Firebase Authentication Flow

The Post site uses Firebase Email Link (passwordless/magic link) authentication:

1. User enters email and clicks "Send Link"
2. Firebase sends email with magic link
3. User clicks link → redirected to `/finishSignIn`
4. App completes sign-in via Firebase SDK
5. App redirects to home page
6. User can now publish events (authenticated API calls include Firebase ID token)

## Build Commands

### From Root Directory

```bash
# Build Ask site
npm run build:ask

# Build Post site
npm run build:post
```

### From Individual Directories

```bash
# Ask site
cd frontend_ask
npm install
npm run build

# Post site
cd frontend_post
npm install
npm run build
```

## Local Development

### Ask Site

```bash
cd frontend_ask
npm install
npm run dev
```

Opens at http://localhost:5174

### Post Site

```bash
cd frontend_post
npm install
npm run dev
```

Opens at http://localhost:5175

### Testing with Environment Variables

```bash
# Ask site with custom API
cd frontend_ask
VITE_API_BASE_URL=https://api.goflypost.com npm run dev

# Post site with Firebase config
cd frontend_post
VITE_API_BASE_URL=https://api.goflypost.com \
VITE_FIREBASE_API_KEY=your-key \
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=your-project \
npm run dev
```

## Netlify Deployment

Each site has its own `netlify.toml` configuration file.

### Ask Site Configuration

```toml
[build]
  base = "frontend_ask"
  command = "npm install && npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Post Site Configuration

```toml
[build]
  base = "frontend_post"
  command = "npm install && npm run build"
  publish = "dist"

[[redirects]]
  from = "/finishSignIn"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Netlify Setup Steps

1. Create two separate Netlify sites
2. Connect each to this repository
3. Configure build settings per the `netlify.toml` files
4. Set environment variables in Netlify UI
5. Deploy!

## Capability Assets

Both sites include AI/LLM capability contracts:

- **`.well-known/ai.json`** - OpenAI plugin manifest
- **`llm.txt`** - Human-readable documentation for LLMs
- **`openapi.json`** - OpenAPI 3.0 specification
- **`mcp.flypost.get.v1.json`** - Model Context Protocol for GET operations
- **`mcp.flypost.parse.v1.json`** - Model Context Protocol for PARSE operations

These files are:
1. Maintained in a single location: `frontend/public/`
2. Automatically copied to each site's `dist/` during build
3. Served at the root of each deployed site

### Note on ai.json URLs

The `.well-known/ai.json` file in `frontend/public/` maintains the absolute URL `https://app.goflypost.com/openapi.json` 
for the existing deployment. During the build process, the copy scripts automatically update the URL to use a relative 
path (`/openapi.json`) for each new site. This ensures:
- The original file remains unchanged for existing deployments
- Each new site references its own `openapi.json` at the root
- No manual URL updates are needed when deploying to new domains

## Security Notes

- No secrets are hardcoded in the source code
- All configuration is via environment variables
- Firebase config (API keys, etc.) can be public (they're client-side keys)
- Actual security is enforced by Firebase Auth and the API proxy
- Origin-based gating prevents unauthorized API access

## UI Screenshots

### Ask Site
![Ask Site UI](https://github.com/user-attachments/assets/50ae9ddd-5b99-4316-84d7-1af67ce4c6ee)

### Post Site
![Post Site UI](https://github.com/user-attachments/assets/9d328844-da4b-4013-8e14-25c55bf571ee)

## Troubleshooting

### Build Fails

- Ensure Node.js >= 20 is installed
- Run `npm install` in the respective directory
- Check that `frontend/public/` exists with capability assets

### Assets Not Copied

- Verify `scripts/copy-assets.js` is executable
- Check the build output for copy script messages
- Ensure `frontend/public/` contains all required files

### Firebase Errors

- Verify all Firebase environment variables are set
- Check Firebase console for correct configuration
- Ensure email link authentication is enabled in Firebase Auth settings
- Verify authorized domains include your Netlify domain

### API Errors

- Check that `VITE_API_BASE_URL` is set correctly
- Verify the API proxy is running and accessible
- Check browser console for CORS errors
- Verify origin-based gating is configured correctly at the proxy

## Future Enhancements

Potential improvements to consider:

1. **Dynamic ai.json**: Generate `.well-known/ai.json` during build with correct site-specific URLs
2. **Shared Components**: Extract common UI components to a shared library
3. **TypeScript**: Migrate to TypeScript for better type safety
4. **Testing**: Add unit and integration tests
5. **CI/CD**: Automate deployments with GitHub Actions
6. **Analytics**: Add Firebase Analytics or similar
7. **Error Tracking**: Integrate Sentry or similar service
8. **Progressive Web App**: Add service worker for offline capability
