# Web Concierge - Conversation Examples

This document demonstrates how to use the enhanced Web Concierge features including conversation history, suggested follow-ups, and dynamic filtering.

## Example 1: Basic Query with Suggested Follow-Ups

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What open houses are happening this weekend in Santa Monica?",
    "lat": 34.0195,
    "lng": -118.4912
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Here are the open houses in Santa Monica this weekend:",
  "listings": [
    {
      "address": "123 Ocean Ave",
      "city": "Santa Monica",
      "state": "CA",
      "zipCode": "90401",
      "openHouse": "Saturday Dec 14 · 1:00 PM - 4:00 PM",
      "beds": 3,
      "baths": 2.5,
      "price": "$1,495,000",
      "sqft": "2,100",
      "distance": "0.3 miles",
      "features": "Ocean views, updated kitchen, hardwood floors",
      "summary": "Stunning coastal home with panoramic ocean views.",
      "agent": {
        "name": "Jane Smith",
        "phone": "310-555-0123",
        "email": "jane@realestate.com",
        "brokerage": "Ocean View Realty"
      }
    }
  ],
  "scheduleNote": null,
  "areaContext": null,
  "suggestedFollowUps": [
    "Can you tell me more about the property at 123 Ocean Ave?",
    "Are there any open houses on Sunday?",
    "What about open houses in nearby Venice Beach?"
  ],
  "timestamp": "2024-12-11T10:00:00.000Z"
}
```

## Example 2: Follow-Up Conversation

**Initial Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me open houses in Manhattan Beach",
    "lat": 33.8847,
    "lng": -118.4109
  }'
```

**Follow-Up Request (with conversation history):**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What about tomorrow?",
    "lat": 33.8847,
    "lng": -118.4109,
    "conversationHistory": [
      {
        "role": "user",
        "content": "Show me open houses in Manhattan Beach"
      },
      {
        "role": "assistant",
        "content": "{\"message\": \"Here are the open houses in Manhattan Beach this weekend:\", \"listings\": [...], \"suggestedFollowUps\": [\"Are there any tomorrow?\"]}"
      }
    ]
  }'
