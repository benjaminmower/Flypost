# Price Persistence and Retrieval Implementation

## Overview

This document describes the implementation of robust list-price persistence and retrieval across the Flypost v4 ingestion and concierge systems.

## Implementation Summary

### 1. Schema Updates (`backend/schemas/flypost-event-v4.schema.json`)

#### Added to `flypost` object (internal canonical format):
- **`listPrice`** (number, optional): Numeric list price value (e.g., 1250000)
- **`listPriceCurrency`** (string, optional): ISO 4217 currency code (default: "USD")
- **`listPriceDisplay`** (string, optional): Human-readable formatted price (e.g., "$1,250,000")
- **`priceType`** (string, optional): Type of price (e.g., "LIST_PRICE", "RENTAL_RATE")

#### Added to root level (Schema.org export layer):
- **`offers`** (object, optional): Schema.org Offer object with:
  - `@type`: "Offer"
  - `price`: Numeric price value
  - `priceCurrency`: Currency code (ISO 4217)

### 2. Parser Updates (`backend/src/llmParser.js`)

#### Enhanced System Prompt (lines 79-89)
Added section 5: "PRICE INFORMATION (OPTIONAL)" that instructs the LLM to:
- Extract price from natural language text
- Populate `flypost.listPrice*` fields when price is found
- Use appropriate currency codes and display formats
- Never invent or estimate prices

#### Post-Processing Logic (lines 278-295)
Added price normalization after date validation:
```javascript
// If flypost.listPrice exists, ensure offers object is created/updated
if (parsedEvent.flypost && typeof parsedEvent.flypost.listPrice === 'number' && parsedEvent.flypost.listPrice > 0) {
  // Default to USD if currency not specified
  if (!parsedEvent.flypost.listPriceCurrency) {
    parsedEvent.flypost.listPriceCurrency = 'USD'
  }

  // Derive Schema.org offers object from flypost.listPrice
  parsedEvent.offers = {
    '@type': 'Offer',
    price: parsedEvent.flypost.listPrice,
    priceCurrency: parsedEvent.flypost.listPriceCurrency
  }
}
```

**Benefits:**
- Automatic derivation of `offers` from `flypost.listPrice`
- Default currency handling (USD)
- Type safety (only processes valid numbers > 0)
- Backward compatible (no offers created if no price)

### 3. Concierge Updates (`backend/src/concierge/chatHandler.js`)

#### Price Extraction Functions (lines 35-123)

**`extractPriceInfo(event)`** - Extracts price with priority:
1. **Priority 1**: `flypost.listPrice*` (source of truth, verified)
2. **Priority 2**: `offers.price` (Schema.org normalized, verified)
3. **Priority 3**: Parse from `description` (last resort, inferred confidence)

Returns:
```javascript
{
  value: number,        // Numeric price value
  display: string,      // Formatted display string
  currency: string,     // Currency code
  confidence: string,   // "verified" or "inferred"
  source: string       // Where price was extracted from
}
```

**`enrichEventsWithPrice(events)`** - Enriches events with `_priceInfo` metadata

**Price Parsing Logic:**
- Million notation: `$2.5 million` → 2,500,000
- Standard notation: `$1,250,000` → 1,250,000
- Handles various formats with proper regex ordering

#### System Prompt Update (lines 264-279)
Added "Price Extraction Priority" section to guide the AI:
- Explicitly documents the 3-tier priority order
- Instructs to never invent prices
- Requires disclaimer when price is inferred from description
- Tells AI to state "Price not provided" when no price found

#### Tool Integration (lines 523-530)
Events are enriched with price info before passing to AI:
```javascript
if (result.success && result.events) {
  result.events = enrichEventsWithPrice(result.events)
  collectedEvents = result.events
}
```

### 4. Testing

Created three comprehensive test files:

#### `test-price-persistence.js`
Tests schema validation and extraction priority:
- ✅ Events with full price metadata validate
- ✅ Events without price (backward compatible)
- ✅ Events with offers only
- ✅ Priority 1: flypost.listPrice extraction
- ✅ Priority 2: offers.price extraction  
- ✅ Priority 3: description parsing (inferred)
- ✅ Million notation parsing ($2.5M → 2,500,000)

#### `test-parser-price-normalization.js`
Tests parser's price normalization logic:
- ✅ offers object derived from flypost.listPrice
- ✅ Currency defaults to USD
- ✅ No offers for zero/negative/invalid prices
- ✅ Non-USD currencies preserved
- ✅ Type checking (rejects string prices)

#### `test-price-integration.js`
End-to-end integration tests:
- ✅ Complete ingestion flow with price
- ✅ Concierge extraction from stored events
- ✅ Backward compatibility verification
- ✅ Priority order verification
- ✅ All confidence levels tested

All tests pass successfully! ✅

### 5. Key Features

#### Backward Compatibility
- Events without price fields continue to validate and work normally
- No breaking changes to existing data
- Price fields are all optional

#### Data Flow
```
User Input with Price
    ↓
LLM Parser (extracts price)
    ↓
flypost.listPrice* fields populated
    ↓
Post-processing derives offers object
    ↓
Schema validation
    ↓
Storage (Firestore)
    ↓
Concierge retrieval
    ↓
extractPriceInfo() (priority-based)
    ↓
AI presents price with proper confidence level
```

#### Confidence Tracking
- **"verified"**: From `flypost.listPrice*` or `offers.price`
- **"inferred"**: Parsed from description text
- Enables proper disclaimers in UI

#### Price Display
- Numeric value for calculations: `1250000`
- Display format for humans: `"$1,250,000"`
- Currency code for internationalization: `"USD"`

## Acceptance Criteria Met

✅ **Criterion 1**: Updating an event with price results in Firestore-stored event containing both `flypost.listPrice` and `offers.price`
- Parser extracts price and populates flypost.listPrice*
- Post-processing automatically derives offers object
- Both stored in Firestore

✅ **Criterion 2**: Concierge stops claiming verified record has no price when price is in submission
- extractPriceInfo() checks flypost.listPrice first (highest priority)
- Falls back to offers.price if flypost.listPrice not present
- Only uses description parsing as last resort with "inferred" confidence
- System prompt instructs AI to use price data correctly

✅ **Criterion 3**: Existing events remain valid; only new writes/updates add listPrice fields
- All price fields are optional
- Schema validation passes for events without price
- Backward compatibility tests confirm no breaking changes

## Testing Commands

```bash
# Run all price-related tests
cd backend
node test-price-persistence.js
node test-parser-price-normalization.js
node test-price-integration.js

# Run existing tests to verify no regressions
node test-schema-flexibility.js
node test-routes-validation.js
```

## Future Enhancements

Potential improvements for future iterations:
- Support for price ranges (min/max)
- Price history tracking
- Additional price types (asking price, sold price, etc.)
- Multi-currency conversions
- Price per square foot calculations
- Comparative market analysis integration

## Migration Notes

No migration required for existing data:
- Old events without price continue to work
- New events can include price
- Concierge handles both cases gracefully
- No schema version bump needed (optional fields only)
