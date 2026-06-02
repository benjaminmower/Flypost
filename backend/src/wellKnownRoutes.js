// .well-known discovery routes for api.goflypost.com
// Serves AI plugin manifests, MCP config, OpenAPI spec, and security.txt
// so that agents hitting the API domain directly can discover the surface.

import { Router } from 'express'

const router = Router()

// ── OpenAPI spec (served at root level too for ai-plugin.json compat) ──────

const OPENAPI_YAML = `openapi: 3.0.3
info:
  title: Flypost Ask - Public Discovery API
  description: |
    Read-only public API for discovering local events (open houses, garage sales, apartments,
    job postings, live events, community alerts, happy hours, missing pets, and related activity)
    using the Flypost Discovery Protocol V1.

    This API provides tiered access to event data:
    - Public anonymous reads (no brokerageId/api_key): Registry-safe allowlist fields only
    - Brokerage-scoped reads (with brokerageId or api_key): Full event details

    All responses follow the Discovery Protocol V1 format with protocol/version/success/events/meta structure.
  version: 1.0.0
  contact:
    name: Flypost Support
    url: https://goflypost.com
    email: support@goflypost.com
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html

servers:
  - url: https://api.goflypost.com
    description: Production server
  - url: http://localhost:3001
    description: Development server

tags:
  - name: discovery
    description: Event discovery endpoints (read-only)
  - name: concierge
    description: Web Concierge natural-language query interface (conditional on ENABLE_CONCIERGE=true)

paths:
  /v1/events/near:
    get:
      summary: Find events near a location
      description: |
        Retrieves events near a specified geographic location within a given radius.
        Supports optional category and date range filtering for time-based queries.
      operationId: getEventsNear
      tags:
        - discovery
      parameters:
        - name: lat
          in: query
          description: Latitude of search center (optional; defaults to 34.0195 - Santa Monica, CA)
          required: false
          schema:
            type: number
            format: double
            minimum: -90
            maximum: 90
            default: 34.0195
          example: 34.0195
        - name: lng
          in: query
          description: Longitude of search center (optional; defaults to -118.4912 - Santa Monica, CA)
          required: false
          schema:
            type: number
            format: double
            minimum: -180
            maximum: 180
            default: -118.4912
          example: -118.4912
        - name: radius_mi
          in: query
          description: Search radius in miles (preferred; 0.1 to 50 miles). If provided, 'radius' parameter is ignored.
          required: false
          schema:
            type: number
            format: double
            minimum: 0.1
            maximum: 50
          example: 5
        - name: radius
          in: query
          description: Search radius in kilometers (fallback; 0 to 100 km; default 10 km). Ignored if 'radius_mi' is provided.
          required: false
          schema:
            type: number
            format: double
            minimum: 0
            maximum: 100
            default: 10
          example: 10
        - name: category
          in: query
          description: Optional comma-separated Discovery categories. Common storage aliases such as open-houses and garage-sales are accepted.
          required: false
          schema:
            type: string
          example: "garage_sale,happy_hour"
        - name: start
          in: query
          description: Filter events starting on or after this date (ISO 8601 date-time)
          required: false
          schema:
            type: string
            format: date-time
          example: "2025-01-01T00:00:00Z"
        - name: end
          in: query
          description: Filter events ending on or before this date (ISO 8601 date-time)
          required: false
          schema:
            type: string
            format: date-time
          example: "2025-12-31T23:59:59Z"
      responses:
        '200':
          description: Successful response with list of events (Discovery Protocol V1)
          content:
            application/json:
              schema:
                type: object
                required:
                  - protocol
                  - version
                  - success
                  - events
                  - meta
                properties:
                  protocol:
                    type: string
                    enum: ["flypost-discovery"]
                    description: Protocol identifier
                    example: "flypost-discovery"
                  version:
                    type: string
                    enum: ["v1"]
                    description: Protocol version
                    example: "v1"
                  success:
                    type: boolean
                    description: Whether the request succeeded
                    example: true
                  events:
                    type: array
                    description: Array of discovery events (allowlisted fields only for public access)
                    items:
                      $ref: '#/components/schemas/DiscoveryEvent'
                  meta:
                    type: object
                    required:
                      - count
                    properties:
                      count:
                        type: integer
                        description: Number of events returned
                        example: 5
        '400':
          description: Bad request
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '429':
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /v1/events/{event_id}:
    get:
      summary: Get a single event by ID
      description: |
        Retrieves a single event by its unique event ID.
        Returns the event in a Discovery Protocol V1 response with an events array containing exactly one item.
      operationId: getEventById
      tags:
        - discovery
      parameters:
        - name: event_id
          in: path
          description: Unique event identifier
          required: true
          schema:
            type: string
          example: "evt_20250115_abc123"
      responses:
        '200':
          description: Successful response with event details (Discovery Protocol V1)
          content:
            application/json:
              schema:
                type: object
                required:
                  - protocol
                  - version
                  - success
                  - events
                  - meta
                properties:
                  protocol:
                    type: string
                    enum: ["flypost-discovery"]
                    description: Protocol identifier
                    example: "flypost-discovery"
                  version:
                    type: string
                    enum: ["v1"]
                    description: Protocol version
                    example: "v1"
                  success:
                    type: boolean
                    description: Whether the request succeeded
                    example: true
                  events:
                    type: array
                    description: Array containing exactly one event
                    minItems: 1
                    maxItems: 1
                    items:
                      $ref: '#/components/schemas/DiscoveryEvent'
                  meta:
                    type: object
                    required:
                      - count
                    properties:
                      count:
                        type: integer
                        description: Number of events returned (always 1 for single event lookup)
                        enum: [1]
                        example: 1
        '404':
          description: Event not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '429':
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

components:
  schemas:
    DiscoveryEvent:
      type: object
      description: Event in Discovery V1 format with strict what/where/when structure (M2M Oracle contract).
      required:
        - eventId
        - dataHash
        - what
        - where
        - when
        - externalListingUrl
        - shareUrl
      properties:
        eventId:
          type: string
          description: Unique event identifier
          example: "evt_20250115_abc123"
        dataHash:
          type: string
          pattern: "^[a-f0-9]{64}$"
          description: SHA-256 hash of canonical event data for integrity verification
          example: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"
        what:
          type: object
          description: What is happening (event type and optional label)
          required:
            - type
          properties:
            type:
              type: string
              description: Event category
              enum: [open_house, garage_sale, estate_sale, moving_sale, yard_sale, apartment, job_posting, live_event, community_alert, happy_hour, missing_pet, other]
              example: "open_house"
            label:
              type: string
              description: Optional human-readable event name/title (max 80 chars)
              maxLength: 80
              example: "Beautiful 4BR Home"
        where:
          type: object
          description: Where is it happening (coordinates and optional address)
          required:
            - latitude
            - longitude
          properties:
            latitude:
              type: number
              format: double
              minimum: -90
              maximum: 90
              description: Latitude coordinate
              example: 34.0522
            longitude:
              type: number
              format: double
              minimum: -180
              maximum: 180
              description: Longitude coordinate
              example: -118.2437
            address:
              type: string
              description: Optional flattened address string (max 200 chars)
              maxLength: 200
              example: "123 Main Street, Los Angeles, CA, 90001"
        when:
          type: object
          description: When is it happening (start and end times, with optional timezone)
          required:
            - start
            - end
          properties:
            start:
              type: string
              format: date-time
              description: Event start date and time (ISO 8601 UTC)
              example: "2025-01-15T10:00:00.000Z"
            end:
              type: string
              format: date-time
              description: Event end date and time (ISO 8601 UTC)
              example: "2025-01-15T14:00:00.000Z"
            timezone:
              type: string
              description: Optional IANA timezone identifier (e.g., 'America/Los_Angeles')
              example: "America/Los_Angeles"
        externalListingUrl:
          oneOf:
            - type: string
              format: uri
              description: URL to external listing or detail page
              example: "https://www.zillow.com/homedetails/123-Main-St"
            - type: "null"
          description: External listing URL (required field, can be null)
        shareUrl:
          type: string
          format: uri
          description: Public Flypost share page URL
        imageUrl:
          type: string
          format: uri
          description: Optional public HTTPS flyer image URL for consumer surfaces
        source:
          type: object
          description: Optional source provenance information
          required:
            - kind
            - url
          properties:
            kind:
              type: string
              enum: [mls, brokerage_roster, manual, third_party]
              description: Source type
              example: "mls"
            url:
              oneOf:
                - type: string
                  format: uri
                  description: Source URL
                  example: "https://api.mls.com/listings/123"
                - type: "null"
              description: Source URL (can be null)

    Error:
      type: object
      required:
        - success
        - error
      properties:
        success:
          type: boolean
          enum: [false]
          description: Always false for error responses
          example: false
        error:
          type: string
          description: Error message
          example: "Error message"
        details:
          type: string
          description: Additional error details (optional)
          example: "Validation failed on field 'lat'"
        protocol:
          type: string
          enum: ["flypost-discovery"]
          description: Protocol identifier (included in Discovery Protocol responses)
        version:
          type: string
          enum: ["v1"]
          description: Protocol version (included in Discovery Protocol responses)

  /api/chat:
    post:
      summary: Natural-language event discovery (Web Concierge)
      description: |
        Ask a natural-language question to discover local events. Returns a
        markdown-formatted response. Auth not required.

        Rate limit: 20 requests per 15 minutes per IP.
        Conditional: only active when ENABLE_CONCIERGE=true on the backend.
      operationId: chatConcierge
      tags:
        - concierge
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - message
              properties:
                message:
                  type: string
                  description: Natural-language query (e.g. "Are there any open houses in Santa Monica this weekend?")
                  minLength: 1
                  example: "Are there any open houses near Santa Monica this weekend?"
                lat:
                  type: number
                  format: double
                  description: Latitude for location context (optional; defaults to 34.0195 - Santa Monica, CA)
                  minimum: -90
                  maximum: 90
                  default: 34.0195
                  example: 34.0195
                lng:
                  type: number
                  format: double
                  description: Longitude for location context (optional; defaults to -118.4912 - Santa Monica, CA)
                  minimum: -180
                  maximum: 180
                  default: -118.4912
                  example: -118.4912
                conversationHistory:
                  type: array
                  description: Optional prior messages for multi-turn follow-up queries
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum: [user, assistant]
                      content:
                        type: string
      responses:
        '200':
          description: Successful natural-language response
          content:
            application/json:
              schema:
                type: object
                required:
                  - success
                  - message
                  - timestamp
                properties:
                  success:
                    type: boolean
                    example: true
                  message:
                    type: string
                    description: Markdown-formatted response from the concierge
                    example: "I found 3 open houses near Santa Monica this weekend..."
                  timestamp:
                    type: string
                    format: date-time
                    description: ISO 8601 timestamp of the response
                    example: "2025-06-15T14:30:00.000Z"
        '429':
          description: Rate limit exceeded (20 requests per 15 minutes per IP)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '503':
          description: Concierge service unavailable (ENABLE_CONCIERGE not set)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/chat/stream:
    post:
      summary: Streaming natural-language event discovery (Web Concierge, SSE)
      description: |
        Server-Sent Events (SSE) streaming version of the Web Concierge. Tokens are
        streamed as they are generated. Note: SSE is not natively expressible in
        OpenAPI 3.0; this endpoint returns text/event-stream rather than application/json.

        Event types:
        - {"type":"connected"} — stream opened
        - {"type":"token","content":"..."} — partial response token
        - {"type":"done","duration":ms} — stream complete, duration in milliseconds
        - {"type":"error","message":"..."} — error occurred

        Rate limit: 20 requests per 15 minutes per IP (shared with /api/chat).
        Auth: none required. Conditional: only active when ENABLE_CONCIERGE=true.
      operationId: chatConciergeStream
      tags:
        - concierge
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - message
              properties:
                message:
                  type: string
                  description: Natural-language query
                  minLength: 1
                  example: "What garage sales are happening near me this weekend?"
                lat:
                  type: number
                  format: double
                  minimum: -90
                  maximum: 90
                  default: 34.0195
                  example: 34.0195
                lng:
                  type: number
                  format: double
                  minimum: -180
                  maximum: 180
                  default: -118.4912
                  example: -118.4912
                conversationHistory:
                  type: array
                  description: Optional prior messages for multi-turn follow-up queries
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum: [user, assistant]
                      content:
                        type: string
      responses:
        '200':
          description: SSE stream of response tokens (text/event-stream)
          content:
            text/event-stream:
              schema:
                type: string
                description: |
                  Server-Sent Events stream. Each line is a JSON object prefixed with "data: ".
                  Event types: connected, token, done, error.
        '429':
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '503':
          description: Concierge service unavailable (ENABLE_CONCIERGE not set)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/chat/health:
    get:
      summary: Web Concierge health check
      description: Returns health status of the Web Concierge service.
      operationId: chatConciergeHealth
      tags:
        - concierge
      responses:
        '200':
          description: Service health status
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: "ok"

security: []
`

