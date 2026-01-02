/* v3
 * Flypost v4 - Enhanced Always-On Parser with Better Field Extraction
 *
 * ENHANCEMENTS:
 * - Improved prompt engineering for better schema compliance
 * - Enhanced validation with detailed field checking before fallback
 * - Better context handling (location, timezone, current date)
 * - Comprehensive field normalization and validation
 * - Robust error handling with descriptive messages
 * 
 * FEATURES:
 * - Primary model: gpt-4o-mini (cheap + fast)
 * - Automatic fallback: gpt-4o (only for malformed JSON or missing required fields)
 * - Production-ready: no dev mode switching, no config toggles
 */

import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load schema once (compact form)
const schemaPath = join(__dirname, '../schemas/flypost-event-v4.schema.json')
const flypostEventSchema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const compactSchemaString = JSON.stringify(flypostEventSchema)

// Initialize OpenAI
let openai = null
function initializeOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// Enhanced system prompt with better field extraction guidance
const systemPrompt = `You are an expert event data formatter for Flypost v4.
Output ONLY valid JSON matching the Flypost schema. No markdown, no prose, no commentary.

CRITICAL SCHEMA REQUIREMENTS:
- ALL required fields MUST be present: @context, @type, flypost, name, description, startDate, location, organizer
- Use EXACT field names as specified in the schema

PARSING RULES:

1. EVENT IDENTIFICATION:
   - name: Extract the event title or create a descriptive name (max 200 chars)
   - description: Detailed event information (1-2000 chars). If brief, expand with relevant details.
   - category: Choose the BEST match from ["apartments","garage-sales","open-houses","job-postings","live-events","community-alerts","happy-hours","missing-pets"]

2. DATE/TIME HANDLING:
   - startDate: REQUIRED. Parse to ISO 8601 (YYYY-MM-DDTHH:MM:SS.000Z)
   - endDate: Optional for most categories. REQUIRED for open-houses when a time range is present
   - If only date given (no time), default to 09:00:00.000Z
   - If relative dates ("tomorrow", "next Saturday"), calculate from current time

3. MULTI-SLOT OPEN HOUSES:
   - If input describes multiple time slots for an open house (e.g., Saturday 11am-1pm AND Sunday 2pm-4pm),
     use the TOP-LEVEL occurrences[] array (NOT flypost.occurrences)
   - Each occurrence MUST include:
     * startDate: ISO 8601 timestamp for this slot's start
     * endDate: ISO 8601 timestamp for this slot's end (REQUIRED)
     * label: Short human-readable label (e.g., "Saturday", "Sunday", "Morning", "Afternoon")
   - Example occurrences structure:
     "occurrences": [
       {
         "startDate": "2026-01-04T11:00:00.000Z",
         "endDate": "2026-01-04T13:00:00.000Z",
         "label": "Saturday"
       },
       {
         "startDate": "2026-01-05T14:30:00.000Z",
         "endDate": "2026-01-05T17:30:00.000Z",
         "label": "Sunday"
       }
     ]
   - For multi-slot open houses, ALWAYS include occurrences[] with all slots
   - Set top-level startDate to the first slot's start time
   - Set top-level endDate to the first slot's end time

4. LOCATION (REQUIRED):
   - location.@type: Always "Place"
   - location.name: Extract if mentioned, otherwise use streetAddress
   - location.address.@type: Always "PostalAddress"
   - location.address.streetAddress: REQUIRED. Extract street address
   - location.address.addressLocality: City (extract if present)
   - location.address.addressRegion: State/province (extract if present, use 2-letter code if US)
   - location.address.postalCode: ZIP/postal code (extract if present)
   - location.address.addressCountry: Country (default "US" if context suggests USA)
   - location.geo: Include ONLY if latitude/longitude explicitly provided

5. ORGANIZER (REQUIRED):
   - organizer.@type: "Person" for individuals, "Organization" for companies/groups
   - organizer.name: Extract if mentioned, use "Event Organizer" as fallback
   - organizer.email: Extract if valid email found
   - organizer.phone: Extract and store EXACTLY as given (with or without formatting)
   - organizer.licenseId: Real estate license number if mentioned
   - organizer.mlsNumber: MLS listing number if mentioned

6. PRICE INFORMATION (OPTIONAL):
   - If a price is mentioned in the text (e.g., list price, rental rate, cost):
     * flypost.listPrice: Numeric value only (e.g., 1250000 for $1,250,000)
     * flypost.listPriceCurrency: Currency code (default "USD")
     * flypost.listPriceDisplay: Formatted display string (e.g., "$1,250,000")
     * flypost.priceType: Type of price (e.g., "LIST_PRICE" for sale, "RENTAL_RATE" for rent)
   - Only include price fields if price information is clearly stated in the text
   - Do NOT invent or estimate prices

7. OPTIONAL FIELDS:
   - keywords: Array of relevant tags if you can infer them from content
   - Only include optional fields if you have valid data

8. FLYPOST METADATA:
   - Generate flypost.eventId: "evt_" + random alphanumeric
   - Set flypost.submissionTimestamp to current UTC ISO string
   - Set flypost.realTimeData: true
   - Set flypost.crawlable: true
   - Set flypost.queryable: true

QUALITY CHECKS:
- Ensure description is informative (minimum 10 chars)
- Validate date formats are proper ISO 8601
- Ensure location has at minimum a streetAddress
- If information is missing, use reasonable defaults rather than omitting required fields`

