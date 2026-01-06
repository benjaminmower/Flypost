#!/usr/bin/env node
/**
 * Demonstration script for Concierge timeframe support
 * Shows how the concierge tool schema now supports timeframe filtering
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🎯 Concierge Timeframe Support Demonstration\n')
console.log('=============================================\n')

// Read the chatHandler.js to show the tool schema
const chatHandlerPath = join(__dirname, 'src', 'concierge', 'chatHandler.js')
const chatHandlerContent = readFileSync(chatHandlerPath, 'utf-8')

// Extract the tool schema (simplified for demo)
console.log('🛠️  Updated OpenAI Tool Schema:')
console.log('--------------------------------')
console.log(`
{
  "type": "function",
  "function": {
    "name": "getEventsNear",
    "description": "Search for events near a specific location...",
    "parameters": {
      "type": "object",
      "properties": {
        "lat": { "type": "number", "description": "Latitude" },
        "lng": { "type": "number", "description": "Longitude" },
        "radius": { "type": "number", "description": "Search radius in miles" },
        "timeframe": {
          "type": "string",
          "enum": ["today", "tomorrow", "weekend", "next_7_days", "custom"],
          "description": "Time period to search for events"
        },
        "start": { 
          "type": "string",
          "description": "Start date-time (ISO 8601). Used with timeframe='custom'"
        },
        "end": { 
          "type": "string",
          "description": "End date-time (ISO 8601). Used with timeframe='custom'"
        }
      },
      "required": ["lat", "lng"]
    }
  }
}
`)

console.log('📝 Example Tool Calls from OpenAI:')
console.log('-----------------------------------')
console.log('')

console.log('1️⃣  User: "What\'s open in Santa Monica today?"')
console.log('   Tool call:')
console.log('   {')
console.log('     "lat": 34.0195,')
console.log('     "lng": -118.4912,')
console.log('     "radius": 5,')
console.log('     "timeframe": "today"  ← NEW: Filters to same-day events')
console.log('   }')
console.log('   Result: Events from midnight to 11:59pm today (PT)')
console.log('')

console.log('2️⃣  User: "Show me open houses tomorrow"')
console.log('   Tool call:')
console.log('   {')
console.log('     "lat": 34.0195,')
console.log('     "lng": -118.4912,')
console.log('     "radius": 5,')
console.log('     "timeframe": "tomorrow"  ← NEW: Filters to next day')
console.log('   }')
console.log('   Result: Events from midnight to 11:59pm tomorrow (PT)')
console.log('')

console.log('3️⃣  User: "What\'s happening this weekend?"')
console.log('   Tool call:')
console.log('   {')
console.log('     "lat": 34.0195,')
console.log('     "lng": -118.4912,')
console.log('     "radius": 5,')
console.log('     "timeframe": "weekend"  ← NEW: Filters to Sat+Sun')
console.log('   }')
console.log('   Result: Events from Saturday 12am to Sunday 11:59pm (PT)')
console.log('')

console.log('4️⃣  User: "Events in the next week"')
console.log('   Tool call:')
console.log('   {')
console.log('     "lat": 34.0195,')
console.log('     "lng": -118.4912,')
console.log('     "radius": 5,')
console.log('     "timeframe": "next_7_days"  ← NEW: 7-day window')
console.log('   }')
console.log('   Result: Events from now until 7 days from now')
console.log('')

console.log('5️⃣  User: "Open houses between Jan 20 and Jan 25"')
console.log('   Tool call:')
console.log('   {')
console.log('     "lat": 34.0195,')
console.log('     "lng": -118.4912,')
console.log('     "radius": 5,')
console.log('     "timeframe": "custom",  ← NEW: Custom date range')
console.log('     "start": "2025-01-20T00:00:00Z",')
console.log('     "end": "2025-01-25T23:59:59Z"')
console.log('   }')
console.log('   Result: Events in the specified date range')
console.log('')

console.log('⚙️  How It Works:')
console.log('------------------')
console.log('1. OpenAI receives the updated tool schema with timeframe parameter')
console.log('2. When user asks "today", AI chooses timeframe="today"')
console.log('3. executeGetEventsNear() calculates start/end in PT timezone')
console.log('4. Calls /v1/events/near?start=...&end=... with calculated window')
console.log('5. Backend filters events to match the timeframe')
console.log('')

console.log('✨ System Prompt Updates:')
console.log('-------------------------')
console.log('The concierge system prompt now instructs the AI to:')
console.log('  • Use timeframe parameter for time-based queries')
console.log('  • Map "today" → timeframe=\'today\'')
console.log('  • Map "tomorrow" → timeframe=\'tomorrow\'')
console.log('  • Map "weekend" → timeframe=\'weekend\'')
console.log('  • Display times in local timezone when available')
console.log('')

console.log('🎉 Result:')
console.log('----------')
console.log('Concierge now provides accurate, timezone-aware responses:')
console.log('  ✅ "What\'s open today?" → Only today\'s events')
console.log('  ✅ Times shown in PT (11am) not UTC (7pm)')
console.log('  ✅ Full addresses included (810 Franklin St)')
console.log('  ✅ Timezone info available for future features')
console.log('')
