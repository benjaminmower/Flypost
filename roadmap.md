# Flypost v4 Roadmap

## Phase 1: MVP Core (Current)
- [x] Basic directory structure
- [x] Minimal schema definition
- [ ] Single event LLM parser
- [ ] In-memory event storage
- [ ] 3 essential endpoints
- [ ] Basic frontend interface
- [ ] End-to-end validation

## Phase 2: Storage Integration
- [ ] Firestore connection
- [ ] Event persistence
- [ ] Basic querying

## Phase 3: Enhanced Querying
- [ ] Location-based filtering
- [ ] Time-based filtering
- [ ] Category filtering

## Phase 4: Production Readiness
- [ ] Error handling
- [ ] Logging
- [ ] Rate limiting
- [ ] CORS configuration

## Deferred Features (Parked)
- Batch processing
- OCR integration
- Image processing
- Webhooks
- API key management
- Advanced search
- User authentication
- Large document processing

## Known Issues
- In-memory storage is not persistent
- No authentication
- Basic error handling
- No rate limiting

## Success Metrics
- Parse → publish → query loop working
- 5+ events successfully processed
- Frontend integration functional