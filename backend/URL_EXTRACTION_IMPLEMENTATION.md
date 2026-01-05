# URL Extraction Implementation

## Overview
This implementation adds deterministic URL extraction from raw user input in the `/api/parse-and-publish` endpoint, storing external listing URLs both as Schema.org `Event.url` and in provenance (`flypost.sources[].sourceUrl`).

## Requirements Met

### 1. Deterministic URL Extraction ✅
- Extracts the **first** `https://` URL from `naturalLanguageInput` text
- Uses regex pattern matching (no LLM dependency, no network calls)
- Sanitization:
  - Must start with `https://`
  - Trims whitespace
  - Caps at 1000 characters
  - Returns `undefined` if no valid URL found (no empty strings stored)

### 2. Dual Storage ✅
- **Top-level `event.url`**: Stores as Schema.org `Event.url` on the event object
- **Provenance**: Stores in `flypost.sources[].sourceUrl`
  - If `sourceId === 'parse-and-publish'` exists, sets `sourceUrl` on that entry
  - Otherwise, sets on first source entry if sources exist
  - Does not create new sources entry if none exists

### 3. Discovery Safety ✅
- The `discoveryMapper.js` was **not modified**
- Existing logic maps `event.url` to `externalListingUrl` in discovery responses
- URL is not exposed as a direct `url` field in Layer 1 discovery (protocol-safe)

### 4. Offline Tests ✅
All tests use `node:test` and are hermetic (no network, no API keys required):
- **test-url-extraction.js**: URL extraction utility tests (10 tests)
- **test-url-storage-integration.js**: Storage flow tests (5 tests)
- **test-discovery-url-mapping.js**: Discovery mapper tests (3 tests)
- **test-url-e2e.js**: End-to-end API tests (requires OPENAI_API_KEY, optional)

## Files Modified

### `/backend/src/server.js`
- Added import: `import { extractFirstUrl } from './utils/urlExtractor.js'`
- Added URL extraction after LLM parsing (step 1.1)
- Set `parsedEvent.url = extractedUrl` when URL is extracted
- Modified source provenance to include `sourceUrl` in source data

### New Files

#### `/backend/src/utils/urlExtractor.js`
Core utility for deterministic URL extraction:
```javascript
export function extractFirstUrl(text)
```
- Extracts first `https://` URL from text
- Returns `undefined` if no valid URL found
- Sanitizes: trim, length cap at 1000 chars

#### Test Files
- `/backend/test-url-extraction.js` - Unit tests for URL extractor
- `/backend/test-url-storage-integration.js` - Integration tests for storage flow
- `/backend/test-discovery-url-mapping.js` - Discovery mapper URL handling
- `/backend/test-url-e2e.js` - End-to-end API tests (optional, requires API key)
- `/backend/validate-url-extraction.js` - Manual validation script

## Running Tests

```bash
# Run all URL-related tests
cd backend
node --test test-url-extraction.js test-url-storage-integration.js test-discovery-url-mapping.js

# Run manual validation (no API key required)
node validate-url-extraction.js

# Run E2E tests (requires OPENAI_API_KEY)
RUN_E2E_TESTS=true node --test test-url-e2e.js
```

## Usage Example

### Input with URL
```
POST /api/parse-and-publish

Body:
{
  "naturalLanguageInput": "Open house\n\nTue, Jan 6\n11:00 AM - 2:00 PM\n\n810 Franklin St, Santa Monica, CA 90403\n\nhttps://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/"
}

Response:
{
  "success": true,
  "data": {
    "event": {
      "url": "https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/",
      "flypost": {
        "sources": [
          {
            "sourceType": "llm",
            "sourceId": "parse-and-publish",
            "sourceUrl": "https://www.zillow.com/homedetails/810-Franklin-St-Santa-Monica-CA-90403/20469323_zpid/"
          }
        ]
      }
    }
  }
}
```

### Input without URL
```
POST /api/parse-and-publish

Body:
{
  "naturalLanguageInput": "Open house\n\nTue, Jan 6\n11:00 AM - 2:00 PM\n\n810 Franklin St, Santa Monica, CA 90403"
}

Response:
{
  "success": true,
  "data": {
    "event": {
      // No "url" field
      "flypost": {
        "sources": [
          {
            "sourceType": "llm",
            "sourceId": "parse-and-publish"
            // No "sourceUrl" field
          }
        ]
      }
    }
  }
}
```

## Test Results

```
✅ All tests passing (18 tests):
  - URL Extraction - Zillow URL from example input
  - URL Extraction - First URL when multiple present
  - URL Extraction - No URL in text
  - URL Extraction - http URL should not be extracted
  - URL Extraction - URL with whitespace
  - URL Extraction - Very long URL capped at 1000 chars
  - URL Extraction - Invalid input types
  - URL Extraction - Empty string
  - URL Extraction - Just https://
  - URL Extraction - Real estate URL with query params
  - Parse-and-Publish Flow - URL extraction and storage
  - Parse-and-Publish Flow - No URL in input
  - Parse-and-Publish Flow - sourceUrl precedence with parse-and-publish
  - Parse-and-Publish Flow - sourceUrl on first source when parse-and-publish not found
  - Parse-and-Publish Flow - Multiple URLs extracts first
  - Discovery Mapper - event.url maps to externalListingUrl
  - Discovery Mapper - no URL results in null externalListingUrl
  - Discovery Mapper - sourceUrl in flypost.sources maps to externalListingUrl
```

## Discovery API Behavior

The URL is exposed in discovery responses as `externalListingUrl` (not `url`):

```json
{
  "protocol": "flypost-discovery",
  "version": "v1",
  "events": [
    {
      "eventId": "evt_xxx",
      "externalListingUrl": "https://www.zillow.com/...",
      "what": { "type": "open_house" },
      "where": { ... },
      "when": { ... }
    }
  ]
}
```

This ensures Layer 1 discovery responses remain protocol-grade while providing access to external listing pages.

## Edge Cases Handled

1. **No URL in input**: Returns `undefined`, no `url` field set
2. **Multiple URLs**: Extracts only the first URL
3. **http:// URLs**: Rejected (only https:// accepted)
4. **Very long URLs**: Capped at 1000 characters
5. **Whitespace**: Trimmed automatically
6. **Invalid input types**: Returns `undefined` for non-strings

## Backward Compatibility

- Existing events without URLs remain unchanged
- Discovery API continues to work for events without URLs (null `externalListingUrl`)
- No schema migrations required
- No breaking changes to existing endpoints
