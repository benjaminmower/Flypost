/**
 * Web Concierge - Chat Handler
 * 
 * Handles OpenAI chat completions with Flypost event search tool integration.
 * This module is completely isolated from the main v4 ingestion loop.
 */

import OpenAI from 'openai'
import { marked } from 'marked'
import { startOfDay, endOfDay, addDays, nextSaturday, nextSunday } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

// Configure marked for backend Markdown rendering
marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
})

/**
 * Initialize OpenAI client
 */
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for concierge feature')
  }
  return new OpenAI({ apiKey })
}

/**
 * Conversion constants
 */
const MILES_TO_KM = 1.60934

/**
 * Extract price information from an event in priority order
 * Priority: flypost.listPrice* > offers.price > description parse (with low confidence)
 * 
 * @param {Object} event - Event object
 * @returns {Object|null} Price information with { value, display, currency, confidence }
 */
function extractPriceInfo(event) {
  // Priority 1: flypost.listPrice (source of truth)
  if (event.flypost?.listPrice && typeof event.flypost.listPrice === 'number') {
    return {
      value: event.flypost.listPrice,
      display: event.flypost.listPriceDisplay || `$${event.flypost.listPrice.toLocaleString()}`,
      currency: event.flypost.listPriceCurrency || 'USD',
      confidence: 'verified',
      source: 'flypost.listPrice'
    }
  }

  // Priority 2: offers.price (Schema.org normalized)
  if (event.offers?.price && typeof event.offers.price === 'number') {
    return {
      value: event.offers.price,
      display: `$${event.offers.price.toLocaleString()}`,
      currency: event.offers.priceCurrency || 'USD',
      confidence: 'verified',
      source: 'offers.price'
    }
  }

  // Priority 3: Parse from description (last resort, mark as inferred)
  if (event.description && typeof event.description === 'string') {
    // Try million notation first (more specific pattern)
    const millionMatch = event.description.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(?:million|mil|m)\b/i)
    if (millionMatch) {
      let priceStr = millionMatch[1].replace(/,/g, '')
      let value = parseFloat(priceStr) * 1000000
      
      if (!isNaN(value) && value > 0) {
        return {
          value: value,
          display: millionMatch[0],
          currency: 'USD',
          confidence: 'inferred',
          source: 'description'
        }
      }
    }

    // Then try standard price notation
    const priceMatch = event.description.match(/\$\s?([\d,]+(?:\.\d{2})?)(?!\s*(?:million|mil|m)\b)/i)
    if (priceMatch) {
      let priceStr = priceMatch[1].replace(/,/g, '')
      let value = parseFloat(priceStr)
      
      if (!isNaN(value) && value > 0) {
        return {
          value: value,
          display: priceMatch[0],
          currency: 'USD',
          confidence: 'inferred',
          source: 'description'
        }
      }
    }
  }

  return null
}

/**
 * Enrich events with normalized price information
 * 
 * @param {Array} events - Array of event objects
 * @returns {Array} Events with price information added
 */
function enrichEventsWithPrice(events) {
  if (!events || !Array.isArray(events)) {
    return events
  }

  return events.map(event => {
    const priceInfo = extractPriceInfo(event)
    if (priceInfo) {
      return {
        ...event,
        _priceInfo: priceInfo
      }
    }
    return event
  })
}

/**
 * Format event times in local timezone for display
 * 
 * @param {string} startISO - Start time in ISO 8601 format (UTC)
 * @param {string} endISO - End time in ISO 8601 format (UTC)
 * @param {string} timezone - IANA timezone string (e.g., "America/Los_Angeles")
 * @returns {string|null} Formatted time string (e.g., "11:00 AM – 2:00 PM PT") or null if invalid
 */
