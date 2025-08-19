# v4 Salvage Documentation

## Salvaged from v3.01

### Core Components Kept
1. **Schema**: `flypost-event.schema.json` (trimmed to essential fields)
2. **LLM Parser**: Single event parsing from `llmParserService.js` (batch removed)
3. **Validation**: AJV validation logic
4. **Firestore Utils**: Basic connection and document operations

### Essential Fields in Trimmed Schema
- `@context` and `@type` (JSON-LD)
- `flypost` metadata (eventId, category, timestamps, flags)
- `name` and `description`
- `startDate` (endDate optional)
- `location` with address (geo optional)
- `organizer` with name and email
- `keywords` (optional)

### Removed from Schema
- Complex image objects and gallery
- MLS integration fields
- Enhanced image metadata
- Performer arrays
- Advanced event status enums
- Accessibility fields
- Capacity limits

### Deferred Features (Documented in roadmap.md)

#### Complex Processing
- **Batch Processing**: Multiple event processing in single request
- **OCR Integration**: Image text extraction via Tesseract
- **Image Processing**: Upload, resize, and metadata extraction
- **Large Documents**: Multi-page document processing

#### API Management  
- **Webhooks**: Event notification system
- **API Keys**: Authentication and rate limiting per user
- **Advanced Search**: Elasticsearch integration
- **User Management**: Firebase Auth integration

#### Infrastructure
- **Queue System**: Bull/Redis for job processing
- **Monitoring**: Winston logging and health metrics
- **Security**: Helmet, input sanitization, CORS hardening
- **Performance**: Caching, compression, request optimization

#### Frontend Complexity
- **Multi-step Forms**: Complex event creation workflows
- **Image Upload UI**: Drag-drop, preview, crop functionality
- **User Dashboard**: Event management interface
- **Real-time Updates**: WebSocket connections

## Rationale for Minimal Approach
The v4 approach prioritizes getting the core event loop working with maximum simplicity:
1. **Single Event Focus**: Parse one event at a time
2. **Essential Schema**: Only required fields for basic functionality  
3. **In-Memory Storage**: Avoid database complexity initially
4. **Basic Frontend**: Textarea input → JSON output
5. **Core LLM Integration**: OpenAI GPT-4 parsing only

This allows rapid iteration on the fundamental value proposition before adding operational complexity.