# Flypost v4 API & Data Contract Decisions

## Decision Implementation Status

This document tracks the 8 key decisions mentioned in Issue #1 and their implementation status.

### ✅ Decision 1: Initial API Direction & Goals
- **Status**: ✅ Implemented  
- **Implementation**: `backend/src/server.js` - 3 core endpoints
- **Documentation**: `docs/api-specification.md` - Core Principles section
- **Testing**: All endpoints functional, passing integration tests

**Key Decisions:**
- Minimal surface area (3 endpoints only)
- Machine-to-machine focus  
- JSON-LD compliance with Schema.org
- Stateless request processing

---

### ✅ Decision 2: Event Ingest Shape & Normalization
- **Status**: ✅ Implemented
- **Implementation**: `backend/src/llmParser.js` - Natural language → JSON-LD
- **Documentation**: `docs/api-specification.md` - Decision 2 section  
- **Testing**: LLM parsing functional (requires OpenAI API key)

**Key Decisions:**
- Natural language text input
- OpenAI GPT-4 for parsing
- Schema.org Event structure output
- ISO 8601 date normalization
- Address → PostalAddress transformation

---

### ✅ Decision 3: /v1/events/near Endpoint Contract  
- **Status**: ✅ Implemented (MVP)
- **Implementation**: `backend/src/server.js` lines 107-136
- **Documentation**: `docs/api-specification.md` - Decision 3 section
- **Testing**: Endpoint functional, returns all events (naive implementation)

**Key Decisions:**
- Query parameters: lat, lng, radius
- Standard success response format
- MVP returns all events (geospatial filtering deferred)
- Descriptive note about current limitations

---

### ✅ Decision 4: Minimal Event Object Shape & JSON-LD Surface
- **Status**: ✅ Implemented
- **Implementation**: `backend/schemas/flypost-event-v4.schema.json`
- **Documentation**: `docs/event-model.md` + `docs/api-specification.md`
- **Testing**: Schema validation working, AJV integration complete

**Key Decisions:**
- Schema.org Event as base type
- Flypost extensions in `flypost` namespace
- Required vs optional field classification
- JSON-LD context consistency

---

### ✅ Decision 5: Stable Field Table (Required/Optional/Excluded)
- **Status**: ✅ Implemented  
- **Implementation**: `backend/schemas/flypost-event-v4.schema.json` - field constraints
- **Documentation**: `docs/api-specification.md` - Decision 5 section
- **Testing**: Field validation enforced by AJV

**Key Decisions:**
- 13 required fields including Flypost extensions
- 5 optional fields for enhanced data
- Explicit exclusion of complex v3 fields
- String length and format constraints

---

### ✅ Decision 6: Unified Error Format & Codes
- **Status**: ✅ Implemented
- **Implementation**: `backend/src/server.js` - consistent error responses
- **Documentation**: `docs/api-specification.md` - Decision 6 section
- **Testing**: Error format verified across endpoints

**Key Decisions:**
- Standard `{success, error, type}` response format
- HTTP status codes: 200, 400, 500
- Detailed validation errors with field-level information
- Error type classification

---

### ✅ Decision 7: Controlled Category Vocabulary & Synthetic Windows
- **Status**: ✅ Implemented
- **Implementation**: `backend/schemas/flypost-event-v4.schema.json` - enum constraint
- **Documentation**: `docs/api-specification.md` - Decision 7 section  
- **Testing**: Category validation enforced in schema

**Key Decisions:**
- 8 predefined categories (apartments, garage-sales, etc.)
- No custom categories in v4
- Synthetic time windows documented per category
- LLM selects appropriate category during parsing

---

### ✅ Decision 8: Slug Generation Algorithm  
- **Status**: ✅ Implemented
- **Implementation**: `backend/src/llmParser.js` line 97 - eventId generation
- **Documentation**: `docs/api-specification.md` - Decision 8 section
- **Testing**: EventId generation working in all flows

**Key Decisions:**  
- Format: `evt_{random}_{timestamp}`
- Base36 random component (9 chars)
- JavaScript timestamp for uniqueness
- Readable prefix for identification

---

## Future Decisions (Queued Implementation)

### 🚧 Health Endpoint Enhancement
- **Current**: Basic health check with storage stats
- **Planned**: Enhanced metrics, dependency checks
- **Priority**: Medium

### 📋 Schema Versioning  
- **Current**: Single v4 schema
- **Planned**: Version negotiation, backward compatibility  
- **Priority**: High for production

### 📋 Pagination
- **Current**: Returns all events  
- **Planned**: Limit/offset parameters, result metadata
- **Priority**: Medium

### 📋 Validation Taxonomy
- **Current**: Basic AJV error messages
- **Planned**: Categorized validation errors, error codes
- **Priority**: Low

### 📋 Logging & Metrics
- **Current**: Console logging only
- **Planned**: Structured logging, performance metrics
- **Priority**: High for production

### 📋 Accept Negotiation
- **Current**: JSON only
- **Planned**: Content-Type negotiation, multiple formats  
- **Priority**: Low

---

## Cross-References

### Implementation Files
- **Core Server**: `backend/src/server.js`
- **LLM Parser**: `backend/src/llmParser.js`  
- **Validation**: `backend/src/validation.js`
- **Storage**: `backend/src/storage.js`
- **Schema**: `backend/schemas/flypost-event-v4.schema.json`

### Documentation Files
- **API Specification**: `docs/api-specification.md`
- **Event Model**: `docs/event-model.md`
- **Deferred Features**: `docs/salvage.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`

### Test Files
- **Backend Tests**: `backend/test.js`
- **Frontend Integration**: `frontend/src/api.js`

---

## Implementation Verification

All 8 decisions have been implemented and are functional:

```bash
# Test core functionality
cd backend && npm test                    # ✅ 4/4 tests passing
curl http://localhost:3001/health         # ✅ Health endpoint working  
curl http://localhost:3001/v1/events/near # ✅ Query endpoint working
curl -X POST http://localhost:3001/api/parse-and-publish # ✅ Parse endpoint working
```

**Next Steps:**
1. Create sub-issues for each future decision area
2. Link this tracker to implementation PRs
3. Update as new decisions are finalized  
4. Track progress toward v4 production milestone

---

*This document serves as the master tracker referenced in Issue #1. Updates should be made as decisions are implemented or requirements change.*