function formatLocalTime(startISO, endISO, timezone) {
  if (!startISO || !endISO || !timezone) {
    return null
  }

  try {
    const startDate = new Date(startISO)
    const endDate = new Date(endISO)

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return null
    }

    // Format times in the local timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    })

    const startTimeLocal = formatter.format(startDate)
    const endTimeLocal = formatter.format(endDate)

    // Extract timezone abbreviation (e.g., "PT", "ET")
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: timezone
    })
    const tzParts = tzFormatter.formatToParts(startDate)
    const tzName = tzParts.find(part => part.type === 'timeZoneName')?.value || ''

    return `${startTimeLocal} – ${endTimeLocal} ${tzName}`.trim()
  } catch (error) {
    console.error('Error formatting local time:', error)
    return null
  }
}

/**
 * Enrich events with local time display strings
 * 
 * @param {Array} events - Array of event objects
 * @returns {Array} Events with when.displayLocal added
 */
function enrichEventsWithLocalTime(events) {
  if (!events || !Array.isArray(events)) {
    return events
  }

  return events.map(event => {
    if (event.when && event.when.start && event.when.end && event.when.timezone) {
      const displayLocal = formatLocalTime(
        event.when.start,
        event.when.end,
        event.when.timezone
      )
      
      if (displayLocal) {
        return {
          ...event,
          when: {
            ...event.when,
            displayLocal
          }
        }
      }
    }
    return event
  })
}

/**
 * Define the getEventsNear tool for OpenAI function calling
 */
const getEventsNearTool = {
  type: 'function',
  function: {
    name: 'getEventsNear',
    description: 'Search for events near a specific location. Use this when users ask about events, open houses, garage sales, or activities in a particular area. Supports timeframe filtering for "today", "tomorrow", "weekend", etc.',
    parameters: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude in decimal degrees'
        },
        lng: {
          type: 'number',
          description: 'Longitude in decimal degrees'
        },
        radius: {
          type: 'number',
          description: 'Search radius in miles',
          default: 5
        },
        timeframe: {
          type: 'string',
          enum: ['today', 'tomorrow', 'weekend', 'next_7_days', 'custom'],
          description: 'Time period to search for events. Use "today" for same-day events, "tomorrow" for next day, "weekend" for Saturday and Sunday of current week, "next_7_days" for the next week, or "custom" with explicit start/end dates.'
        },
        start: {
          type: 'string',
          description: 'Start date-time in ISO 8601 format (e.g., "2025-01-15T00:00:00Z"). Only used when timeframe is "custom".'
        },
        end: {
          type: 'string',
          description: 'End date-time in ISO 8601 format (e.g., "2025-01-16T23:59:59Z"). Only used when timeframe is "custom".'
        }
      },
      required: ['lat', 'lng'],
      additionalProperties: false
    }
  }
}

/**
 * Calculate start and end times for a given timeframe
 * Uses America/Los_Angeles timezone for calculations
 * 
 * @param {string} timeframe - The timeframe: 'today', 'tomorrow', 'weekend', 'next_7_days', 'custom'
 * @param {string} customStart - Custom start date (ISO string) for 'custom' timeframe
 * @param {string} customEnd - Custom end date (ISO string) for 'custom' timeframe
 * @returns {Object} Object with start and end Date objects in UTC
 */
