// v14 – Cloud Run proxy with separated access control for "ask" and "post"

const path = require('path');
const express = require('express');
const cors = require('cors');
const createForward = require('./src/forward');

const app = express();

// Define origins and their allowed methods
const allowedOrigins = {
  'https://ask.goflypost.com': ['GET', 'POST'], // GET + POST for chat queries
  'https://post.goflypost.com': ['GET', 'POST'], // Allow GET and POST for post
  'https://presence.goflypost.com': ['GET', 'POST'],
  'https://flypost.netlify.app': ['GET'],
  'https://app.goflypost.com': ['GET'],
  'http://localhost:5173': ['GET', 'POST'],
  'https://www.goflypost.com': ['GET', 'POST'],
  'https://api.goflypost.com': ['GET', 'POST'],
};

// CORS middleware
// NOTE: CORS is a browser policy. For disallowed origins, we do NOT throw an error;
// we just don't grant CORS headers (cb(null, false)) to avoid 5xx noise for probes.
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Allow non-origin requests (e.g., server-to-server)
      const allowedMethods = allowedOrigins[origin];
      if (allowedMethods) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

// Serve AI/LLM discovery files at /.well-known/*
app.use('/.well-known', express.static(path.join(__dirname, 'public/.well-known'), {
  setHeaders(res) {
    res.set('Cache-Control', 'public, max-age=86400')
  }
}))

/**
 * Cheap probe shield: terminate known-noise paths immediately so they never hit forward()/backend.
 * This does NOT stop Cloud Run invocation cost, but it *does* prevent backend calls and reduces work.
 * For stopping Cloud Run invocations, put Cloud Armor / HTTPS LB / CDN in front.
 */
app.use((req, res, next) => {
  const path = (req.path || '').toLowerCase();

  // robots.txt: block crawlers from API routes but allow discovery files
  if (req.method === 'GET' && path === '/robots.txt') {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(
      ['User-agent: *', 'Disallow: /', 'Allow: /llms.txt', 'Allow: /openapi.json', 'Allow: /.well-known/', ''].join('\n'),
    );
  }

  // llms.txt: machine-readable API description for LLM agents
  if (req.method === 'GET' && path === '/llms.txt') {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(
      [
        '# Flypost API',
        '',
        '> Flypost is an open-house and local-event registry. Use this API to discover nearby open houses by location, publish events from natural language, verify buyer attendance, and collect post-visit feedback.',
        '',
        'Base URL: https://api.goflypost.com',
        'OpenAPI spec: https://api.goflypost.com/openapi.json',
        '',
        '## Public endpoints (no auth required)',
        '',
        '- GET /v1/events/near?lat=&lng=&radius_mi=: Discover open houses and events near a coordinate. Returns name, dates, address, organizer, and listing URL.',
        '- GET /v1/events/:event_id: Fetch a single event by its Flypost ID.',
        '- Events may contain an occurrences[] array for multi-slot events with fields: occurrenceId, startDate, endDate, label, local.date, local.startTime, local.endTime.',
        '- POST /api/chat: Web Concierge — ask a natural-language question about nearby events. Pass { message, lat, lng, conversationHistory? }. Returns { success, message (markdown), timestamp }. Conditional on ENABLE_CONCIERGE=true.',
        '- POST /api/chat/stream: SSE streaming version of Web Concierge. Same request body. Returns text/event-stream with events: {"type":"connected"}, {"type":"token","content":"..."}, {"type":"done","duration":ms}, {"type":"error","message":"..."}. Conditional on ENABLE_CONCIERGE=true.',
        '- GET /api/chat/health: Web Concierge health check.',
        '- GET /e/:slug/:fpid: Public HTML share page for an event.',
        '- GET /e/:slug/:fpid/calendar.ics: Download event as iCal file.',
        '',
        '## Authenticated endpoints',
        '',
        'Pass your write token in the x-flypost-write-token header, or a Firebase ID token as Bearer.',
        '',
        '- POST /api/parse-and-publish: Publish an event from free-text (Instagram caption, MLS note, etc.). Pass { naturalLanguageInput }.',
        '- POST /v1/events/upsert: Publish or update a structured event object.',
        '',
        '## Rate limits',
        '',
        '- Discovery (public): 100 req / 15 min per IP',
        '- Discovery (brokerage api_key): 500 req / 15 min per IP',
        '- Write endpoints: 50 req / 15 min per IP',
        '- /api/chat, /api/chat/stream: 20 req / 15 min per IP (shared)',
        '',
      ].join('\n'),
    );
  }

  // openapi.json: machine-readable OpenAPI 3.1 spec
  if (req.method === 'GET' && path === '/openapi.json') {
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return res.status(200).json(require('./openapi.json'));
  }

  // Optional: fast-fail very common bot probe targets
  const isCommonProbe =
    path === '/.env' ||
    path === '/.git' ||
    path.startsWith('/.git/') ||
    path === '/wp-login.php' ||
    path.startsWith('/wp-admin') ||
    path === '/phpmyadmin' ||
    path.startsWith('/phpmyadmin/') ||
    path === '/admin' ||
    path === '/administrator';

  if (isCommonProbe) {
    // Return 404 to avoid “interesting” responses
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(404).send('Not found');
  }

  next();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Handle preflight requests
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-flypost-write-token');
    res.sendStatus(204); // Preflight response
    return;
  }

  // Reduce log noise/cost for probe endpoints
  const path = (req.path || '').toLowerCase();
  const skipLog =
    path === '/robots.txt' ||
    path === '/llms.txt' ||
    path === '/openapi.json' ||
    path.startsWith('/.well-known') ||
    path === '/.env' ||
    path === '/.git' ||
    path.startsWith('/.git/') ||
    path === '/wp-login.php' ||
    path.startsWith('/wp-admin') ||
    path === '/phpmyadmin' ||
    path.startsWith('/phpmyadmin/') ||
    path === '/admin' ||
    path === '/administrator';

  if (!skipLog) {
    console.log('proxy incoming:', req.method, req.originalUrl, 'from', req.headers.origin);
  }

  next();
});

// Middleware to enforce origin-specific METHOD restrictions
function enforceOriginMethods(req, res, next) {
  // Exempt public share pages from origin enforcement (CRITICAL)
  if (req.method === 'GET' && req.path.startsWith('/e/')) {
    console.log(`✅ Public share page access: ${req.path}`);
    return next();
  }

  const origin = req.headers.origin;
  const allowedMethods = allowedOrigins[origin];
  if (allowedMethods && !allowedMethods.includes(req.method)) {
    console.log(`⛔ Method ${req.method} not allowed for origin ${origin}`);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed for origin ${origin}`,
    });
  }
  next();
}

app.use(enforceOriginMethods);

// Authentication is handled in forward.js (single source of truth)
const forward = createForward();

app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' });
});

// --- forward route registrations ---
app.get('/health', forward);
app.get('/v1/events/near', forward);
app.get('/v1/events/:event_id', forward);
app.get('/e/:slug/:fpid/calendar.ics', forward); // Calendar download (public, no auth)
app.get('/e/:slug/:fpid', forward);
app.post('/api/parse-and-publish', forward);
app.use('/api', forward);

// Forward explicit endpoints
app.post('/v1/presence/check-in', forward);
app.post('/v1/feedback/submit', forward);

// Optionally forward entire prefixes (useful for future subpaths)
app.use('/v1/presence', forward);
app.use('/v1/feedback', forward);

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`);
});
