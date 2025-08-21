# Flypost v4 Event Model

## Overview

The Flypost v4 Event Model is a minimal JSON-LD structure based on Schema.org's Event type with essential Flypost extensions. This model focuses on the core fields needed for the parse → publish → query loop.

## Structure

```json
{
  "@context": "https://schema.org",
  "@type": "Event", 
  "flypost": {
    "eventId": "evt_abc123_1234567890",
    "category": "garage-sales",
    "realTimeData": true,
    "crawlable": true,
    "queryable": true,
    "submissionTimestamp": "2025-01-01T12:00:00.000Z"
  },
  "name": "Saturday Garage Sale",
  "description": "Multi-family garage sale with furniture, electronics, and household items",
  "startDate": "2025-01-04T08:00:00.000Z",
  "endDate": "2025-01-04T14:00:00.000Z",
  "location": {
    "@type": "Place",
    "name": "123 Main Street",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Main Street", 
      "addressLocality": "Springfield",
      "addressRegion": "IL",
      "postalCode": "62701",
      "addressCountry": "US"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 39.7817,
      "longitude": -89.6501
    }
  },
  "organizer": {
    "@type": "Person",
    "name": "John Smith",
    "email": "john@example.com",
    "telephone": "+1-555-0123"
  },
  "keywords": ["furniture", "electronics", "household"]
}
```

## Required Fields

### Core Schema.org Fields
- `@context`: Always "https://schema.org"
- `@type`: Always "Event"
- `name`: Event title (1-200 characters)
- `description`: Event description (1-2000 characters)
- `startDate`: ISO 8601 datetime
- `location`: Place object with address
- `organizer`: Person or Organization with name and email

### Flypost Extensions
- `flypost.eventId`: Unique identifier (8-64 characters, alphanumeric + _ -)
  - Format: `evt_{random}_{timestamp}` (e.g., `evt_k7x9m2p4q_1641234567890`)
  - Generated using base36 random string + JavaScript timestamp
- `flypost.category`: One of predefined categories
- `flypost.realTimeData`: Boolean flag for real-time processing
- `flypost.crawlable`: Boolean flag for automated crawling
- `flypost.queryable`: Boolean flag for API access
- `flypost.submissionTimestamp`: UTC timestamp of submission

## Optional Fields

- `endDate`: Event end datetime
- `location.name`: Friendly location name
- `location.geo`: Latitude/longitude coordinates
- `organizer.telephone`: Contact phone number
- `keywords`: Array of tags/keywords

## Categories

- `apartments`: Rental listings
- `garage-sales`: Garage/yard sales
- `open-houses`: Real estate open houses  
- `job-postings`: Employment opportunities
- `live-events`: Concerts, performances, shows
- `community-alerts`: Public safety, notifications
- `happy-hours`: Social gatherings, networking
- `missing-pets`: Lost pet alerts

## Validation

Events are validated against the JSON Schema at `backend/schemas/flypost-event-v4.schema.json` using AJV validation.

## Example Usage

The LLM parser converts natural language like:

```
"Garage sale Saturday 8am-2pm at 123 Main St, Springfield IL. Selling furniture and electronics. Contact John at john@example.com"
```

Into the structured JSON-LD format above.