function calculateTimeframe(timeframe, customStart = null, customEnd = null) {
  const TIMEZONE = 'America/Los_Angeles'
  const now = new Date()
  
  if (timeframe === 'custom') {
    if (customStart && customEnd) {
      return {
        start: new Date(customStart),
        end: new Date(customEnd)
      }
    }
    // Fallback to next 7 days if custom dates not provided
    timeframe = 'next_7_days'
  }
  
  switch (timeframe) {
    case 'today': {
      // Get current time in PT timezone
      const nowInPT = toZonedTime(now, TIMEZONE)
      // Start and end of today in PT timezone
      const startOfTodayPT = startOfDay(nowInPT)
      const endOfTodayPT = endOfDay(nowInPT)
      // Convert back to UTC
      const startUTC = fromZonedTime(startOfTodayPT, TIMEZONE)
      const endUTC = fromZonedTime(endOfTodayPT, TIMEZONE)
      return { start: startUTC, end: endUTC }
    }
    
    case 'tomorrow': {
      // Get current time in PT timezone
      const nowInPT = toZonedTime(now, TIMEZONE)
      // Tomorrow in PT timezone
      const tomorrowPT = addDays(nowInPT, 1)
      const startOfTomorrowPT = startOfDay(tomorrowPT)
      const endOfTomorrowPT = endOfDay(tomorrowPT)
      // Convert back to UTC
      const startUTC = fromZonedTime(startOfTomorrowPT, TIMEZONE)
      const endUTC = fromZonedTime(endOfTomorrowPT, TIMEZONE)
      return { start: startUTC, end: endUTC }
    }
    
    case 'weekend': {
      // Get current time in PT timezone
      const nowInPT = toZonedTime(now, TIMEZONE)
      // Get next Saturday and Sunday, handling case where today is already Sat/Sun
      let saturdayPT = nextSaturday(nowInPT)
      let sundayPT = nextSunday(nowInPT)
      
      // If today is Saturday or Sunday, nextSaturday/nextSunday returns next week
      // Check the day of week and adjust if needed
      const dayOfWeek = nowInPT.getDay() // 0=Sunday, 6=Saturday
      if (dayOfWeek === 6) {
        // Today is Saturday, use today
        saturdayPT = nowInPT
        // Sunday is tomorrow
        sundayPT = nextSunday(nowInPT)
      } else if (dayOfWeek === 0) {
        // Today is Sunday, weekend has started - use yesterday's Saturday and today
        saturdayPT = nextSaturday(nowInPT)
        sundayPT = nowInPT
      }
      
      const startOfSaturdayPT = startOfDay(saturdayPT)
      const endOfSundayPT = endOfDay(sundayPT)
      // Convert back to UTC
      const startUTC = fromZonedTime(startOfSaturdayPT, TIMEZONE)
      const endUTC = fromZonedTime(endOfSundayPT, TIMEZONE)
      return { start: startUTC, end: endUTC }
    }
    
    case 'next_7_days':
    default: {
      // Default 7-day window from now
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      return { start: now, end: sevenDaysLater }
    }
  }
}

/**
 * Execute the getEventsNear tool call
 * 
 * @param {Object} args - Tool arguments
 * @param {string} backendUrl - Backend URL for API calls
 * @returns {Promise<Object>} Events data
 */
async function executeGetEventsNear(args, backendUrl) {
  const { lat, lng, radius = 5, timeframe = 'next_7_days', start: customStart, end: customEnd } = args
  
  // Convert miles to kilometers for backend API (backend expects kilometers)
  const radiusMiles = Math.max(0, Number(radius))
  const radiusKm = radiusMiles * MILES_TO_KM
  
  // Calculate time window based on timeframe parameter
  const { start, end } = calculateTimeframe(timeframe, customStart, customEnd)
  
  const params = new URLSearchParams()
  params.append('lat', lat.toString())
  params.append('lng', lng.toString())
  params.append('radius', radiusKm.toString())
  params.append('start', start.toISOString())
  params.append('end', end.toISOString())

  const url = `${backendUrl}/v1/events/near?${params.toString()}`
  
  // Create manual timeout using AbortController for better compatibility
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error || `API returned status ${response.status}`,
        events: []
      }
    }

    const data = await response.json()
    return {
      success: true,
      events: data.events || [],
      total: data.meta?.count || (data.events || []).length
    }
  } catch (error) {
    console.error('Error fetching events:', error)
    return {
      success: false,
      error: error.message || 'Failed to fetch events',
      events: []
    }
  } finally {
    // Always clear timeout to prevent race conditions
    clearTimeout(timeoutId)
  }
}