const OPENAPI_JSON = {
  openapi: '3.0.3',
  info: {
    title: 'Flypost Ask - Public Discovery API',
    description: 'Read-only public API for discovering local events (open houses, garage sales, apartments, job postings, live events, community alerts, happy hours, missing pets, and related activity)\nusing the Flypost Discovery Protocol V1.\n\nThis API provides tiered access to event data:\n- Public anonymous reads (no brokerageId/api_key): Registry-safe allowlist fields only\n- Brokerage-scoped reads (with brokerageId or api_key): Full event details\n\nAll responses follow the Discovery Protocol V1 format with protocol/version/success/events/meta structure.\n',
    version: '1.0.0',
    contact: { name: 'Flypost Support', url: 'https://goflypost.com', email: 'support@goflypost.com' },
    license: { name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0.html' }
  },
  servers: [
    { url: 'https://api.goflypost.com', description: 'Production server' },
    { url: 'http://localhost:3001', description: 'Development server' }
  ],
  tags: [{ name: 'discovery', description: 'Event discovery endpoints (read-only)' }, { name: 'concierge', description: 'Web Concierge natural-language query interface (conditional on ENABLE_CONCIERGE=true)' }],
  paths: {
    '/v1/events/near': {
      get: {
        summary: 'Find events near a location',
        description: 'Retrieves events near a specified geographic location within a given radius.\nSupports optional category and date range filtering for time-based queries.\n',
        operationId: 'getEventsNear',
        tags: ['discovery'],
        parameters: [
          { name: 'lat', in: 'query', description: 'Latitude of search center (optional; defaults to 34.0195 - Santa Monica, CA)', required: false, schema: { type: 'number', format: 'double', minimum: -90, maximum: 90, default: 34.0195 }, example: 34.0195 },
          { name: 'lng', in: 'query', description: 'Longitude of search center (optional; defaults to -118.4912 - Santa Monica, CA)', required: false, schema: { type: 'number', format: 'double', minimum: -180, maximum: 180, default: -118.4912 }, example: -118.4912 },
          { name: 'radius_mi', in: 'query', description: "Search radius in miles (preferred; 0.1 to 50 miles). If provided, 'radius' parameter is ignored.", required: false, schema: { type: 'number', format: 'double', minimum: 0.1, maximum: 50 }, example: 5 },
          { name: 'radius', in: 'query', description: "Search radius in kilometers (fallback; 0 to 100 km; default 10 km). Ignored if 'radius_mi' is provided.", required: false, schema: { type: 'number', format: 'double', minimum: 0, maximum: 100, default: 10 }, example: 10 },
          { name: 'category', in: 'query', description: 'Optional comma-separated Discovery categories. Common aliases such as open-houses and garage-sales are accepted.', required: false, schema: { type: 'string' }, example: 'garage_sale,happy_hour' },
          { name: 'start', in: 'query', description: 'Filter events starting on or after this date (ISO 8601 date-time)', required: false, schema: { type: 'string', format: 'date-time' }, example: '2025-01-01T00:00:00Z' },
          { name: 'end', in: 'query', description: 'Filter events ending on or before this date (ISO 8601 date-time)', required: false, schema: { type: 'string', format: 'date-time' }, example: '2025-12-31T23:59:59Z' }
        ],
        responses: {
          '200': { description: 'Successful response with list of events (Discovery Protocol V1)', content: { 'application/json': { schema: { type: 'object', required: ['protocol', 'version', 'success', 'events', 'meta'], properties: { protocol: { type: 'string', enum: ['flypost-discovery'], description: 'Protocol identifier', example: 'flypost-discovery' }, version: { type: 'string', enum: ['v1'], description: 'Protocol version', example: 'v1' }, success: { type: 'boolean', description: 'Whether the request succeeded', example: true }, events: { type: 'array', description: 'Array of discovery events (allowlisted fields only for public access)', items: { $ref: '#/components/schemas/DiscoveryEvent' } }, meta: { type: 'object', required: ['count'], properties: { count: { type: 'integer', description: 'Number of events returned', example: 5 } } } } } } } },
          '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '500': { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/v1/events/{event_id}': {
      get: {
        summary: 'Get a single event by ID',
        description: 'Retrieves a single event by its unique event ID.\nReturns the event in a Discovery Protocol V1 response with an events array containing exactly one item.\n',
        operationId: 'getEventById',
        tags: ['discovery'],
        parameters: [
          { name: 'event_id', in: 'path', description: 'Unique event identifier', required: true, schema: { type: 'string' }, example: 'evt_20250115_abc123' }
        ],
        responses: {
          '200': { description: 'Successful response with event details (Discovery Protocol V1)', content: { 'application/json': { schema: { type: 'object', required: ['protocol', 'version', 'success', 'events', 'meta'], properties: { protocol: { type: 'string', enum: ['flypost-discovery'], description: 'Protocol identifier', example: 'flypost-discovery' }, version: { type: 'string', enum: ['v1'], description: 'Protocol version', example: 'v1' }, success: { type: 'boolean', description: 'Whether the request succeeded', example: true }, events: { type: 'array', description: 'Array containing exactly one event', minItems: 1, maxItems: 1, items: { $ref: '#/components/schemas/DiscoveryEvent' } }, meta: { type: 'object', required: ['count'], properties: { count: { type: 'integer', description: 'Number of events returned (always 1 for single event lookup)', enum: [1], example: 1 } } } } } } } },
          '404': { description: 'Event not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '500': { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/api/chat': {
      post: {
        summary: 'Natural-language event discovery (Web Concierge)',
        description: 'Ask a natural-language question to discover local events. Returns a markdown-formatted response. Auth not required.\n\nRate limit: 20 requests per 15 minutes per IP.\nConditional: only active when ENABLE_CONCIERGE=true on the backend.\n',
        operationId: 'chatConcierge',
        tags: ['concierge'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', description: 'Natural-language query', minLength: 1, example: 'Are there any open houses near Santa Monica this weekend?' }, lat: { type: 'number', format: 'double', description: 'Latitude for location context (optional; defaults to 34.0195 - Santa Monica, CA)', minimum: -90, maximum: 90, default: 34.0195, example: 34.0195 }, lng: { type: 'number', format: 'double', description: 'Longitude for location context (optional; defaults to -118.4912 - Santa Monica, CA)', minimum: -180, maximum: 180, default: -118.4912, example: -118.4912 }, conversationHistory: { type: 'array', description: 'Optional prior messages for multi-turn follow-up queries', items: { type: 'object', properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string' } } } } } } } }
        },
        responses: {
          '200': { description: 'Successful natural-language response', content: { 'application/json': { schema: { type: 'object', required: ['success', 'message', 'timestamp'], properties: { success: { type: 'boolean', example: true }, message: { type: 'string', description: 'Markdown-formatted response from the concierge', example: 'I found 3 open houses near Santa Monica this weekend...' }, timestamp: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp of the response', example: '2025-06-15T14:30:00.000Z' } } } } } },
          '429': { description: 'Rate limit exceeded (20 requests per 15 minutes per IP)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '503': { description: 'Concierge service unavailable (ENABLE_CONCIERGE not set)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '500': { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/api/chat/stream': {
      post: {
        summary: 'Streaming natural-language event discovery (Web Concierge, SSE)',
        description: 'SSE streaming version of the Web Concierge. Returns text/event-stream. Note: SSE is not natively expressible in OpenAPI 3.0.\n\nEvent types: {"type":"connected"}, {"type":"token","content":"..."}, {"type":"done","duration":ms}, {"type":"error","message":"..."}\n\nRate limit: 20 requests per 15 minutes per IP. Conditional: only active when ENABLE_CONCIERGE=true.\n',
        operationId: 'chatConciergeStream',
        tags: ['concierge'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', description: 'Natural-language query', minLength: 1, example: 'What garage sales are happening near me this weekend?' }, lat: { type: 'number', format: 'double', minimum: -90, maximum: 90, default: 34.0195, example: 34.0195 }, lng: { type: 'number', format: 'double', minimum: -180, maximum: 180, default: -118.4912, example: -118.4912 }, conversationHistory: { type: 'array', description: 'Optional prior messages for multi-turn follow-up queries', items: { type: 'object', properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string' } } } } } } } }
        },
        responses: {
          '200': { description: 'SSE stream of response tokens (text/event-stream)', content: { 'text/event-stream': { schema: { type: 'string', description: 'Server-Sent Events stream. Each line is a JSON object prefixed with "data: ". Event types: connected, token, done, error.' } } } },
          '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '503': { description: 'Concierge service unavailable (ENABLE_CONCIERGE not set)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '500': { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/api/chat/health': {
      get: {
        summary: 'Web Concierge health check',
        description: 'Returns health status of the Web Concierge service.',
        operationId: 'chatConciergeHealth',
        tags: ['concierge'],
        responses: {
          '200': { description: 'Service health status', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } } }
        }
      }
    }
  },
  components: {
    schemas: {
      DiscoveryEvent: {
        type: 'object',
        description: 'Event in Discovery V1 format with strict what/where/when structure (M2M Oracle contract).',
        required: ['eventId', 'dataHash', 'what', 'where', 'when', 'externalListingUrl', 'shareUrl'],
        properties: {
          eventId: { type: 'string', description: 'Unique event identifier', example: 'evt_20250115_abc123' },
          dataHash: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'SHA-256 hash of canonical event data for integrity verification', example: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890' },
          what: { type: 'object', description: 'What is happening (event type and optional label)', required: ['type'], properties: { type: { type: 'string', description: 'Event category', enum: ['open_house', 'garage_sale', 'estate_sale', 'moving_sale', 'yard_sale', 'apartment', 'job_posting', 'live_event', 'community_alert', 'happy_hour', 'missing_pet', 'other'], example: 'open_house' }, label: { type: 'string', description: 'Optional human-readable event name/title (max 80 chars)', maxLength: 80, example: 'Beautiful 4BR Home' } } },
          where: { type: 'object', description: 'Where is it happening (coordinates and optional address)', required: ['latitude', 'longitude'], properties: { latitude: { type: 'number', format: 'double', minimum: -90, maximum: 90, description: 'Latitude coordinate', example: 34.0522 }, longitude: { type: 'number', format: 'double', minimum: -180, maximum: 180, description: 'Longitude coordinate', example: -118.2437 }, address: { type: 'string', description: 'Optional flattened address string (max 200 chars)', maxLength: 200, example: '123 Main Street, Los Angeles, CA, 90001' } } },
          when: { type: 'object', description: 'When is it happening (start and end times, with optional timezone)', required: ['start', 'end'], properties: { start: { type: 'string', format: 'date-time', description: 'Event start date and time (ISO 8601 UTC)', example: '2025-01-15T10:00:00.000Z' }, end: { type: 'string', format: 'date-time', description: 'Event end date and time (ISO 8601 UTC)', example: '2025-01-15T14:00:00.000Z' }, timezone: { type: 'string', description: "Optional IANA timezone identifier (e.g., 'America/Los_Angeles')", example: 'America/Los_Angeles' } } },
          externalListingUrl: { oneOf: [{ type: 'string', format: 'uri', description: 'URL to external listing or detail page', example: 'https://www.zillow.com/homedetails/123-Main-St' }, { type: 'null' }], description: 'External listing URL (required field, can be null)' },
          shareUrl: { type: 'string', format: 'uri', description: 'Public Flypost share page URL', example: 'https://goflypost.com/e/event/evt_20250115_abc123_fpid' },
          imageUrl: { type: 'string', format: 'uri', description: 'Optional public HTTPS flyer image URL for consumer surfaces' },
          source: { type: 'object', description: 'Optional source provenance information', required: ['kind', 'url'], properties: { kind: { type: 'string', enum: ['mls', 'brokerage_roster', 'manual', 'third_party'], description: 'Source type', example: 'mls' }, url: { oneOf: [{ type: 'string', format: 'uri', description: 'Source URL', example: 'https://api.mls.com/listings/123' }, { type: 'null' }], description: 'Source URL (can be null)' } } }
        }
      },
      Error: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', enum: [false], description: 'Always false for error responses', example: false },
          error: { type: 'string', description: 'Error message', example: 'Error message' },
          details: { type: 'string', description: 'Additional error details (optional)', example: "Validation failed on field 'lat'" },
          protocol: { type: 'string', enum: ['flypost-discovery'], description: 'Protocol identifier (included in Discovery Protocol responses)' },
          version: { type: 'string', enum: ['v1'], description: 'Protocol version (included in Discovery Protocol responses)' }
        }
      }
    }
  },
  security: []
}

