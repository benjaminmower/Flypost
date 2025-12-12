/**
 * Test streaming endpoint
 * 
 * Run: node backend/test-streaming-endpoint.js
 */

import { processChatMessage } from './src/concierge/chatHandler.js'

async function testStreaming() {
  console.log('🧪 Testing streaming chat endpoint...\n')
  
  const message = 'Hello, what can you help me with?'
  const lat = 34.0195
  const lng = -118.4912
  const backendUrl = 'http://localhost:3001'
  
  let streamedContent = ''
  let tokenCount = 0
  
  console.log('📤 Sending message:', message)
  console.log('📍 Location:', lat, lng)
  console.log('---')
  console.log('🔄 Streaming response:\n')
  
  const startTime = Date.now()
  
  try {
    await processChatMessage(
      message,
      lat,
      lng,
      backendUrl,
      undefined, // no brokerageId
      [], // empty conversation history
      (token) => {
        // Stream callback
        streamedContent += token
        tokenCount++
        process.stdout.write(token)
      }
    )
    
    const duration = Date.now() - startTime
    
    console.log('\n\n---')
    console.log(`✅ Streaming completed in ${duration}ms`)
    console.log(`📊 Total tokens received: ${tokenCount}`)
    console.log(`📝 Total content length: ${streamedContent.length} chars`)
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

// Check for required env vars
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable is required')
  process.exit(1)
}

testStreaming()
