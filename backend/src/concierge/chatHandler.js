/**
 * Web Concierge - Chat Handler
 * 
 * Handles OpenAI chat completions with Flypost event search tool integration.
 * This module is completely isolated from the main v4 ingestion loop.
 */

import OpenAI from 'openai'

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
 * Define the getEventsNear tool for OpenAI function calling
 */
const getEventsNearTool = {
  type: 'function',
  function: {
    name: 'getEventsNear',
    description: 'Search for events near a specific location. Use this when users ask about events, open houses, garage sales, or activities in a particular area.',
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
          description: 'Search radius in kilometers',
          default: 10
        }
      },
      required: ['lat', 'lng'],
      additionalProperties: false
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
  const { lat, lng, radius = 10 } = args
  
  const params = new URLSearchParams()
  params.append('lat', lat.toString())
  params.append('lng', lng.toString())
  params.append('radius', radius.toString())

  const url = `${backendUrl}/v1/events/near?${params.toString()}`
  
  try {
    // Create manual timeout using AbortController for better compatibility
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

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
      events: data.data?.events || [],
      total: data.data?.total || 0
    }
  } catch (error) {
    console.error('Error fetching events:', error)
    return {
      success: false,
      error: error.message || 'Failed to fetch events',
      events: []
    }
  }
}

/**
 * Process a chat message with OpenAI and tool integration
 * 
 * @param {string} message - User's message
 * @param {number} lat - User's latitude
 * @param {number} lng - User's longitude
 * @param {string} backendUrl - Backend URL for API calls
 * @returns {Promise<Object>} Chat response
 */
export async function processChatMessage(message, lat, lng, backendUrl) {
  const openai = getOpenAIClient()
  
  // System prompt for the concierge
  const systemPrompt = `You are a helpful Web Concierge assistant for Flypost, a real-time local events platform. 
Your role is to help users discover nearby events, open houses, garage sales, and local activities.

When users ask about events or activities:
1. Use the getEventsNear tool to search for events near their location
2. Present the results in a friendly, conversational way
3. Highlight key details like event name, date/time, location, and description
4. If no events are found, suggest expanding the search radius or checking back later

Guidelines:
- Be friendly and helpful
- Keep responses concise but informative
- Always respect user privacy - don't ask for personal information
- If the user's location is available, use it; otherwise, ask them to specify a location
- Format dates and times in a user-friendly way

The user's current location is approximately: lat ${lat}, lng ${lng}`

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: message
    }
  ]

  try {
    // Initial call to OpenAI
    let response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: [getEventsNearTool],
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1000
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
        } else {
          result = { error: `Unknown tool: ${functionName}` }
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        })
      }

      // Get next response from OpenAI
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: [getEventsNearTool],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1000
      })

      responseMessage = response.choices[0].message
    }

    return {
      success: true,
      message: responseMessage.content || 'I apologize, but I was unable to generate a response.',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    }
  } catch (error) {
    console.error('OpenAI chat error:', error)
    return {
      success: false,
      message: 'I apologize, but I encountered an error processing your request. Please try again.',
      error: error.message
    }
  }
}
