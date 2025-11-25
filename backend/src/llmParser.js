/*
 * Flypost v4 - Minimal LLM Parser Service
 * Simplified version focusing on single event parsing only
 */

import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load the v4 minimal schema
const schemaPath = join(__dirname, '../schemas/flypost-event-v4.schema.json')
const flypostEventSchema = JSON.parse(readFileSync(schemaPath, 'utf8'))

// Initialize OpenAI (will be configured via environment variable)
let openai = null

// Initialize OpenAI client
function initializeOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }
  
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
}

// Core system prompt for v4 - minimal and focused
const systemPrompt = `You are an expert event data formatter for Flypost v4.
Your task is to extract relevant information from natural language event descriptions and output it strictly in the JSON-LD format defined by the Flypost Event Schema.

CRITICAL REQUIREMENTS:
1. Output ONLY valid JSON, no additional text, markdown, or formatting.
2. Follow the exact schema structure provided.
3. If a field is not mentioned and is optional, omit that field.
4. For 'flypost.eventId', generate a unique string like 'evt_' + random string.
5. For 'flypost.submissionTimestamp', use the current UTC ISO 8601 timestamp.
6. For 'organizer.@type', use "Person" unless explicitly stated as "Organization".
7. Choose appropriate category from: apartments, garage-sales, open-houses, job-postings, live-events, community-alerts, happy-hours, missing-pets
8. Set defaults: realTimeData: true, crawlable: true, queryable: true
9. Parse dates/times into ISO 8601 format for startDate and endDate
10. Only include 'location.geo' if latitude and longitude are clearly inferable, otherwise omit it.
11. For phone numbers, prefer 'phone' field over legacy 'telephone'. Store phone numbers verbatim without formatting changes.

RESPONSE FORMAT: Return only valid JSON that matches the provided schema exactly.`

// Create user prompt with schema inclusion
function createUserPrompt(naturalLanguageText, userContext = {}) {
  let prompt = `Here is the Flypost Event JSON Schema you MUST strictly follow:\n\n`
  prompt += `${JSON.stringify(flypostEventSchema, null, 2)}\n\n`
  prompt += `Convert this event description into the required JSON-LD format. Output ONLY the JSON object:\n\n`
  prompt += `"${naturalLanguageText}"`

  // Add context if provided
  if (userContext?.defaultLocation) {
    prompt += `\n\nDefault location context: ${userContext.defaultLocation}`
  }
  if (userContext?.timezone) {
    prompt += `\nTimezone context: ${userContext.timezone}`
  }

  return prompt
}

// Main LLM parsing function - single event only
export async function parseEventWithLLM(naturalLanguageText, userContext = {}) {
  if (!openai) {
    initializeOpenAI()
  }

  if (!naturalLanguageText || typeof naturalLanguageText !== 'string') {
    throw new Error('Natural language text is required and must be a string')
  }

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: createUserPrompt(naturalLanguageText, userContext) }
    ]

    console.log('🤖 Sending to OpenAI:', naturalLanguageText)
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000
    })

    const jsonString = completion.choices[0].message.content
    console.log('🤖 LLM Response:', jsonString.substring(0, 200) + '...')

    // Parse the JSON response
    let parsedEvent
    try {
      parsedEvent = JSON.parse(jsonString)
    } catch (parseError) {
      throw new Error(`LLM returned malformed JSON: ${parseError.message}`)
    }

    // Ensure event has required flypost fields
    if (!parsedEvent.flypost) {
      parsedEvent.flypost = {}
    }
    
    // Generate eventId if missing
    if (!parsedEvent.flypost.eventId) {
      parsedEvent.flypost.eventId = `evt_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`
    }

    // Set submission timestamp
    parsedEvent.flypost.submissionTimestamp = new Date().toISOString()

    // Set defaults
    if (parsedEvent.flypost.realTimeData === undefined) parsedEvent.flypost.realTimeData = true
    if (parsedEvent.flypost.crawlable === undefined) parsedEvent.flypost.crawlable = true  
    if (parsedEvent.flypost.queryable === undefined) parsedEvent.flypost.queryable = true

    return parsedEvent

  } catch (error) {
    console.error('LLM parsing error:', error)
    
    if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please check your billing.')
    }
    
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your configuration.')
    }
    
    throw new Error(`Failed to parse event with AI: ${error.message}`)
  }
}