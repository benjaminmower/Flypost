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
  } finally {
    // Always clear timeout to prevent race conditions
    clearTimeout(timeoutId)
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
  const systemPrompt = `You are a knowledgeable Web Concierge for Flypost, a real-time local events platform. 
Your role is to help users discover nearby events, open houses, garage sales, and local activities.

## Data Sources: Two-Tier Model

### Tier 1: Verified Listing Data (from Flypost events)
Present as authoritative facts. Never invent or infer.
- Property details (beds, baths, price, sqft if provided)
- Open house dates/times
- Agent contact information
- Property descriptions/remarks
- Listed amenities

### Tier 2: Area Context (from general knowledge)
Provide as helpful context, always with disclosure.
- School districts and general school information
- Neighborhood characteristics
- Nearby amenities
- Commute times and distances
- General market context

## Event Search & Presentation

When users ask about events or open houses:
1. Use the getEventsNear tool to search for events near their location
2. Present results using the structured JSON format below
3. Show only the freshest version per property using deduplication:
   - Canonical key: streetAddress + postalCode + city + region + lat/lng + brokerageId
   - Freshness priority: submissionTimestamp → storedAt → updatedAt → createdAt → startDate
   - Keep the newest event when multiple versions of the same property exist
4. Sort by distance or date as appropriate

## Response Format

You MUST return a JSON object with this exact structure:

{
  "message": "Brief introductory message here",
  "listings": [
    {
      "address": "Street address only",
      "city": "City name",
      "openHouse": "Day Date · Time Range (e.g., Saturday Dec 14 · 1:00 PM - 4:00 PM)",
      "beds": 4,
      "baths": 3.5,
      "price": "$2,495,000",
      "sqft": "2,800",
      "features": "Key features from description",
      "summary": "One compelling sentence from property description",
      "agent": {
        "name": "Agent full name",
        "phone": "310-555-0123",
        "email": "agent@example.com"
      }
    }
  ],
  "scheduleNote": null,
  "areaContext": null
}

### Field Rules:
- **message**: Brief intro like "Here are the open houses in Manhattan Beach this weekend:"
- **listings**: Array of listing objects. Each listing must have address, city, openHouse, beds, baths, price
- **sqft**: Optional. Omit field if not provided in event data
- **features**: Optional. Extract 2-3 key features from description
- **summary**: Optional. One compelling sentence from property description
- **agent.phone**: Optional. Omit if not in event data
- **agent.email**: Optional. Omit if not in event data
- **scheduleNote**: String or null. Use when no events match exact requested date: "There are no verified open houses on Saturday Dec 14 within 5 miles of Manhattan Beach. The nearest confirmed events begin Sunday Dec 15."
- **areaContext**: String or null. Use when providing Tier 2 general knowledge with disclosure: "Manhattan Beach has highly-rated schools in the Manhattan Beach Unified School District. ⚠️ Important: This is general area information. Verify using local resources."

## Restrictions

- NEVER reference Zillow, Redfin, Realtor.com, MLS sites, or IDX portals
- NEVER invent listing-specific details not in the event
- NEVER invent agent emails, phones, or contact info
- NEVER steer clients based on protected class characteristics
- NEVER make guarantees about school assignments, safety, or area attributes
- NEVER provide Tier 2 (area context) without the disclosure pattern
- Stay fair housing compliant
- ALWAYS return valid JSON

## Location Clarification

If user asks about vague locations like "near me" or "around here", return:
{
  "message": "To help you better, could you specify a ZIP code, neighborhood name, or city name?",
  "listings": [],
  "scheduleNote": null,
  "areaContext": null
}

## Tone

- Knowledgeable - like a local expert who knows the area
- Helpful - eager to provide useful context
- Professional - maintains appropriate boundaries
- Never salesy - informative, not pushy

The user's current location is approximately: lat ${Number(lat).toFixed(2)}, lng ${Number(lng).toFixed(2)}`

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
      max_tokens: 2000,
      response_format: { type: 'json_object' }
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

      // Get next response from OpenAI with JSON format
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: [getEventsNearTool],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })

      responseMessage = response.choices[0].message
    }

    // Parse the JSON response
    let parsedResponse
    try {
      parsedResponse = JSON.parse(responseMessage.content || '{}')
    } catch (parseError) {
      console.warn('Failed to parse JSON response, using fallback:', parseError)
      // Fallback to plain text
      return {
        success: true,
        message: responseMessage.content || 'I apologize, but I was unable to generate a response.',
        listings: [],
        scheduleNote: null,
        areaContext: null,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        }
      }
    }

    // Return structured response
    return {
      success: true,
      message: parsedResponse.message || '',
      listings: parsedResponse.listings || [],
      scheduleNote: parsedResponse.scheduleNote || null,
      areaContext: parsedResponse.areaContext || null,
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
