// v14 – Cloud Run proxy with separated access control for "ask" and "post"

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
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Allow non-origin requests (e. g., server-to-server)
      const allowedMethods = allowedOrigins[origin];
      if (allowedMethods) return cb(null, true);
      return cb(new Error('Not allowed by CORS: ' + origin));
    },
    credentials:  true,
  }),
);

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Handle preflight requests
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set(
      'Access-Control-Allow-Methods',
      'GET,POST,OPTIONS',
    );
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-flypost-write-token');
    res.sendStatus(204); // Preflight response
    return;
  }
  console.log('proxy incoming:', req.method, req.originalUrl, 'from', req.headers.origin);
  next();
});

// Middleware to enforce origin-specific METHOD restrictions
function enforceOriginMethods(req, res, next) {
  const origin = req.headers.origin;
  const allowedMethods = allowedOrigins[origin];
  if (allowedMethods && ! allowedMethods.includes(req.method)) {
    console.log(`⛔ Method ${req.method} not allowed for origin ${origin}`);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed for origin ${origin}`,
    });
  }
  next();
}

app.use(enforceOriginMethods);

// Authentication is now handled in forward.js (single source of truth)

const forward = createForward();

app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' });
});

// --- existing forward route registrations ---
app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' });
});

app.get('/health', forward);
app.get('/v1/events/near', forward);
app.get('/v1/events/:event_id', forward);
app.get('/e/:shareId', forward);
app.post('/api/parse-and-publish', forward);
app.use('/api', forward);

// <-- ADD THESE LINES HERE (forward presence/feedback writes) -->
// Forward explicit endpoints
app.post('/v1/presence/check-in', forward);
app.post('/v1/feedback/submit', forward);

// Optionally forward entire prefixes (useful for future subpaths)
app.use('/v1/presence', forward);
app.use('/v1/feedback', forward);
// -----------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`);
});
