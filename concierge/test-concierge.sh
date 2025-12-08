#!/bin/bash
# Example: Testing the Web Concierge Chat API
# 
# This script demonstrates how to interact with the /api/chat endpoint
# 
# Usage:
#   ./test-concierge.sh

API_BASE="${FLYPOST_API_BASE:-http://localhost:3001}"

echo "🧪 Testing Web Concierge API"
echo "=============================="
echo ""

# Test 1: Health check
echo "1️⃣  Health Check"
echo "   Endpoint: GET $API_BASE/api/chat/health"
curl -s "$API_BASE/api/chat/health" | jq .
echo ""

# Test 2: Valid chat request
echo "2️⃣  Valid Chat Request"
echo "   Location: Santa Monica, CA (34.0195, -118.4912)"
echo "   Message: What events are happening near me?"
curl -s -X POST "$API_BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What events are happening near me?",
    "lat": 34.0195,
    "lng": -118.4912
  }' | jq .
echo ""

# Test 3: Missing message
echo "3️⃣  Invalid Request - Empty Message"
curl -s -X POST "$API_BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "",
    "lat": 34.0195,
    "lng": -118.4912
  }' | jq .
echo ""

# Test 4: Invalid coordinates
echo "4️⃣  Invalid Request - Bad Coordinates"
curl -s -X POST "$API_BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test",
    "lat": 200,
    "lng": -118.4912
  }' | jq .
echo ""

# Test 5: Different location (New York)
echo "5️⃣  Different Location - New York, NY"
echo "   Location: New York, NY (40.7128, -74.0060)"
curl -s -X POST "$API_BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Are there any open houses this weekend?",
    "lat": 40.7128,
    "lng": -74.0060
  }' | jq .
echo ""

echo "✅ Tests complete!"
