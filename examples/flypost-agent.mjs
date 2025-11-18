/**
 * Flypost Agent Example (JS/ESM)
 *
 * This version avoids ts-node and runs with plain Node 22+.
 * It:
 * 1. Loads Flypost tool definitions
 * 2. Registers them with OpenAI
 * 3. Dispatches tool calls via HTTP to your live Flypost API
 * 4. Runs two flows:
 *    - parse-and-publish (open house)
 *    - events-near (query around Santa Monica)
 */

import dotenv from 'dotenv'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables from .env
dotenv.config()

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// --- ENV VALIDATION ----------------------------------------------------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
let FLYPOST_API_BASE = process.env.FLYPOST_API_BASE

if (!OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY. Set it in .env or export it in your shell.')
  process.exit(1)
}

if (!FLYPOST_API_BASE) {
  FLYPOST_API_BASE = 'http://localhost:3001'
  console.warn(`⚠️  FLYPOST_API_BASE not set. Defaulting to ${FLYPOST_API_BASE}`)
}

console.log('🚀 Flypost Agent Example (JS)')
console.log('================================')
console.log('🔧 Flypost API:', FLYPOST_API_BASE)
console.log('')

// --- INIT OPENAI + TOOLS ----------------------------------------------

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const toolsPath = join(__dirname, '../tools/flypost.tools.json')
const toolsJson = JSON.parse(readFileSync(toolsPath, 'utf-8'))

console.log(`Loaded ${toolsJson.length} tools:`)
for (const t of toolsJson) {
  console.log('  -', t.function.name)
}
console.log('')

// --- SIMPLE HTTP HELPERS ----------------------------------------------

async function flypostParseAndPublish(args) {
  const url = `${FLYPOST_API_BASE}/api/parse-and-publish`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      naturalLanguageInput: args.naturalLanguageInput,
      userContext: args.userContext ?? { source: 'flypost-agent-example' },
    }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok || json.success === false) {
    throw new Error(
      `flypost_parse_and_publish failed: status=${res.status} message=${json.error || res.statusText}`
    )
  }

  return json
}

async function flypostEventsNear(args) {
  const params = new URLSearchParams()

  if (args.latitude != null) params.set('lat', String(args.latitude))
  if (args.longitude != null) params.set('lng', String(args.longitude))
  if (args.radiusKm != null) params.set('radius', String(args.radiusKm))

  const url = `${FLYPOST_API_BASE}/v1/events/near?` + params.toString()
  const res = await fetch(url)

  const json = await res.json().catch(() => ({}))

  if (!res.ok || json.success === false) {
    throw new Error(
      `flypost_events_near failed: status=${res.status} message=${json.error || res.statusText}`
    )
  }

  return json
}

// Dispatch based on tool name
async function executeFlypostTool(toolName, args) {
  console.log(`\n🔧 Executing tool: ${toolName}`)
  console.log('   Args:', JSON.stringify(args, null, 2))

  if (toolName === 'flypost_parse_and_publish') {
    const result = await flypostParseAndPublish(args)
    console.log('   ✅ parse-and-publish succeeded')
    return result
  }

  if (toolName === 'flypost_events_near') {
    const result = await flypostEventsNear(args)
    console.log('   ✅ events-near succeeded')
    return result
  }

  throw new Error(`Unknown tool: ${toolName}`)
}

// --- CONVERSATION DRIVER ----------------------------------------------

async function runConversation(userMessage) {
  console.log(`\n💬 User: "${userMessage}"`)
  console.log('─'.repeat(60))

  const messages = [
    {
      role: 'system',
      content:
        'You are a helpful assistant that uses Flypost tools to parse events and search events near a location.',
    },
    { role: 'user', content: userMessage },
  ]

  let response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages,
    tools: toolsJson,
    tool_choice: 'auto',
  })

  let msg = response.choices[0].message

  // Handle tool_calls loop
  while (msg.tool_calls && msg.tool_calls.length > 0) {
    console.log(`\n🤖 Assistant requested ${msg.tool_calls.length} tool call(s)`)
    messages.push(msg)

    for (const toolCall of msg.tool_calls) {
      const fnName = toolCall.function.name
      const fnArgs = JSON.parse(toolCall.function.arguments || '{}')

      let toolResult
      try {
        toolResult = await executeFlypostTool(fnName, fnArgs)
      } catch (err) {
        console.error('   ❌ Tool error:', err.message || err)
        toolResult = { error: String(err.message || err) }
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      })

      console.log(
        '   Result preview:',
        JSON.stringify(toolResult).slice(0, 200) + (JSON.stringify(toolResult).length > 200 ? '...' : '')
      )
    }

    response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      tools: toolsJson,
      tool_choice: 'auto',
    })

    msg = response.choices[0].message
  }

  console.log('\n🤖 Assistant final reply:')
  console.log(msg.content)
  console.log('─'.repeat(60))
}

// --- MAIN --------------------------------------------------------------

async function main() {
  try {
    console.log('\n📝 Example 1: Parse and Publish Event')
    console.log('='.repeat(60))
    await runConversation(
      "Create an event for an open house this Sunday from 1-4pm at 2212 Ocean Park Blvd, Santa Monica, CA. It's a 3 bed, 2 bath home listed at $1.5M."
    )

    // A short pause between examples
    await new Promise((r) => setTimeout(r, 1500))

    console.log('\n\n🔍 Example 2: Search Events Near Location')
    console.log('='.repeat(60))
    await runConversation('What events are happening near Santa Monica, CA? Show me events within 10km.')

    console.log('\n✨ Flypost agent example completed successfully.\n')
  } catch (err) {
    console.error('\n❌ Agent example failed:', err)
    process.exit(1)
  }
}

main()