```

**Response:**
The AI will understand "tomorrow" in context of the previous query about Manhattan Beach and provide relevant results.

## Example 3: Dynamic Date Filtering

### Query: "This Weekend"
```json
{
  "message": "What's happening this weekend?",
  "lat": 34.0195,
  "lng": -118.4912
}
```
→ Returns events for Saturday and Sunday of the current week

### Query: "Today"
```json
{
  "message": "Show me events today",
  "lat": 34.0195,
  "lng": -118.4912
}
```
→ Returns events for the current date only

### Query: "Next Week"
```json
{
  "message": "Any open houses next week?",
  "lat": 34.0195,
  "lng": -118.4912
}
```
→ Returns events for Monday through Sunday of the following week

## Example 4: Schedule Note (No Matching Events)

**Request:**
```json
{
  "message": "Are there open houses on Christmas Day?",
  "lat": 34.0195,
  "lng": -118.4912
}
```

**Response:**
```json
{
  "success": true,
  "message": "I checked for open houses on December 25th.",
  "listings": [],
  "scheduleNote": "There are no verified open houses on Christmas Day within 10 miles of your location. The nearest confirmed events are on December 26th.",
  "areaContext": null,
  "suggestedFollowUps": [
    "Show me open houses for December 26th",
    "What about the weekend after Christmas?",
    "Are there any events this week?"
  ],
  "timestamp": "2024-12-11T10:00:00.000Z"
}
```

## Example 5: Area Context (Tier 2 Information)

**Request:**
```json
{
  "message": "Tell me about schools near the open houses in Manhattan Beach",
  "lat": 33.8847,
  "lng": -118.4109
}
```

**Response:**
```json
{
  "success": true,
  "message": "Here are the open houses in Manhattan Beach, with school information:",
  "listings": [
    {
      "address": "456 Highland Ave",
      "city": "Manhattan Beach",
      "state": "CA",
      "zipCode": "90266",
      "openHouse": "Saturday Dec 14 · 2:00 PM - 5:00 PM",
      "beds": 4,
      "baths": 3,
      "price": "$2,495,000",
      "sqft": "2,800"
    }
  ],
  "scheduleNote": null,
  "areaContext": "Manhattan Beach is served by the Manhattan Beach Unified School District, which includes highly-rated schools such as Manhattan Beach Middle School and Mira Costa High School. ⚠️ Important: This is general area information. School assignments can change, and boundaries should be verified with the school district.",
  "suggestedFollowUps": [
    "What are the specific schools for 456 Highland Ave?",
    "Tell me more about the property features",
    "Are there other open houses in this school district?"
  ],
  "timestamp": "2024-12-11T10:00:00.000Z"
}
```

## Example 6: Brokerage-Filtered Query

**Request:**
```json
{
  "message": "Show me Vista Sotheby's open houses",
  "lat": 34.0195,
  "lng": -118.4912,
  "brokerageId": "vista-sir"
}
```

**Response:**
Only returns listings from Vista Sotheby's International Realty, with agent.brokerage field populated.

## Example 7: Multi-Turn Conversation

**Turn 1:**
```json
{
  "message": "What's near me?",
  "lat": 34.0195,
  "lng": -118.4912
}
```

**Response 1:**
```json
{
  "message": "Here are events near you in Santa Monica:",
  "listings": [...],
  "suggestedFollowUps": [
    "Filter by price range",
    "Show me only 3+ bedroom homes",
    "What about tomorrow's events?"
  ]
}
```

**Turn 2 (with history):**
```json
{
  "message": "Show me only 3+ bedroom homes",
  "lat": 34.0195,
  "lng": -118.4912,
  "conversationHistory": [
    {
      "role": "user",
      "content": "What's near me?"
    },
    {
      "role": "assistant", 
      "content": "{\"message\": \"Here are events near you in Santa Monica:\", \"listings\": [...]}"
    }
  ]
}
```

**Response 2:**
Filters previous results to show only properties with 3 or more bedrooms.

## Tips for Using Conversation History

1. **Format**: Pass an array of message objects with `role` and `content`
2. **Roles**: Use `"user"` for user messages, `"assistant"` for AI responses
3. **Limit**: Only the last 10 messages are used to control token usage
4. **Content**: For assistant messages, include the full JSON response as a string
5. **Context**: The AI uses history to understand follow-up questions like "What about tomorrow?" or "Tell me more about the first one"

## Best Practices

- **Use Suggested Follow-Ups**: Present these to users as clickable options
- **Maintain History**: Store conversation history on the client side
- **Clear Context**: Allow users to start a new conversation (clear history)
- **Validate History**: Ensure history array is properly formatted before sending
- **Limit Size**: Keep history under 10 messages to avoid excessive token usage

## Error Handling

If conversation history is malformed:
```json
{
  "success": false,
  "error": "Invalid \"conversationHistory\" field. Must be an array if provided."
}
```

## Integration Example (JavaScript)

```javascript
class ConciergeChat {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this.history = [];
  }

  async sendMessage(message, lat, lng) {
    const response = await fetch(`${this.apiBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        lat,
        lng,
        conversationHistory: this.history
      })
    });

    const data = await response.json();

    // Update history
    this.history.push({
      role: 'user',
      content: message
    });
    
    if (data.success) {
      this.history.push({
        role: 'assistant',
        content: JSON.stringify({
          message: data.message,
          listings: data.listings,
          suggestedFollowUps: data.suggestedFollowUps
        })
      });
    }

    // Limit history to last 10 messages
    if (this.history.length > 10) {
      this.history = this.history.slice(-10);
    }

    return data;
  }

  clearHistory() {
    this.history = [];
  }
}

// Usage
const chat = new ConciergeChat('http://localhost:3001');
const result1 = await chat.sendMessage('What open houses are near me?', 34.0195, -118.4912);
const result2 = await chat.sendMessage('What about tomorrow?', 34.0195, -118.4912);
```

## See Also

- [README.md](./README.md) - Main documentation
- [USAGE.md](./USAGE.md) - Basic usage examples
- [BROKERAGE_INTEGRATION.md](./BROKERAGE_INTEGRATION.md) - Brokerage-specific configuration
