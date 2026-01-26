// v15 – Cloud Run proxy restricted to GET /e/* share pages only

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const createForward = require('./src/forward');

const app = express();

function getRequestPath(req) {
  try {
    return new URL(req.originalUrl, 'http://localhost').pathname;
  } catch {
    return req.originalUrl.split('?')[0].split('#')[0];
  }
}

function isSharePath(pathname) {
  return pathname.startsWith('/e/');
}

// Share-only surface: allow any origin since access is limited to GET /e/*.
app.use(cors({ origin: '*' }));

app.use(express.json({ limit: '1mb' }));

const shareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use((req, res, next) => {
  const pathname = getRequestPath(req);
  const isShareRequest = isSharePath(pathname);

  if (req.method === 'OPTIONS') {
    if (!isShareRequest) {
      return res.sendStatus(404);
    }
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-flypost-write-token');
    res.sendStatus(204);
    return;
  }

  // Share page allowlist: only GET /e/* is served by this proxy.
  if (!isShareRequest) {
    console.log(`⛔ Blocked ${req.method} ${pathname} (allowlist: GET /e/* only)`);
    return res.sendStatus(404);
  }
  if (req.method !== 'GET') {
    console.log(`⛔ Blocked ${req.method} ${pathname} (allowlist: GET /e/* only)`);
    return res.status(403).json({
      success: false,
      error: 'Forbidden: only GET /e/* is allowed',
    });
  }
  console.log('proxy incoming:', req.method, req.originalUrl, 'from', req.headers.origin);
  shareLimiter(req, res, next);
});

// Authentication is now handled in forward.js (single source of truth)

const forward = createForward();

// Share pages only: GET /e/* (no auth; low risk surface).
app.get('/e/*', forward);

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`);
});