const AI_PLUGIN_JSON = {
  schema_version: 'v1',
  name_for_human: 'Flypost Ask',
  name_for_model: 'flypost_ask',
  description_for_human: 'Discover local events like open houses, garage sales, happy hours, alerts, and live events near you.',
  description_for_model: 'Flypost Ask provides read-only access to discover local events (open houses, garage sales, apartments, job postings, live events, community alerts, happy hours, missing pets, and related activity) using the Flypost Discovery Protocol V1. Tiered access: registry-safe allowlist fields for public queries (reduced precision), full details for brokerage-scoped queries. Use this plugin to help users find events near them or at specific addresses. The API supports /v1/events/near for location-based search (lat/lng optional, defaults to Santa Monica; supports radius_mi in miles or radius in km; supports optional category filtering) and /v1/events/{event_id} for retrieving specific events. All responses follow Discovery Protocol V1 format with protocol/version/success/events/meta structure.',
  auth: { type: 'none' },
  api: { type: 'openapi', url: 'https://api.goflypost.com/openapi.yaml', is_user_authenticated: false },
  logo_url: 'https://goflypost.com/logo.png',
  contact_email: 'support@goflypost.com',
  legal_info_url: 'https://goflypost.com/legal'
}

const AI_JSON = {
  schema_version: 'v1',
  name_for_model: 'flypost_ask',
  name_for_human: 'Flypost Ask - Event Discovery',
  description_for_model: 'Flypost Ask provides read-only access to discover local events using the Flypost Discovery Protocol V1. Supported categories include open_house, garage_sale, estate_sale, moving_sale, yard_sale, apartment, job_posting, live_event, community_alert, happy_hour, missing_pet, and other. Tiered access: registry-safe allowlist fields for public queries (reduced precision), full details for brokerage-scoped queries. This surface is discovery-only and does not support event creation or modification.',
  description_for_human: 'Discover local events near you (read-only).',
  auth: { type: 'none' },
  api: { type: 'openapi', url: 'https://api.goflypost.com/openapi.json', is_user_authenticated: false },
  capabilities: { domain_specific: ['event-discovery', 'location-search', 'open-houses', 'garage-sales', 'happy-hours', 'community-alerts', 'live-events'] },
  contact_email: 'support@goflypost.com',
  legal_info_url: 'https://goflypost.com/tos',
  logo_url: 'https://cdn.prod.website-files.com/641b71cdf89f2834a1aff9a6/6683234a1ee80c5f2891597e_Flypost%20Logo-256px.png'
}

