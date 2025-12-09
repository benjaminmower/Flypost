# FlyPost MCP Provider

The FlyPost MCP Provider offers a modular integration for:
- Retrieving ingested events (`mcp.flypost.get.json`)
- Parsing and normalizing events (`mcp.flypost.parse.json`)

These descriptors allow agents and developers to connect to FlyPost's API for seamless event handling in MCP-compliant systems.

---

## Features
### 1. Event Ingestion
- Fetch historical or live event data using filters like `dateRange` or `eventType`.
- See `mcp.flypost.get.json` for capabilities and input/output schemas.
- Example: [examples/ingest_events.js](./examples/ingest_events.js).

### 2. Event Parsing and Normalization
- Parse natural language inputs (e.g., open house descriptions) and transform them into structured FlyPost events.
- See `mcp.flypost.parse.json` for capabilities and input/output schemas.
- Example: [examples/query_context.js](./examples/query_context.js).

---

## Quick Start

### 1. Installation
Clone this repository and ensure you have Node.js and npm installed:
```bash
git clone https://github.com/your-username/flypost-mcp-provider.git
cd flypost-mcp-provider
npm install
```

### 2. Setup
- Add an `.env` file with your **FlyPost API Key**:
  ```
  FLYPOST_API_KEY=your_api_key_here
  ```

### 3. Run Examples
Fetch events:
```bash
node examples/ingest_events.js
```

Parse natural language inputs:
```bash
node examples/query_context.js
```

---
## Architecture Overview
FlyPost is designed to handle machine-to-machine event workflows by supporting:
- **Event Ingestion** (mcp.flypost.get.json): Efficiently retrieve and filter events using brokerage, event type, and date-based queries.
- **Event Parsing** (mcp.flypost.parse.json): Parse free-text inputs and normalize structured outputs using FlyPost's schema.
These modules can be used independently or together for a complete event-driven system.

## Descriptors

### Event Getter (`mcp.flypost.get.json`)
- Defines how to retrieve events from FlyPost.
- Input/Output schemas:
    - Input: Specify brokerage, event type, date range, and filters.
    - Output: Receive a list of events and pagination metadata.
- Endpoint: `https://api.flypost.com/v1/get-events`.

### Event Parser (`mcp.flypost.parse.json`)
- Defines how to parse natural language inputs into normalized FlyPost events.
- Input/Output schemas:
    - Input: Provide natural language descriptions and optional overrides (e.g., time zones).
    - Output: Receive schema-normalized events.
- Endpoint: `https://api.flypost.com/v1/parse-events`.

---

## License
Licensed under Apache License 2.0.
