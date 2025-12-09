// Example: Ingest events via FlyPost using mcp.flypost.get.json
const axios = require('axios'); // HTTP client library
require('dotenv').config();    // Environment variable loader

// Fetch configuration from .env
const API_KEY = process.env.FLYPOST_API_KEY;
const ENDPOINT = "https://api.flypost.com/v1/get-events";

// Function to fetch events
async function getEvents(brokerageId, eventType, dateRange = {}) {
  try {
    // Create the payload
    const payload = {
      brokerageId,
      eventType,
      dateRange
    };

    // Perform the request
    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    // Log fetched events
    console.log("Fetched Events:", response.data.events);
  } catch (err) {
    console.error("Error fetching events:", err.message);
  }
}

// Example use case
getEvents("compass", "open_house", {
  start: "2025-12-01T00:00:00Z",
  end: "2025-12-09T23:59:59Z"
});