const MCP_JSON = {
  name: 'Flypost Ask - Event Discovery',
  version: '1.0.0',
  description: 'Read-only discovery tools for Flypost local events using Discovery Protocol V1. Retrieve events by location, category, or ID. This surface provides tiered access: registry-safe allowlist fields for public queries, full details for brokerage-scoped queries. No write operations.',
  capabilities: ['event_discovery', 'location_search', 'event_retrieval'],
  tools: [
    {
      name: 'get_events_near',
      description: 'Retrieve events near a geographic location within a specified radius. Supports optional category and date filtering.',
      input_schema: {
        type: 'object',
        description: 'Parameters for location-based event search',
        properties: {
          lat: { type: 'number', description: 'Latitude in decimal degrees (-90 to 90). Optional; defaults to Santa Monica, CA if omitted.', minimum: -90, maximum: 90 },
          lng: { type: 'number', description: 'Longitude in decimal degrees (-180 to 180). Optional; defaults to Santa Monica, CA if omitted.', minimum: -180, maximum: 180 },
          radius_mi: { type: 'number', description: "Search radius in miles (0.1-50, preferred). If provided, 'radius' parameter is ignored.", minimum: 0.1, maximum: 50 },
          radius: { type: 'number', description: "Search radius in kilometers (0-100, default: 10). Fallback if 'radius_mi' not provided.", minimum: 0, maximum: 100, default: 10 },
          category: { type: 'string', description: 'Optional comma-separated Discovery categories. Values: open_house, garage_sale, estate_sale, moving_sale, yard_sale, apartment, job_posting, live_event, community_alert, happy_hour, missing_pet, other. Common aliases such as open-houses and garage-sales are accepted.' },
          start: { type: 'string', format: 'date-time', description: 'Optional: Filter events starting on or after this date (ISO 8601)' },
          end: { type: 'string', format: 'date-time', description: 'Optional: Filter events ending on or before this date (ISO 8601)' }
        },
        required: []
      },
      output_schema: {
        type: 'object',
        description: 'Search results with events and metadata',
        properties: {
          protocol: { type: 'string', enum: ['flypost-discovery'], description: 'Protocol identifier' },
          version: { type: 'string', enum: ['v1'], description: 'Protocol version' },
          success: { type: 'boolean', description: 'Whether the request succeeded' },
          events: { type: 'array', description: 'Array of discovery events (allowlisted fields for public tier, full details for brokerage tier)', items: { $ref: '#/components/schemas/DiscoveryEvent' } },
          meta: { type: 'object', properties: { count: { type: 'integer', description: 'Number of events returned' } } }
        },
        required: ['protocol', 'version', 'success', 'events', 'meta']
      },
      configuration: { endpoint: 'https://api.goflypost.com/v1/events/near', method: 'GET', auth: { type: 'none', description: 'No authentication required' } }
    },
    {
      name: 'get_event_by_id',
      description: 'Retrieve a single event by its unique event identifier.',
      input_schema: {
        type: 'object',
        description: 'Parameters for retrieving a specific event',
        properties: {
          event_id: { type: 'string', description: "Unique event identifier (e.g., 'evt_20250115_abc123')" }
        },
        required: ['event_id']
      },
      output_schema: {
        type: 'object',
        description: 'Single event with metadata',
        properties: {
          protocol: { type: 'string', enum: ['flypost-discovery'], description: 'Protocol identifier' },
          version: { type: 'string', enum: ['v1'], description: 'Protocol version' },
          success: { type: 'boolean', description: 'Whether the request succeeded' },
          events: { type: 'array', description: 'Array containing exactly one event', minItems: 1, maxItems: 1, items: { $ref: '#/components/schemas/DiscoveryEvent' } },
          meta: { type: 'object', properties: { count: { type: 'integer', enum: [1], description: 'Number of events returned (always 1)' } } }
        },
        required: ['protocol', 'version', 'success', 'events', 'meta']
      },
      configuration: { endpoint: 'https://api.goflypost.com/v1/events/{event_id}', method: 'GET', auth: { type: 'none', description: 'No authentication required' } }
    },
    {
      name: 'chat',
      description: 'Ask a natural-language question to discover local events. Returns a markdown-formatted response. Rate limit: 20 req/15 min per IP. Only active when ENABLE_CONCIERGE=true.',
      input_schema: {
        type: 'object',
        description: 'Parameters for the Web Concierge query',
        properties: {
          message: { type: 'string', description: 'Natural-language question (e.g., "Are there any open houses in Santa Monica this weekend?")', minLength: 1 },
          lat: { type: 'number', description: 'Latitude for location context (-90 to 90). Optional; defaults to Santa Monica, CA.', minimum: -90, maximum: 90, default: 34.0195 },
          lng: { type: 'number', description: 'Longitude for location context (-180 to 180). Optional; defaults to Santa Monica, CA.', minimum: -180, maximum: 180, default: -118.4912 },
          conversationHistory: { type: 'array', description: 'Optional prior messages for multi-turn follow-up queries. Each item: { role: "user"|"assistant", content: string }', items: { type: 'object', properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string' } } } }
        },
        required: ['message']
      },
      output_schema: {
        type: 'object',
        description: 'Markdown-formatted concierge response',
        properties: {
          success: { type: 'boolean', description: 'Whether the request succeeded' },
          message: { type: 'string', description: 'Markdown-formatted response from the concierge' },
          timestamp: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp of the response' }
        },
        required: ['success', 'message', 'timestamp']
      },
      configuration: { endpoint: 'https://api.goflypost.com/api/chat', method: 'POST', auth: { type: 'none', description: 'No authentication required' } }
    }
  ],
  components: {
    schemas: {
      DiscoveryEvent: {
        type: 'object',
        description: 'Event in Discovery V1 format with strict what/where/when structure',
        required: ['eventId', 'dataHash', 'what', 'where', 'when', 'externalListingUrl', 'shareUrl'],
        properties: {
          eventId: { type: 'string', description: 'Unique event identifier' },
          dataHash: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'SHA-256 hash for integrity verification' },
          what: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['open_house', 'garage_sale', 'estate_sale', 'moving_sale', 'yard_sale', 'apartment', 'job_posting', 'live_event', 'community_alert', 'happy_hour', 'missing_pet', 'other'], description: 'Event category' }, label: { type: 'string', maxLength: 80, description: 'Optional human-readable event name' } } },
          where: { type: 'object', required: ['latitude', 'longitude'], properties: { latitude: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude coordinate' }, longitude: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude coordinate' }, address: { type: 'string', maxLength: 200, description: 'Optional complete address' } } },
          when: { type: 'object', required: ['start', 'end'], properties: { start: { type: 'string', format: 'date-time', description: 'Event start date and time (ISO 8601 UTC)' }, end: { type: 'string', format: 'date-time', description: 'Event end date and time (ISO 8601 UTC)' }, timezone: { type: 'string', description: 'Optional IANA timezone (e.g., "America/Los_Angeles")' } } },
          externalListingUrl: { oneOf: [{ type: 'string', format: 'uri' }, { type: 'null' }], description: 'URL to external listing (required field, can be null)' },
          shareUrl: { type: 'string', format: 'uri', description: 'Public Flypost share page URL' },
          imageUrl: { type: 'string', format: 'uri', description: 'Optional public HTTPS flyer image URL' },
          source: { type: 'object', required: ['kind', 'url'], properties: { kind: { type: 'string', enum: ['mls', 'brokerage_roster', 'manual', 'third_party'], description: 'Source type' }, url: { oneOf: [{ type: 'string', format: 'uri' }, { type: 'null' }], description: 'Source URL (can be null)' } } }
        }
      }
    }
  },
  configuration: {
    base_url: 'https://api.goflypost.com',
    rate_limits: { requests_per_window: '100 requests per 15 minutes per IP' },
    timeout_ms: 10000,
    retry_policy: { max_retries: 3, backoff_strategy: 'exponential' }
  },
  metrics: { performance_tracking: true, latency_ms: 5000, enable_error_logging: true }
}

