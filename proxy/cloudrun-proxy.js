// v14 – Cloud Run proxy with separated access control for "ask" and "post"

const express = require('express');
const cors = require('cors');
const createForward = require('./src/forward');

const app = express();

// Define origins and their allowed methods
const allowedOrigins = {
  'https://ask.goflypost.com': ['GET', 'POST'], // GET + POST for chat queries
  'https://post.goflypost.com': ['GET', 'POST'], // Allow GET and POST for post
  'https://flypost.netlify.app': ['GET'],
  'https://app.goflypost.com': ['GET'],
  'http://localhost:5173': ['GET', 'POST'],
  'https://www.goflypost.com': ['GET', 'POST'],
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
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
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

// -------------------------------------
// Write-token authentication middleware
// Checks POST requests to /api/* paths before routing
// Supports multiple static tokens (global + per-brokerage)
// Exempts /api/chat (read-only endpoint that uses POST)
// -------------------------------------

// Collect all allowed tokens here
const WRITE_TOKENS = [
  process.env. FLYPOST_WRITE_TOKEN, // global token (e.g., "goflypost")
  process.env.VISTA_WRITE_TOKEN, // Vista-specific token (e.g., "vist@sir")
  process.env.BHHS_UTAH_WRITE_TOKEN, // BHHS Utah brokerage
  process.env.COMPASS_WRITE_TOKEN, // Compass brokerage
].filter(Boolean);

function requireWriteToken(req, res, next) {
  const isApiPost =
    req.method === 'POST' && req.originalUrl. startsWith('/api/');
  const isChatEndpoint = req.originalUrl.startsWith('/api/chat');

  // Chat endpoint is read-only, doesn't need write token
  if (isApiPost && !isChatEndpoint && WRITE_TOKENS.length > 0) {
    const token = req.get('x-flypost-write-token') || '';

    if (!token) {
      console.log(`🔒 Write-token missing for ${req.method} ${req.originalUrl}`);
      return res.status(401).json({
        success: false,
        error:  'Unauthorized: Missing write token',
      });
    }

    const matched = WRITE_TOKENS.includes(token);
    if (!matched) {
      console.log(`🔒 Write-token invalid for ${req.method} ${req.originalUrl}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid write token',
      });
    }

    console. log(`✅ Write-token validated for ${req.method} ${req.originalUrl}`);
  }

  next();
}

app.use(requireWriteToken);

const forward = createForward();

app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' });
});

app.get('/health', forward);
app.get('/v1/events/near', forward);
app.post('/api/parse-and-publish', forward);
app.use('/api', forward);

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`);
});
