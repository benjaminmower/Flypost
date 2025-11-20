# GPT Actions library – Flypost
+
+## Application Information
+### Application Key Links
+- **Application Website (marketing):** https://goflypost.com
+- **Application Web App (MVP frontend):** https://flypost.netlify.app
+- **API base (Cloud Run proxy → backend):** https://proxyv4-a7jlfl42zq-uw.a.run.app
+  - If the Cloud Run proxy URL rotates, update this line.
+- **API Documentation / OpenAPI (served via frontend):** https://app.goflypost.com/openapi.json
+
+### Application Behavior
+Flypost indexes public, local, real-world events, with an initial focus on:
+- Open houses
+- Garage sales
+- Apartments for rent
+- Neighborhood & community events
+
+All events are stored using a canonical schema.org/Event format with added Flypost metadata:
+- Stable `flypost.eventId`
+- `submissionTimestamp`
+- `category` (open-houses, garage-sales, apartments, events)
+- SHA-256 cryptographic hash of canonical event payload (for integrity + verification)
+
+### Value + Example Business Use Cases
+#### Value
+- Flypost gives GPTs and downstream agents a single source of truth for local events, so users can ask things like:
+  - “What’s happening near me this weekend?”
+  - “Turn this caption into a structured open house and publish it.”
+- Agents & organizers can “post once” and publish everywhere (IG, FB, AI).
+
+#### Example Use Cases
+- Buyer query: “What open houses are happening near 90405 this weekend?” → GPT calls `flypost_events_near`.
+- Agent caption → structured event: “Open house Sunday 1–4pm at 2212 Ocean Park Blvd…” → GPT calls `flypost_parse_and_publish`.
+- Local business: “I’m hosting a kids’ workshop next Saturday – please post it.” → GPT parses + publishes → discoverable instantly.
+
+## Custom GPT Instructions
+Once you’ve created a Custom GPT, paste the following into the Instructions panel. This tells the model when and how to use Flypost:
+
+```text
+You are an assistant that specializes in local events using the Flypost API.
+
+Flypost has two key capabilities:
+1) Parse and publish events from natural language.
+2) Search for events near a given location.
+
+You have access to two actions:
+
+- flypost_parse_and_publish:
+  Use this when the user describes an event in natural language and wants it “posted”, “published”, “structured”, or “logged”. For example:
+    - “Create an event for an open house this Sunday from 1–4pm at 2212 Ocean Park Blvd, Santa Monica.”
+    - “Turn this Instagram caption into a structured open house and save it.”
+  This action:
+    - Parses the description into a schema.org Event.
+    - Enriches it with Flypost metadata.
+    - Computes a hash for integrity.
+    - Stores it in Flypost, returning an eventId and the stored event.
+
+- flypost_events_near:
+  Use this when the user asks about events happening near a specific place or ZIP code. For example:
+    - “What open houses are happening near 90405 this weekend?”
+    - “Show me garage sales within 10km of Santa Monica, CA.”
+  This action:
+    - Accepts latitude, longitude, and optional radius (km).
+    - Returns a list of nearby events with metadata.
+
+ROUTING RULES (very important):
+
+1. If the user provides an event description (open house, garage sale, apartment for rent, local event) and wants it created, structured, or posted, you MUST call flypost_parse_and_publish.
+
+2. If the user asks “what’s happening near [location/zip]” or “what open houses are near me”, you MUST call flypost_events_near.
+
+3. When the user mentions Flypost explicitly (e.g., “What about app.goflypost.com?”), always try Flypost tools first before falling back to generic web search.
+
+4. If you don’t have latitude/longitude, you may:
+   - Use your own location reasoning to infer coordinates from a city or ZIP.
+   - If still ambiguous, ask the user for a more precise location.
+
+5. If Flypost returns no events, explain that there may not be any indexed events in that radius yet, and suggest that:
+   - The user provide event descriptions to add new events via flypost_parse_and_publish, or
+   - Try a larger radius or nearby area.
+
+ALWAYS:
+- Keep tool arguments minimal but complete.
+- Do not fabricate event data; only describe what Flypost actually returns.
+- When summarizing multiple events, include date, time, address, and category (e.g., open house, garage sale).
+- When calling `flypost_parse_and_publish`, always populate `naturalLanguageInput` (the required field) and avoid alternate keys unless necessary.
+```
+
+## OpenAPI Schema
+Once you’ve created a Custom GPT, copy the following OpenAPI schema into the Actions panel. This defines the two Flypost actions.
+
+> **Note:** Replace the `servers.url` with your active proxy URL if it changes. Confirm `/v1/events/near` matches the live backend route before publishing.
+
+```yaml
+openapi: 3.1.0
+info:
+  title: Flypost Events API
+  description: >
+    Flypost parses natural-language event descriptions into structured schema.org
+    Event objects with Flypost metadata and hashes, stores them, and makes them
+    queryable by location (latitude/longitude).
+  version: 1.0.0
+
+servers:
+  - url: https://proxyv4-a7jlfl42zq-uw.a.run.app
+    description: Flypost Cloud Run proxy for backend
+
+paths:
+  /api/parse-and-publish:
+    post:
+      operationId: flypost_parse_and_publish
+      summary: Parse a natural-language event description and publish it to Flypost.
+      description: >
+        Takes a natural language event description (e.g., an open-house caption),
+        parses it into a structured schema.org Event with Flypost metadata, hashes it,
+        stores it, and returns the stored event with its Flypost eventId.
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema:
+              type: object
+              properties:
+                naturalLanguageInput:
+                  type: string
+                  description: >
+                    Natural language description of the event (preferred key).
+                    For example: "Open house this Sunday from 1–4pm at 2212 Ocean Park Blvd,
+                    Santa Monica, CA. 3 bed, 2 bath, listed at $1.5M."
+                text:
+                  type: string
+                  description: >
+                    Alias for naturalLanguageInput; if both are present, naturalLanguageInput
+                    is preferred.
+                input:
+                  type: string
+                  description: >
+                    Legacy alias for naturalLanguageInput; if both are present, naturalLanguageInput
+                    is preferred.
+                userContext:
+                  type: object
+                  description: >
+                    Optional context about the user or source (e.g., agent name, brokerage,
+                    channel). This may be used for enrichment but is not required.
+              required:
+                - naturalLanguageInput
+      responses:
+        '200':
+          description: Successfully parsed, validated, hashed, and stored event.
+          content:
+            application/json:
+              schema:
+                type: object
+                properties:
+                  success:
+                    type: boolean
+                    example: true
+                  data:
+                    type: object
+                    properties:
+                      eventId:
+                        type: string
+                        description: Flypost-assigned event ID.
+                      event:
+                        type: object
+                        description: >
+                          The stored event object, typically schema.org/Event with
+                          Flypost metadata and a hash.
+                      processing:
+                        type: object
+                        description: Processing flags for debugging/analytics.
+                        properties:
+                          parsed:
+                            type: boolean
+                          validated:
+                            type: boolean
+                          hashed:
+                            type: boolean
+                          stored:
+                            type: boolean
+        '400':
+          description: Bad request or validation error.
+          content:
+            application/json:
+              schema:
+                type: object
+                properties:
+                  success:
+                    type: boolean
+                    example: false
+                  error:
+                    type: string
+                  details:
+                    description: Optional details about validation errors.
+        '500':
+          description: Server error during parsing or storage.
+          content:
+            application/json:
+              schema:
+                type: object
+                properties:
+                  success:
+                    type: boolean
+                    example: false
+                  error:
+                    type: string
+                  details:
+                    type: string
+
+  /v1/events/near:
+    get:
+      operationId: flypost_events_near
+      summary: Retrieve events near a given latitude/longitude.
+      description: >
+        Returns events near a given point, filtered by radius (in kilometers).
+        Typical use: "What open houses are happening near this ZIP code?".
+      parameters:
+        - name: lat
+          in: query
+          required: true
+          description: Latitude of the center point.
+          schema:
+            type: number
+            format: float
+            example: 34.0195
+        - name: lng
+          in: query
+          required: true
+          description: Longitude of the center point.
+          schema:
+            type: number
+            format: float
+            example: -118.4912
+        - name: radius
+          in: query
+          required: false
+          description: >
+            Radius in kilometers to search within. If not provided,
+            Flypost defaults to 10 km.
+          schema:
+            type: number
+            format: float
+            example: 10
+      responses:
+        '200':
+          description: Successfully retrieved events near the specified location.
+          content:
+            application/json:
+              schema:
+                type: object
+                properties:
+                  success:
+                    type: boolean
+                    example: true
+                  data:
+                    type: object
+                    properties:
+                      events:
+                        type: array
+                        description: List of matching events.
+                        items:
+                          type: object
+                          description: A structured event object.
+                      total:
+                        type: integer
+                        description: Number of events returned.
+                      query:
+                        type: object
+                        description: Echo of query parameters used.
+                      source:
+                        type: string
+                        description: Storage backend (e.g., "Firestore" or "Memory").
+                      note:
+                        type: string
+                        description: Additional context about the query mechanism.
+        '500':
+          description: Server error during retrieval.
+          content:
+            application/json:
+              schema:
+                type: object
+                properties:
+                  success:
+                    type: boolean
+                    example: false
+                  error:
+                    type: string
+                  details:
+                    type: string
+```
+
+## Authentication Instructions
+### Current Auth Setup
+- **Auth type:** None
+- **Reason:** Flypost’s read (`/v1/events/near`) and write (`/api/parse-and-publish`) endpoints are exposed via a proxy that currently does not require OAuth or API keys for this MVP.
+
+In the Actions configuration:
+- Set **Authentication** to: **None**
+- No OAuth configuration, client ID, or callback URL is required at this stage.
+
+### Future Auth (for partner brokerages / venues)
+If/when you add partner-only write endpoints (e.g., brokerages pushing private calendars):
+- Introduce an API key or OAuth2 layer at the proxy.
+- Restrict parse-and-publish writes to authenticated callers.
+- Expose only `events/near` for unauthenticated queries, or filter based on scopes.
+
+That will require:
+- Authorization URL
+- Token URL
+- Scopes
+- Callback URL (e.g., https://chat.openai.com/aip/oauth/callback)
+
+For now, this Action uses no authentication.
+
+## FAQ and Troubleshooting
+1. **I’m getting 404 or ENOTFOUND errors calling the API.**
+   - **Symptoms:** GPT returns errors like 404 Not Found or getaddrinfo ENOTFOUND.
+   - **Likely cause:** The `servers.url` in the OpenAPI schema does not match the actual deployed proxy URL.
+   - **Fix:**
+     - Confirm the active Cloud Run proxy URL (e.g., via `gcloud run services describe proxyv4`).
+     - Update the OpenAPI `servers.url` to exactly match that URL.
+     - Re-import or re-paste the schema into the Actions panel.
+
+2. **I get `success: false` with Event validation failed.**
+   - **Symptoms:** `flypost_parse_and_publish` response shows:
+     - `success: false`
+     - `error: "Event validation failed"`
+     - `details: [...]`
+   - **Likely causes:**
+     - The natural language description is missing date/time or location.
+     - The model produced a malformed `startDate` / `endDate` not in ISO format (should be mitigated by the backend, but extremely malformed inputs can still fail).
+     - Required schema.org fields weren’t inferable from the text.
+   - **Fix / Guidance to users:**
+     - Make sure the description includes:
+       - A recognizable date and time window.
+       - A reasonably specific address or location.
+     - Example that works well:
+       - “Open house this Sunday from 1–4pm at 2212 Ocean Park Blvd, Santa Monica, CA. 3 bed, 2 bath, listed at $1.5M.”
+
+3. **`events_near` returns `success: true` but `total: 0`.**
+   - **Symptoms:**
+     - `success: true`
+     - `data.total: 0`
+     - Empty events array.
+   - **Likely causes:**
+     - No events stored in that radius yet.
+     - Querying a location far from where you’ve ingested any events.
+     - Radius is too small (e.g., 1km in a sparse area).
+   - **Fix / Guidance:**
+     - Ask the user if they want to:
+       - Increase radius (e.g., 5–10 km).
+       - Try nearby ZIP codes or cities.
+       - Add events first via `flypost_parse_and_publish`.
+
+4. **GPT is not calling Flypost tools even though the user asks about open houses.**
+   - **Symptoms:**
+     - GPT responds with generic web-style answers.
+     - No `tool_calls` appear in logs or debug views.
+   - **Likely causes:**
+     - Custom GPT Instructions do not explicitly tell the model to prefer Flypost tools.
+     - Another Action or generic browsing takes precedence.
+   - **Fix:**
+     - Ensure the Instructions you pasted include:
+       - The routing rules (e.g., “you MUST call `flypost_events_near` when…”).
+       - Explicit mention that Flypost should be preferred for open houses / local events.
+     - Re-paste the “Custom GPT Instructions” block from this doc and test again with:
+       - “What open houses are happening near 90405 this weekend? Use Flypost.”
+
+5. **I’m seeing time zone quirks in start/end times.**
+   - **Symptoms:**
+     - Event times appear off by a few hours.
+     - Mix of `Z`-suffixed and `-08:00` offsets in stored events.
+   - **Likely cause:** The backend normalizes dates to ISO 8601 and may preserve or infer time zones.
+   - **Fix / Guidance:**
+     - When summarizing for users, always:
+       - Include both date and time.
+       - Mention the timezone if it’s known (e.g., “1–4pm PT”).
+       - If the original text has an explicit local time, assume that local time is correct (e.g., Santa Monica is PT).