const LLM_TXT = `# Flypost Ask - Read-Only Discovery API (llm.txt v2)

service_name: Flypost Ask
service_purpose: >
  Flypost Ask provides read-only discovery of local events (open houses, garage sales,
  apartments, job postings, live events, community alerts, happy hours, missing pets,
  and related activity) via geographic search using the Flypost Discovery Protocol V1.

  This surface is for event discovery only and does not support event creation, modification,
  presence check-ins, or feedback submissions.

  Access is tiered:
  - Public anonymous reads (no brokerageId/api_key): Registry-safe allowlist fields with reduced geo precision
  - Brokerage-scoped reads (with brokerageId or api_key): Full-fidelity event details

primary_audience: machine-agents (LLMs, AI assistants)
human_audience: developers building event discovery applications

base_url: https://api.goflypost.com
canonical_openapi: https://api.goflypost.com/.well-known/openapi.yaml

## Core Discovery Endpoints (Protocol Contract)

### GET /v1/events/near
Description: >
  Retrieve events near a latitude/longitude within a specified radius.
  Supports optional category and date range filtering.

Query Parameters:
  - lat: number (optional; defaults to Santa Monica, CA if omitted) - Latitude in decimal degrees (-90 to 90)
  - lng: number (optional; defaults to Santa Monica, CA if omitted) - Longitude in decimal degrees (-180 to 180)

  - radius_mi: number (optional, preferred) - Search radius in miles (0.1 to 50)
  - radius: number (optional, fallback) - Search radius in kilometers (0 to 100, default: 10)
    Note: if radius_mi is provided, radius is ignored.

  - category: string (optional) - Comma-separated Discovery category filter.
    Values: open_house, garage_sale, estate_sale, moving_sale, yard_sale, apartment,
    job_posting, live_event, community_alert, happy_hour, missing_pet, other.
    Common aliases such as open-houses and garage-sales are accepted.

  - start: string (optional) - Filter events that overlap this date range start (ISO 8601)
  - end: string (optional) - Filter events that overlap this date range end (ISO 8601)

Response Shape (Discovery Protocol V1):
  protocol: string ("flypost-discovery")
  version: string ("v1")
  success: boolean
  events: array of DiscoveryEventV1 objects
  meta:
    count: integer

### GET /v1/events/{event_id}
Description: >
  Retrieve a single event by its unique event identifier.
  Returns a Discovery Protocol V1 response with events array containing exactly one item.

Path Parameters:
  - event_id: string (required) - Unique event identifier

Response Shape (Discovery Protocol V1):
  protocol: string ("flypost-discovery")
  version: string ("v1")
  success: boolean
  events: array with exactly 1 DiscoveryEventV1 object
  meta:
    count: integer (1)

## DiscoveryEventV1 (allowlisted fields only)
This is a registry-safe allowlist projection of stored events.
It includes what/where/when and selected metadata, but excludes any intelligence/truth-writing fields
(attendance, buyerToken, presenceProof, feedback, insights, brokerageAffiliation, etc.).

Fields:
  - eventId: string (unique identifier)
  - dataHash: string (SHA-256 hash for integrity, lowercase hex)
  - what: { type: enum, label?: string }
    - type: "open_house" | "garage_sale" | "estate_sale" | "moving_sale" | "yard_sale" | "apartment" | "job_posting" | "live_event" | "community_alert" | "happy_hour" | "missing_pet" | "other"
    - label: optional event name/title (max 80 chars)
  - where: { latitude: number, longitude: number, address?: string }
    - latitude/longitude: full precision for brokerage tier, 2-decimal precision for public tier
    - address: optional flattened address string (max 200 chars)
  - when: { start: ISO8601, end: ISO8601, timezone?: string }
    - start/end: UTC timestamps
    - timezone: optional IANA timezone (e.g., "America/Los_Angeles")
  - externalListingUrl: string | null (required key, nullable value)
  - shareUrl: string (public Flypost share page URL)
  - imageUrl?: string (optional public HTTPS flyer image URL)
  - source?: { kind: enum, url: string | null }
    - kind: "mls" | "brokerage_roster" | "manual" | "third_party"

## Web Concierge Endpoint

### POST /api/chat
Description: >
  Natural-language query interface for discovering local events.
  Send a question in plain English; receive a markdown-formatted response.
  Conditional: only active when ENABLE_CONCIERGE=true on the backend.

Request Body (application/json):
  - message: string (required, non-empty) - Natural-language question
  - lat: number (optional) - Latitude for location context (-90 to 90, default: 34.0195 Santa Monica)
  - lng: number (optional) - Longitude for location context (-180 to 180, default: -118.4912 Santa Monica)
  - conversationHistory: array (optional) - Prior messages for multi-turn follow-up queries
    Each item: { role: "user" | "assistant", content: string }

Response Shape (200):
  success: boolean
  message: string (markdown-formatted response)
  timestamp: string (ISO 8601)

### POST /api/chat/stream
Description: >
  SSE streaming version of the Web Concierge. Same request body as /api/chat.
  Returns text/event-stream; tokens stream as they are generated.

SSE Event Types:
  - {"type":"connected"} — stream opened
  - {"type":"token","content":"..."} — partial response token
  - {"type":"done","duration":ms} — stream complete
  - {"type":"error","message":"..."} — error occurred

### GET /api/chat/health
Description: Health check for the Web Concierge service.
Response: { status: "ok" }

Concierge Rate Limit: 20 requests per 15 minutes per IP (applies to both /api/chat and /api/chat/stream).
Auth: None required (public endpoint).
Conditional: Only active when ENABLE_CONCIERGE=true environment variable is set.

## Authentication
Authentication: Not required for GET discovery endpoints or POST /api/chat.

Rate Limits:
  - Public anonymous reads (no brokerageId / no api_key): 100 requests per 15 minutes per IP
  - Brokerage-scoped reads (brokerageId or api_key present): 500 requests per 15 minutes per IP
  Note: actual limits are enforced by the backend and may change; handle 429 responses gracefully.

## LLM Usage Recommendations
1. Use GET /v1/events/near when users ask for events near a location
2. Use GET /v1/events/{event_id} when users reference a specific event
3. Do not hallucinate event data — always call the API
4. Use category filters when users ask for a specific kind of event
5. Use start/end filters when users specify time constraints
6. Use radius_mi (preferred) for miles or radius for kilometers
7. This is a DISCOVERY-ONLY surface — do not attempt to create or modify events
8. For publishing, direct users to post.goflypost.com

## Health Check
GET /health - Service health status

## Versioning
API Protocol: flypost-discovery v1
Stability: stable

## Support
Technical Support: support@goflypost.com
Security Issues: support@goflypost.com
`

