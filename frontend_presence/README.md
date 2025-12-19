# Flypost Presence Frontend

Vite-based frontend for the Flypost Presence check-in and feedback system.

## Overview

This is the frontend for the Presence feature, allowing users to:
- Check in to open houses using geolocation
- Receive feedback links after checking in
- Submit feedback about properties they visited

## Tech Stack

- **Vite** - Fast development and optimized production builds
- **Vanilla JavaScript** (ES6 modules)
- **Tailwind CSS** via CDN for styling
- **LocalStorage** for buyer token and check-in cache

## Features

### Check-in Flow
- User clicks "CHECK IN NOW" button
- App requests geolocation permission
- Calls backend to check in at nearest event
- Caches check-in for 2 hours to avoid re-prompting

### Success View
- Shows after successful check-in
- Provides three actions:
  1. Open feedback form (in-app navigation)
  2. Copy feedback link to clipboard
  3. Text feedback link via SMS

### Feedback Form
- Accessible via `/f/:attendanceId` route
- Collects:
  - What the user liked about the property
  - What the user didn't like
  - Whether they want to see similar properties
- Submits to backend and redirects to Ask site

## API Integration

### Check-in Endpoint
```
POST https://api.goflypost.com/v1/presence/check-in
```
**Body:**
```json
{
  "lat": 34.0195,
  "lng": -118.4912,
  "buyerToken": "ulid_abc123...",
  "method": "geo_time"
}
```

### Feedback Endpoint
```
POST https://api.goflypost.com/v1/feedback/submit
```
**Body:**
```json
{
  "attendanceId": "attendance-id-from-checkin",
  "answers": {
    "liked": "Great location and modern finishes",
    "disliked": "Small backyard",
    "wantsSimilar": true
  }
}
```

## Development

### Prerequisites
- Node.js >= 20

### Install Dependencies
```bash
npm install
```

### Run Dev Server
```bash
npm run dev
```
Opens at http://localhost:5176

### Build for Production
```bash
npm run build
```
Output is in `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

## Project Structure

```
frontend-presence/
├── src/
│   ├── main.js       # Application logic and routing
│   └── api.js        # API calls to backend
├── index.html        # Entry point
├── package.json      # Dependencies
├── vite.config.js    # Vite configuration
├── netlify.toml      # Netlify deployment config
└── README.md         # This file
```

## Deployment

### Netlify Setup

1. Create a new Netlify site
2. Connect to this repository
3. Configure build settings:
   - **Base directory**: `frontend-presence`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `dist`
4. Deploy!

The `netlify.toml` file configures SPA routing to redirect all routes to `index.html`, including the feedback route `/f/:attendanceId`.

### Environment Variables

No environment variables needed! The app uses hardcoded API URLs:
- Production API: `https://api.goflypost.com`

## Storage

### LocalStorage Keys

- `buyerToken` - Anonymous buyer identifier (generated once, persists)
- `recentCheckIn` - Cached check-in data (expires after 2 hours)
  ```json
  {
    "attendanceId": "...",
    "feedbackUrl": "https://presence.goflypost.com/f/...",
    "timestamp": 1234567890
  }
  ```

## Routing

- `/` - Check-in view (or success view if recently checked in)
- `/f/:attendanceId` - Feedback form for specific attendance

## Browser Support

- Modern browsers with ES6 module support
- Geolocation API required for check-in
- Clipboard API for copy-to-clipboard feature

## License

Apache-2.0
