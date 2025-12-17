// Proxy request forwarding and authentication gating
//
// Write requests coming from known browser origins must include a valid Firebase ID token.

const FIREBASE_REQUIRED_WRITE_ORIGINS = new Set([
  'https://app.goflypost.com',
  'https://post.goflypost.com',
]);

function isFirebaseRequiredWriteOrigin(origin) {
  if (!origin) return false;
  return FIREBASE_REQUIRED_WRITE_ORIGINS.has(origin);
}

module.exports = {
  FIREBASE_REQUIRED_WRITE_ORIGINS,
  isFirebaseRequiredWriteOrigin,
};