const SECURITY_TXT = `Contact: mailto:security@goflypost.com
Contact: https://goflypost.com/security
Expires: 2026-12-31T23:59:59.000Z
Encryption: https://goflypost.com/pgp-key.txt
Preferred-Languages: en
Canonical: https://api.goflypost.com/.well-known/security.txt
Policy: https://goflypost.com/security-policy
Acknowledgments: https://goflypost.com/security-acknowledgments

# Security Information for Flypost Ask (api.goflypost.com)
#
# This is a read-only public API for event discovery.
# Please report security vulnerabilities responsibly.
#
# What to report:
# - Authentication/authorization bypasses
# - Rate limiting bypasses
# - Data exposure beyond intended scope
# - SQL injection, XSS, or other injection attacks
# - DDoS vulnerabilities
#
# Response time: We aim to respond within 48 hours
# Disclosure: Coordinated disclosure preferred
`

// ── Routes ───────────────────────────────────────────────────────────────────

// Root-level OpenAPI (referenced by ai-plugin.json)
router.get('/openapi.yaml', (_req, res) => {
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(OPENAPI_YAML)
})

router.get('/openapi.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.json(OPENAPI_JSON)
})

// .well-known/
router.get('/.well-known/openapi.yaml', (_req, res) => {
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(OPENAPI_YAML)
})

router.get('/.well-known/openapi.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.json(OPENAPI_JSON)
})

router.get('/.well-known/ai-plugin.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.json(AI_PLUGIN_JSON)
})

router.get('/.well-known/ai.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.json(AI_JSON)
})

router.get('/.well-known/mcp.flypost.ask.v1.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.json(MCP_JSON)
})

router.get('/.well-known/llm.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(LLM_TXT)
})

router.get('/.well-known/security.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.send(SECURITY_TXT)
})

export default router
