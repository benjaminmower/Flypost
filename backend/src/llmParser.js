/* v2
 * Flypost v4 - Always-On Lean Parser with Automatic Fallback
 *
 * - Primary model: gpt-4o-mini (cheap + fast)
 * - Automatic fallback: gpt-4o (only for malformed JSON or missing fields)
 * - Compact schema (no token waste)
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

// Shared system prompt
const systemPrompt = `You are an expert event data formatter for Flypost v4.
Output ONLY valid JSON matching the Flypost schema. No markdown, no prose, no commentary.

Rules:
- Only include fields required by the schema.
- If optional fields are not present, omit them.
- Parse dates to ISO 8601.
- organizer.@type defaults to "Person" unless clearly an Organization.
- category must be one of:
  ["apartments","garage-sales","open-houses","job-postings","live-events","community-alerts","happy-hours","missing-pets"]
- Include location.geo ONLY if lat/lng are explicitly provided.
- Phone numbers: store exactly as given.
- You may generate flypost.eventId if missing: "evt_" + random suffix.
- You may set flypost.submissionTimestamp to current UTC time.
- Defaults: realTimeData=true, crawlable=true, queryable=true.`

// User prompt
function createUserPrompt(text, userContext = {}) {
  let out = `Flypost Event JSON Schema:\n${compactSchemaString}\n\n`
  out += `Convert the following input into a structured Flypost JSON event:\n${text}`

  if (userContext.defaultLocation) {
    out += `\nDefault location context: ${userContext.defaultLocation}`
  }
  if (userContext.timezone) {
    out += `\nTimezone context: ${userContext.timezone}`
  }

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

  // Validate & fallback check
  let parsedMini = null
  let needsFallback = false

  if (jsonString) {
    try {
      parsedMini = JSON.parse(jsonString)

      // Basic schema sanity checks
      if (!parsedMini.name || !parsedMini.startDate) {
        needsFallback = true
      }
    } catch {
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

  // Ensure flypost metadata
  if (!parsedEvent.flypost) parsedEvent.flypost = {}

  if (!parsedEvent.flypost.eventId) {
    parsedEvent.flypost.eventId = `evt_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`
  }

  parsedEvent.flypost.submissionTimestamp = new Date().toISOString()
  if (parsedEvent.flypost.realTimeData === undefined) parsedEvent.flypost.realTimeData = true
  if (parsedEvent.flypost.crawlable === undefined) parsedEvent.flypost.crawlable = true
  if (parsedEvent.flypost.queryable === undefined) parsedEvent.flypost.queryable = true

  return parsedEvent
}
