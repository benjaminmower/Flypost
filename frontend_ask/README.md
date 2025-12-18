# Flypost Ask - Anonymous Chat Interface

Read-only concierge/query surface for asking questions about events.

## Environment Variables

Configure these in your Netlify site settings:

### Required

- `VITE_API_BASE_URL` - API base URL (default: `https://api.goflypost.com`)
  - Example: `https://api.goflypost.com`
  - **Do not include trailing slash or `/api` prefix**

## Local Development

```bash
cd frontend_ask
npm install
npm run dev
```

The dev server will run on http://localhost:5174

To test against a specific API:

```bash
VITE_API_BASE_URL=https://api.goflypost.com npm run dev
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

Deploy to Netlify at `ask.goflypost.com`:

1. Create a new Netlify site
2. Link to this repository
3. Set base directory: `frontend_ask`
4. Set build command: `npm install && npm run build`
5. Set publish directory: `dist`
6. Configure environment variables (see above)
7. Deploy!

Alternatively, use the included `netlify.toml` configuration.

## API Endpoints Used

- `POST /api/chat` - Anonymous chat without authentication

## Features

- Anonymous chat interface (no sign-in required)
- Tailwind CSS for styling
- Responsive design
- Real-time AI responses