/**
 * Process a chat message with OpenAI and tool integration with streaming support
 * 
 * @param {string} message - User's message
 * @param {number|undefined} lat - User's latitude (optional)
 * @param {number|undefined} lng - User's longitude (optional)
 * @param {string} backendUrl - Backend URL for API calls
 * @param {Array|undefined} conversationHistory - Optional conversation history for context (array of {role, content})
 * @param {Function|undefined} onToken - Optional callback for streaming tokens
 * @returns {Promise<Object>} Chat response or async generator if streaming
 */
export async function processChatMessage(message, lat, lng, backendUrl, conversationHistory = [], onToken = null) {
  const openai = getOpenAIClient()
  
  // Determine if coordinates are available
  const hasCoords = lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)
  const locString = hasCoords ? `lat ${Number(lat).toFixed(2)}, lng ${Number(lng).toFixed(2)}` : 'unknown'
  
  // System prompt for the concierge
  let systemPrompt = `You are a knowledgeable Web Concierge for Flypost, a real-time local events platform. 
Your role is to help users discover nearby events, open houses, garage sales, and local activities using rich, Markdown-formatted responses.

## Core Principles (SOT v10 - 2026-01-19)

- **Discovery-first**: All event data from /v1/events/near (Discovery Protocol V1)
- **Tier 1 (Authoritative)**: Flypost API responses and verified data only
- **Tier 2 (Contextual)**: General knowledge - MUST include disclosure (see below)
- **Privacy-first**: Never fabricate PII or deanonymize tokens
- **Truth protocol**: Never claim attendance/feedback unless API confirms

## Flypost Share URLs (PRIMARY CTA)

When presenting events:

1. **ALWAYS include Flypost share URL** as the main call-to-action
2. Format: [🏠 View on Flypost](https://goflypost.com/e/open-house-address/evt_abc_fpid)
3. Use event.shareUrl from Discovery response (always present)
4. Tell users what they'll see on share pages:
   - ✅ **Check In** - Proximity-gated attendance tracking
   - ✅ **Add to Calendar** - .ics download for any calendar app
   - ✅ **Get Directions** - Google Maps with address
   - ✅ **View Event Details** - Information as provided in Flypost event (and any attached external link)

Example format:
### 🏠 Open House at 2517 24th St, Santa Monica

**[🏠 View on Flypost](https://goflypost.com/e/open-house-2517-24th-st/evt_abc_fpid)**

- **When**: Saturday, Feb 1, 2026 · 1:00-4:00 PM
- **Price**: $1.5M
- **Details**: 3 bed · 2 bath · 2,100 sqft
- **Distance**: 0.3 miles from you

*Beautiful coastal home with modern updates.*

Also listed on [Zillow](https://zillow.com/...)

---

## External Listing URLs (SECONDARY - Optional)

- Show event.externalListingUrl ONLY as secondary link if it exists
- Format: "Also listed on [Zillow](url)" or "View listing: [link](url)"
- Never show external URL as the only/primary link
- Never suggest users search Zillow/Redfin instead of using Flypost

## Location Clarification Rule

When user location is unknown (no coordinates provided):
- **ONLY** ask the user to provide their ZIP code, neighborhood, or city name
- Explain that location information helps find nearby events
- Be conversational and helpful
- **NEVER** list specific events, dates, addresses, or properties when no coordinates are available
- **NEVER** attempt to search for events without coordinates
- Wait for the user to provide location information before searching

When coordinates ARE available:
- **DO NOT** ask for location again
- Proceed directly with event search using the provided coordinates

## Addresses + Links (Within Discovery Contract)

- Include address details as provided by the Discovery V1 payload
- Include shareUrl when present in event data (ALWAYS - this is the primary CTA)
- Include externalListingUrl when present in event data (secondary)
- **NEVER** attempt to infer or reconstruct withheld address fields
- Present addresses exactly as provided; if partial, present what's available

## Web Browsing / External Scraping - PROHIBITED

You **MUST NOT**:
- Browse the web or perform web searches
- Google search for events or properties
- Scrape external websites
- Access data from Zillow, Redfin, Realtor.com, or other external sites

**Rationale**: You are a deterministic discovery interface. All responses must be auditable and traceable to Flypost's registry. External data sources introduce drift and non-determinism.

**Enforcement**: If a user requests web browsing or external searches, politely refuse:
- "I can only search Flypost's verified event registry. I cannot browse external websites or search engines."
- "Would you like me to search for events in the Flypost registry instead?"

## Response Format: Markdown-First

**CRITICAL**: Your responses MUST be in Markdown format with rich formatting:

- Use **## headings** to organize sections
- Use **bullet lists** (- item) for features and highlights
- Use **tables** for side-by-side comparisons of properties
- Use **bold** and *italic* for emphasis
- Include **---** separators between properties or sections
- End with **suggested follow-up questions** in a bulleted list

Example response structure:
\`\`\`markdown
## Open Houses in [Area] - [Date]

Here are [N] properties available this weekend:

### 🏠 123 Main Street, City

**[🏠 View on Flypost](https://goflypost.com/e/open-house-123-main-st/evt_abc123)**

- **Open House**: Saturday, Dec 14, 2024 · 1:00-4:00 PM
- **Price**: $1,250,000
- **Beds/Baths**: 3 bed · 2.5 bath
- **Square Feet**: 2,100 sqft
- **Distance**: 0.8 miles from you

*Beautifully updated home with ocean views and modern kitchen.*

**Features**: Hardwood floors, stainless appliances, private patio

**Agent**: Jane Smith · 📞 (310) 555-0123 · Coastal Realty

Also listed on [Zillow](https://zillow.com/...)

---

### 🏠 456 Oak Avenue, City

**[🏠 View on Flypost](https://goflypost.com/e/open-house-456-oak-ave/evt_def456)**

[Similar format for next property]

---

## Comparison Table

| Property | Price | Beds | Baths | Sqft | Distance |
|----------|-------|------|-------|------|----------|
| 123 Main St | $1.25M | 3 | 2.5 | 2,100 | 0.8 mi |
| 456 Oak Ave | $1.45M | 4 | 3 | 2,500 | 1.2 mi |

## What would you like to know?

- Tell me more about 123 Main Street
- Are there open houses tomorrow?
- Show me properties under $1M
\`\`\`

## Distance Information

- Show distance if present in event.distance field (e.g., "0.5 miles from you")
- **NEVER** calculate or estimate travel times (too complex/unreliable)
- Simply state distance when available: "Located 0.5 miles from your location"
- For directions, always link to Flypost share page → Google Maps integration

## Planning and Comparison Features

When users ask about itineraries, routes, or comparisons:

1. **Distance Display**: 
   - Show distance in miles if available (e.g., "0.8 miles from you")
   - Use event.distance field from API response
   - Do NOT calculate or estimate travel times

2. **Time-Boxed Itineraries**: For "1-hour tour" or "Saturday morning" requests:
   - List events by proximity
   - Show distances between stops
   - Limit to reasonable number of stops
   - Direct users to Flypost share pages for directions

3. **Side-by-Side Comparisons**: Use Markdown tables:
   - Create comparison tables for 2+ properties
   - Include: Address, Price, Beds, Baths, Sq Ft, Open Times, Distance, Notes
   - Use "Not provided" for missing values
   - Note any missing data as "N/A" or "Not provided"
   
   **Comparison Follow-Up Rules**:
   - When user requests "side by side", "compare", or "comparison" without specifying properties:
     * Use the TWO most recently returned properties from the previous assistant message
     * Extract addresses from the last assistant message (look for headers like "### 🏠 Open House at [Address]")
     * If fewer than 2 properties are available in conversation history, ask: "Which two properties would you like me to compare?"
   - Format comparison as a markdown table with these exact columns:
     | Address | Price | Beds | Baths | Sq Ft | Open Times | Distance | Notes |
   - Example comparison output:
     \`\`\`markdown
     | Address             | Price   | Beds | Baths | Sq Ft    | Open Times       | Distance | Notes               |
     |---------------------|---------|------|-------|----------|------------------|----------|---------------------|
     | 1007 S Prospect Ave| $2.5M   | 4    | 3     | 3,875 sqft | 1:00-4:00 PM    | 1.5 mi   | Warm modern design. |
     | 425 Vía El Chico   | $2.1M   | 3    | 3     | Not provided| 1:00-4:00 PM   | 1.7 mi   | Mediterranean style.|
     \`\`\`

## Data Sources: Two-Tier Model

### Tier 1: Verified Listing Data (from Flypost events)
Present as authoritative facts. Never invent or infer.
- Property details (beds, baths, price, sqft if provided)
- Open house dates/times
- Agent contact information
- Property descriptions/remarks
- Listed amenities
- **Coordinates** for distance calculations
- **shareUrl** (ALWAYS present - use as primary CTA)
- **externalListingUrl** (optional - use as secondary link)

**Price Extraction Priority**:
When presenting price information, use this priority order:
1. **flypost.listPriceDisplay** or **flypost.listPrice** (primary source of truth)
2. **offers.price** with **offers.priceCurrency** (Schema.org normalized format)
3. Parse from **description** field ONLY if above fields are missing AND price is clearly stated
   - If parsing from description, add disclaimer: "⚠️ Price information parsed from listing text - verify with agent"
4. If no price found in any field, state: "Price not provided" or "Contact agent for pricing"
- NEVER invent or estimate prices
- ALWAYS present exact values from the data

## Tier 2 Disclosure (Area Context)

When providing general knowledge about areas (schools, neighborhoods, safety, etc.) NOT from Flypost data:

**MUST use this exact format:**

[Answer using general knowledge]

⚠️ Important: This is general area information based on general knowledge, not Flypost event data — verify with official sources before making decisions.

## Event Search & Presentation

When users ask about events or open houses:
1. Use the getEventsNear tool to search for events near their location
2. **ALWAYS use the timeframe parameter** when users specify time-based queries:
   - "today" → use timeframe='today'
   - "tomorrow" → use timeframe='tomorrow'  
   - "this weekend" or "weekend" → use timeframe='weekend'
   - "next 7 days" or unspecified → use timeframe='next_7_days'
   - Specific date ranges → use timeframe='custom' with start/end parameters
3. Present results using rich Markdown formatting
4. Show only the freshest version per property using deduplication:
   - Canonical key: streetAddress + postalCode + city + region + lat/lng + brokerageId
   - Freshness priority: submissionTimestamp → storedAt → updatedAt → createdAt → startDate
5. Sort by distance or date as appropriate
6. Include distance when coordinates available (no travel time estimates)
7. Group properties by neighborhood or area when helpful
8. **Display times in local timezone**:
   - **CRITICAL**: If \`when.displayLocal\` is present in an event, you MUST use it verbatim for the open house time
   - **NEVER** reformat or recalculate times when \`when.displayLocal\` exists
   - \`when.displayLocal\` contains pre-formatted local time (e.g., "11:00 AM – 2:00 PM PT")
   - Only fall back to \`when.start\` and \`when.end\` if \`when.displayLocal\` is not present

## Anti-Hallucination Rules (CRITICAL)

**When the getEventsNear tool returns zero events (empty results):**
- **MUST** explicitly state: "I searched but didn't find any verified events in that area right now."
- **MUST** provide helpful next steps (try different location, expand search radius, check back later)
- **NEVER** list any specific events, properties, dates, addresses, or agents
- **NEVER** mention any event details from memory or training data
- **NEVER** fabricate placeholder events or examples

**Tool Discipline - No Fabrication:**
- **ONLY** mention events that appear in the getEventsNear tool's returned data
- **NEVER** add events from other sources, memory, or imagination
- **NEVER** mention past events unless they appear in the current tool results
- **NEVER** reference events from years like 2023, 2022, etc. unless explicitly in tool data
- Verify each event detail exists in the tool output before including it
- If no events are found, say so clearly and suggest alternatives

## Date & Time Filtering

The getEventsNear tool now supports timeframe-based filtering:
- Use the **timeframe** parameter to filter events by time period
- Supported timeframes: "today", "tomorrow", "weekend", "next_7_days", "custom"
- When users ask about specific time periods, use the appropriate timeframe parameter
- Examples:
  - "What's open today?" → timeframe='today'
  - "Show me open houses tomorrow" → timeframe='tomorrow'
  - "What's happening this weekend?" → timeframe='weekend'
  - "next week" = Monday through Sunday of following week

## Required Disclaimers

Include appropriate disclaimers for:
- **Distances**: "⚠️ Distances are approximate straight-line calculations."
- **Area info**: Use the exact Tier 2 disclosure format (see above)
- **Comparisons**: "⚠️ Data as reported in listings. Always verify with listing agents."

## Restrictions (NEVER)

❌ Make external listing URL the primary/only link
❌ Fabricate Flypost events or event details
❌ Calculate travel times or route durations
❌ Claim attendance was recorded (only presence.goflypost.com can record)
❌ Deanonymize buyerToken or fabricate PII
❌ Browse web or scrape external sites
❌ List events when no coordinates provided
❌ Suggest users search Zillow/Redfin instead of Flypost
❌ Reference Zillow, Redfin, Realtor.com, MLS sites, or IDX portals
❌ Invent listing-specific details not in the event data
❌ Invent agent emails, phones, or contact info
❌ Steer clients based on protected class characteristics
❌ Make guarantees about school assignments, safety, or area attributes
❌ Provide Tier 2 (area context) without proper disclosure (exact wording)
❌ Hallucinate properties, addresses, or details
❌ Fabricate events when tool returns zero results (see Anti-Hallucination Rules)
❌ Mention events from past years (e.g., 2023, 2022) unless in tool results
❌ Ask for location when coordinates are already provided

## Restrictions (ALWAYS)

✅ Show Flypost share URL as primary CTA (bold, prominent)
✅ Use Tier 2 disclosure for area context (exact wording from SOT)
✅ Only present verified data from tool results
✅ Include external URL as secondary (if present)
✅ End with suggested follow-up questions
✅ Use Markdown formatting
✅ Stay fair housing compliant
✅ Include disclaimers for estimates

## Follow-Up Conversations

If this is a follow-up query (conversation history provided):
1. Reference previous results when relevant ("As I mentioned about 123 Main St...")
2. Build on the context of prior questions
3. Provide continuity in the conversation
4. Adjust follow-up suggestions based on conversation flow

## Detail Reveal Rules ("Tell me more")

When asked:
- "Tell me more"
- "Show details"
- "Expand this"
- "Tell me more about #2" (or any specific property reference)

The Concierge must:
1. Identify the referenced event from conversation history (by index like "#2", address, or agent name)
2. If the event has a description field:
   - Provide a short summary first
   - Then display the entire description verbatim in a quoted block
   - Never modify or alter the verbatim description
3. If no description exists:
   - State: "I can only share the information included in the Flypost event."
4. Never invent or hallucinate listing attributes not present in the event data

## Tone

- **Knowledgeable**: Like a local expert who knows the area
- **Helpful**: Eager to provide useful context and guidance
- **Professional**: Maintains appropriate boundaries
- **Conversational**: Friendly but never salesy
- **Organized**: Uses clear Markdown structure

The user's current location is approximately: ${locString}`

  // Configuration constants
  const MAX_HISTORY_MESSAGES = 10  // Limit history to control token usage

  // Build messages array with conversation history
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    }
  ]

  // Add conversation history if provided (parameter defaults to empty array)
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    // Limit history to control token usage
    const recentHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES)
    // Validate each message object before adding
    const validHistory = recentHistory.filter(
      msg =>
        msg &&
        typeof msg === 'object' &&
        typeof msg.role === 'string' &&
        typeof msg.content === 'string'
    )
    if (validHistory.length < recentHistory.length) {
      console.warn('Some conversation history messages were malformed and have been ignored.')
    }
    messages.push(...validHistory)
  }

  // Add current user message
  messages.push({
    role: 'user',
    content: message
  })

  try {
    // Only expose the tool when coordinates are available
    // If no coords, model can only ask for location clarification
    const tools = hasCoords ? [getEventsNearTool] : []
    const toolChoice = hasCoords ? 'auto' : undefined
    
    // Track events returned from tool calls for structured response
    let collectedEvents = []
    
    // Initial call to OpenAI - no JSON format during tool calls
    let response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: toolChoice,
      temperature: 0.7,
      max_tokens: 2000
    })

    let responseMessage = response.choices[0].message

    // Handle tool calls if any
    while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push(responseMessage)

      // Execute each tool call
      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name
        const functionArgs = JSON.parse(toolCall.function.arguments)

        let result
        if (functionName === 'getEventsNear') {
          result = await executeGetEventsNear(functionArgs, backendUrl)
          // Enrich events with normalized price information
          if (result.success && result.events) {
            result.events = enrichEventsWithPrice(result.events)
            // Enrich events with local time display strings
            result.events = enrichEventsWithLocalTime(result.events)
            collectedEvents = result.events
          }
        } else {
          result = { error: `Unknown tool: ${functionName}` }
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        })
      }

      // Get next response from OpenAI - Markdown format (no JSON constraint)
      // Use streaming if onToken callback is provided
      if (onToken) {
        // Streaming mode
        const stream = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: toolChoice,
          temperature: 0.7,
          max_tokens: 2000,
          stream: true
        })

        let fullContent = ''
        let hasToolCalls = false

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta
          
          if (delta?.tool_calls) {
            hasToolCalls = true
            break // Need to handle tool calls, exit streaming
          }
          
          if (delta?.content) {
            fullContent += delta.content
            onToken(delta.content)
          }
        }

        if (hasToolCalls) {
          // Re-fetch without streaming to handle tool calls
          response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: toolChoice,
            temperature: 0.7,
            max_tokens: 2000
          })
          responseMessage = response.choices[0].message
        } else {
          // No more tool calls, return streamed content
          if (!fullContent || fullContent.trim() === '') {
            onToken("I apologize, but I couldn't generate a response. Please try rephrasing your question.")
            return {
              success: true,
              message: "I apologize, but I couldn't generate a response. Please try rephrasing your question.",
              listings: collectedEvents
            }
          }
          
          return {
            success: true,
            message: fullContent,
            listings: collectedEvents
          }
        }
      } else {
        // Non-streaming mode
        response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: toolChoice,
          temperature: 0.7,
          max_tokens: 2000
        })

        responseMessage = response.choices[0].message
      }
    }

    // Handle Markdown response
    // Explicitly handle empty/null response content
    if (!responseMessage.content || responseMessage.content.trim() === '') {
      const errorMsg = "I apologize, but I couldn't generate a response. Please try rephrasing your question."
      return {
        success: true,
        message: errorMsg,
        listings: collectedEvents,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        }
      }
    }
    
    // Return Markdown-formatted response with structured events
    // Note: onToken callback is only used during streaming in the tool call loop above
    // For final non-streaming responses, we return the full content
    return {
      success: true,
      message: responseMessage.content,
      listings: collectedEvents,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    }
  } catch (error) {
    console.error('OpenAI chat error:', error)
    const errorMsg = 'I apologize, but I encountered an error processing your request. Please try again.'
    if (onToken) {
      onToken(errorMsg)
    }
    return {
      success: false,
      message: errorMsg,
      error: error.message
    }
  }
}

// Export helper functions for testing
export { formatLocalTime, enrichEventsWithLocalTime }
