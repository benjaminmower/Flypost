/**
 * Flypost Agent Example
 * 
 * Demonstrates using Flypost tools with OpenAI function calling.
 * This example shows two flows:
 * 1. Parse and publish a natural-language event description
 * 2. Search for events near a location
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import {
  flypostParseAndPublish,
  flypostEventsNear,
  FlypostError,
} from '../clients/flypostClient.js';

// ES modules workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment validation
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FLYPOST_API_BASE = process.env.FLYPOST_API_BASE || 'http://localhost:3001';

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  console.error('Please set it in your .env file or environment');
  process.exit(1);
}

console.log(`Using Flypost API at: ${FLYPOST_API_BASE}`);

// Load tools definition
const toolsPath = path.join(__dirname, '../tools/flypost.tools.json');
const tools = JSON.parse(fs.readFileSync(toolsPath, 'utf-8'));

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * Execute a tool call by dispatching to the appropriate Flypost client method
 */
async function executeToolCall(toolName: string, args: any): Promise<any> {
  console.log(`\n🔧 Executing tool: ${toolName}`);
  console.log(`📥 Arguments:`, JSON.stringify(args, null, 2));

  try {
    let result;
    
    switch (toolName) {
      case 'flypost_parse_and_publish':
        result = await flypostParseAndPublish(args);
        break;
      case 'flypost_events_near':
        result = await flypostEventsNear(args);
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    console.log(`✅ Tool result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    if (error instanceof FlypostError) {
      console.error(`❌ Flypost Error: ${error.message}`);
      console.error(`   Status: ${error.status}`);
      console.error(`   URL: ${error.url}`);
      if (error.details) {
        console.error(`   Details:`, error.details);
      }
    } else {
      console.error(`❌ Error executing tool:`, error);
    }
    throw error;
  }
}

/**
 * Run a conversation with the OpenAI assistant using tools
 */
async function runConversation(userMessage: string): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`💬 User: ${userMessage}`);
  console.log(`${'='.repeat(80)}`);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant that can parse events and search for events using Flypost tools.',
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];

  let response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: 'auto',
  });

  let responseMessage = response.choices[0].message;
  messages.push(responseMessage);

  // Handle tool calls
  while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    console.log(`\n🤖 Assistant wants to call ${responseMessage.tool_calls.length} tool(s)`);

    for (const toolCall of responseMessage.tool_calls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      try {
        const functionResult = await executeToolCall(functionName, functionArgs);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResult),
        });
      } catch (error) {
        // Send error back to the assistant
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        });
      }
    }

    // Get next response from assistant
    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
    });

    responseMessage = response.choices[0].message;
    messages.push(responseMessage);
  }

  // Final assistant response
  console.log(`\n🤖 Assistant: ${responseMessage.content}`);
}

/**
 * Main function - demonstrates two flows
 */
async function main() {
  console.log('\n🚀 Flypost Agent Example\n');

  try {
    // Flow 1: Parse and publish an event
    await runConversation(
      'Create an event for an open house this Sunday from 1-4pm at 2212 Ocean Park Blvd, Santa Monica. It\'s a 3 bed, 2 bath home listed at $1.5M.'
    );

    // Flow 2: Search for events near a location
    await runConversation(
      'Find events near Santa Monica (latitude 34.0195, longitude -118.4912) within 10 km.'
    );

    console.log('\n✨ Example completed successfully\n');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

// Run the example
main();