// Enhanced user prompt with better context handling
function createUserPrompt(text, userContext = {}) {
  let out = `Flypost Event JSON Schema:\n${compactSchemaString}\n\n`
  
  // Add context information first to help with parsing
  const contextParts = []
  
  if (userContext.defaultLocation) {
    contextParts.push(`Default location: ${userContext.defaultLocation}`)
  }
  if (userContext.timezone) {
    contextParts.push(`Timezone: ${userContext.timezone}`)
  }
  if (userContext.currentDate) {
    contextParts.push(`Current date/time: ${userContext.currentDate}`)
  } else {
    contextParts.push(`Current date/time: ${new Date().toISOString()}`)
  }
  
  out += `CONTEXT:\n${contextParts.join('\n')}\n\n`
  
  out += `INPUT TEXT:\n${text}\n\n`
  out += `Parse the above text and return a complete, valid Flypost event JSON object with ALL required fields.`

  return out
}

// Core request helper
async function callLLM(model, messages, maxTokens = 1200) {
  const completion = await openai.chat.completions.create({
    model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.0,
    max_tokens: maxTokens
  })
  return completion.choices[0].message.content
}

// Main parser
export async function parseEventWithLLM(naturalLanguageText, userContext = {}) {
  if (!openai) initializeOpenAI()

  if (!naturalLanguageText || typeof naturalLanguageText !== 'string') {
    throw new Error('Natural language text must be a string.')
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: createUserPrompt(naturalLanguageText, userContext) }
  ]

  console.log(`🤖 Flypost Parser → Primary model: gpt-4o-mini`)

  let jsonString

  // FIRST: Try cheap model
  try {
    jsonString = await callLLM("gpt-4o-mini", messages, 1200)
  } catch (err) {
    console.error("Mini model error:", err)
    jsonString = null
  }

  // Validate & fallback check - Enhanced validation
  let parsedMini = null
  let needsFallback = false

  if (jsonString) {
    try {
      parsedMini = JSON.parse(jsonString)

      // Enhanced schema sanity checks
      const missingFields = []
      if (!parsedMini.name) missingFields.push('name')
      if (!parsedMini.description) missingFields.push('description')
      if (!parsedMini.startDate) missingFields.push('startDate')
      if (!parsedMini.location || !parsedMini.location.address || !parsedMini.location.address.streetAddress) {
        missingFields.push('location.address.streetAddress')
      }
      if (!parsedMini.organizer) missingFields.push('organizer')
      if (!parsedMini['@context']) missingFields.push('@context')
      if (!parsedMini['@type']) missingFields.push('@type')
      
      // Validate open-houses specific requirements
      if (parsedMini.flypost?.category === 'open-houses') {
        const hasOccurrences = parsedMini.occurrences && Array.isArray(parsedMini.occurrences) && parsedMini.occurrences.length > 0
        const hasTopLevelEndDate = parsedMini.endDate
        
        // Check if endDate is completely missing (neither in occurrences nor top-level)
        if (!hasTopLevelEndDate && !hasOccurrences) {
          console.log(`⚠️ Mini model: open-houses missing both endDate and occurrences[]`)
          needsFallback = true
        }
        
        // If occurrences exist, validate each has both startDate and endDate
        if (hasOccurrences) {
          for (let i = 0; i < parsedMini.occurrences.length; i++) {
            const occ = parsedMini.occurrences[i]
            if (!occ.startDate || !occ.endDate) {
              console.log(`⚠️ Mini model: occurrence[${i}] missing startDate or endDate`)
              needsFallback = true
              break
            }
          }
        }
      }
      
      if (missingFields.length > 0) {
        console.log(`⚠️ Mini model missing fields: ${missingFields.join(', ')}`)
        needsFallback = true
      }
    } catch (parseError) {
      console.error(`⚠️ Mini model JSON parse error: ${parseError.message}`)
      needsFallback = true
    }
  } else {
    needsFallback = true
  }

  // SECOND: Fallback to full 4o when needed
  if (needsFallback) {
    console.log(`⚠️ Mini failed → Falling back to gpt-4o`)
    jsonString = await callLLM("gpt-4o", messages, 2000)

    try {
      parsedMini = JSON.parse(jsonString)
    } catch (err) {
      throw new Error(`LLM returned malformed JSON even after fallback: ${err.message}`)
    }
  }

  // At this point parsedMini is our canonical parsed event
  const parsedEvent = parsedMini

  // Ensure required top-level fields with defaults
  if (!parsedEvent['@context']) parsedEvent['@context'] = 'https://schema.org'
  if (!parsedEvent['@type']) parsedEvent['@type'] = 'Event'

  // Ensure flypost metadata
  if (!parsedEvent.flypost) parsedEvent.flypost = {}

  if (!parsedEvent.flypost.eventId) {
    parsedEvent.flypost.eventId = `evt_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`
  }

  parsedEvent.flypost.submissionTimestamp = new Date().toISOString()
  if (parsedEvent.flypost.realTimeData === undefined) parsedEvent.flypost.realTimeData = true
  if (parsedEvent.flypost.crawlable === undefined) parsedEvent.flypost.crawlable = true
  if (parsedEvent.flypost.queryable === undefined) parsedEvent.flypost.queryable = true

  // Ensure location structure
  if (!parsedEvent.location) {
    throw new Error('Parsed event missing required location field')
  }
  if (!parsedEvent.location['@type']) parsedEvent.location['@type'] = 'Place'
  if (!parsedEvent.location.address) {
    throw new Error('Parsed event missing required location.address field')
  }
  if (!parsedEvent.location.address['@type']) {
    parsedEvent.location.address['@type'] = 'PostalAddress'
  }
  
  // Ensure organizer structure
  if (!parsedEvent.organizer) {
    throw new Error('Parsed event missing required organizer field')
  }
  if (!parsedEvent.organizer['@type']) {
    parsedEvent.organizer['@type'] = 'Person'
  }

  // Sanitize optional organizer fields - remove fields with invalid types
  // LLM sometimes outputs these fields with non-string values (null, numbers, booleans)
  // which causes AJV validation to fail. We prefer deletion over coercion.
  const organizerFieldsToSanitize = ['email', 'phone', 'licenseId', 'mlsNumber']
  for (const field of organizerFieldsToSanitize) {
    if (field in parsedEvent.organizer) {
      const value = parsedEvent.organizer[field]
      // Keep only non-empty strings; remove everything else
      if (typeof value !== 'string' || value.trim() === '') {
        delete parsedEvent.organizer[field]
        console.log(`🧹 Sanitized organizer.${field}: removed invalid value (type: ${typeof value})`)
      }
    }
  }

  // Validate and normalize dates
  if (!parsedEvent.startDate) {
    throw new Error('Parsed event missing required startDate field')
  }
  try {
    const startDate = new Date(parsedEvent.startDate)
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid startDate')
    }
    parsedEvent.startDate = startDate.toISOString()
  } catch (err) {
    throw new Error(`Invalid startDate format: ${parsedEvent.startDate}`)
  }

  if (parsedEvent.endDate) {
    try {
      const endDate = new Date(parsedEvent.endDate)
      if (isNaN(endDate.getTime())) {
        delete parsedEvent.endDate // Remove invalid endDate
      } else {
        parsedEvent.endDate = endDate.toISOString()
      }
    } catch (err) {
      delete parsedEvent.endDate // Remove invalid endDate
    }
  }

  // Normalize and derive price information
  // If flypost.listPrice exists, ensure offers object is created/updated
  if (parsedEvent.flypost && typeof parsedEvent.flypost.listPrice === 'number' && parsedEvent.flypost.listPrice > 0) {
    // Ensure default currency if not specified
    if (!parsedEvent.flypost.listPriceCurrency) {
      parsedEvent.flypost.listPriceCurrency = 'USD'
    }

    // Create offers object from flypost.listPrice (Schema.org export layer)
    parsedEvent.offers = {
      '@type': 'Offer',
      price: parsedEvent.flypost.listPrice,
      priceCurrency: parsedEvent.flypost.listPriceCurrency
    }

    console.log(`💰 Price normalized: ${parsedEvent.flypost.listPriceDisplay || parsedEvent.flypost.listPrice} ${parsedEvent.flypost.listPriceCurrency}`)
  }

  return parsedEvent
}
