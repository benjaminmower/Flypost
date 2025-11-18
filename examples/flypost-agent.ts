/**
 * Flypost Agent Example
 * 
 * Demonstrates using OpenAI function calling with Flypost tools.
 * Shows how to:
 * 1. Load Flypost tool definitions
 * 2. Register tools with OpenAI
 * 3. Dispatch tool calls to Flypost client methods
 * 4. Handle two example flows (parse-and-publish and events-near)
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import OpenAI from 'openai'
import { createFlypostClient, FlypostError } from '../clients/flypostClient.js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Validate environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable is required')
  console.error('Please set it in your .env file or export it in your shell')
  process.exit(1)
}

if (!process.env.FLYPOST_API_BASE) {
  console.warn('⚠️  Warning: FLYPOST_API_BASE not set, using default: http://localhost:3001')
}

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const flypostClient = createFlypostClient({
  apiBase: process.env.FLYPOST_API_BASE,
})

// Load Flypost tool definitions
const toolsPath = join(__dirname, '../tools/flypost.tools.json')
const tools = JSON.parse(readFileSync(toolsPath, 'utf-8'))

console.log('🚀 Flypost Agent Example')
console.log('========================\n')
console.log(`Loaded ${tools.length} tools:`)
tools.forEach((tool: any) => {
  console.log(`  - ${tool.function.name}`)
})
console.log()

/**
 * Execute a Flypost tool call
 */
async function executeFlypostTool(toolName: string, args: any): Promise<any> {
  console.log(`\n🔧 Executing tool: ${toolName}`)
  console.log(`   Arguments: ${JSON.stringify(args, null, 2)}`)

  try {
    let result
    
    switch (toolName) {
      case 'flypost_parse_and_publish':
        result = await flypostClient.flypostParseAndPublish(args)
        break
      
      case 'flypost_events_near':
        result = await flypostClient.flypostEventsNear(args)
        break
      
      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }

    console.log(`   ✅ Success`)
    return result
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    if (error instanceof FlypostError) {
      console.error(`      Status: ${error.status}`)
      console.error(`      URL: ${error.url}`)
    }
    throw error
  }
}

/**
 * Run a conversation with the assistant
 */
async function runConversation(userMessage: string) {
  console.log(`\n💬 User: "${userMessage}"`)
  console.log('─'.repeat(60))

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant that can parse events and search for events near locations using Flypost tools. When users describe events, use flypost_parse_and_publish. When users ask about events near a location, use flypost_events_near.',
    },
    {
      role: 'user',
      content: userMessage,
    },
  ]

  let response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
    tools,
    tool_choice: 'auto',
  })

  let responseMessage = response.choices[0].message

  // Handle tool calls
  while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    console.log(`\n🤖 Assistant requested ${responseMessage.tool_calls.length} tool call(s)`)
    
    messages.push(responseMessage)

    // Execute each tool call
    for (const toolCall of responseMessage.tool_calls) {
      const functionName = toolCall.function.name
      const functionArgs = JSON.parse(toolCall.function.arguments)

      try {
        const result = await executeFlypostTool(functionName, functionArgs)
        
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })

        console.log(`   Result preview: ${JSON.stringify(result).substring(0, 150)}...`)
      } catch (error) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        })
      }
    }

    // Get next response from assistant
    response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      tools,
      tool_choice: 'auto',
    })

    responseMessage = response.choices[0].message
  }

  // Final response
  console.log(`\n🤖 Assistant: ${responseMessage.content}`)
  console.log('─'.repeat(60))
}

/**
 * Main function - run example flows
 */
async function main() {
  try {
    // Example 1: Parse and publish an open house event
    console.log('\n📝 Example 1: Parse and Publish Event')
    console.log('=' .repeat(60))
    await runConversation(
      'Create an event for an open house this Sunday from 1-4pm at 2212 Ocean Park Blvd, Santa Monica, CA. It\'s a 3 bed, 2 bath home listed at $1.5M.'
    )

    // Wait a bit between examples
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Example 2: Search for events near a location
    console.log('\n\n🔍 Example 2: Search Events Near Location')
    console.log('='.repeat(60))
    await runConversation(
      'What events are happening near Santa Monica, CA? Show me events within 10km.'
    )

    console.log('\n\n✨ Example completed successfully!')
  } catch (error) {
    console.error('\n❌ Example failed:', error)
    process.exit(1)
  }
}

// Run the example
main()
