/* eslint-env mocha */
const assert = require('assert');

const {
  isFirebaseRequiredWriteOrigin,
} = require('./src/forward');

describe('origin-gated auth', () => {
  it('requires firebase token for app.goflypost.com writes', () => {
    assert.equal(isFirebaseRequiredWriteOrigin('https://app.goflypost.com'), true);
  });

  it('requires firebase token for post.goflypost.com writes', () => {
    assert.equal(isFirebaseRequiredWriteOrigin('https://post.goflypost.com'), true);
  });

  it('does not require firebase token for other origins', () => {
    assert.equal(isFirebaseRequiredWriteOrigin('https://example.com'), false);
  });

  // NOTE: Additional integration tests in this repo validate:
  // - 200 with valid Firebase token
  // - 401 without/invalid Firebase token
  // - write-token does not work for browser write origins
  // The above scenarios must be duplicated for https://post.goflypost.com.
});
