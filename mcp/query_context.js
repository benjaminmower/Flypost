// Example: Parse and normalize event data using mcp.flypost.parse.json
const axios = require('axios'); // HTTP client library
require('dotenv').config();    // Environment variable loader

// Fetch configuration from .env
const API_KEY = process.env.FLYPOST_API_KEY;
const ENDPOINT = "https://api.flypost.com/v1/parse-events";

// Function to parse and normalize events
async function parseAndNormalize(naturalLanguageInput, brokerageId) {
  try {
    // Create the payload
    const payload = {
      naturalLanguageInput,
      brokerageId,
      contextOverrides: {
        timeZone: "America/New_York",
        language: "en"
      }
    };

    // Perform the request
    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    // Log the normalized event
    console.log("Normalized Event:", response.data.normalizedEvent);
  } catch (err) {
    console.error("Error parsing and normalizing event:", err.message);
  }
}

// Example use case
parseAndNormalize(
  "Join us for an open house on Tuesday, December 12 at 1 PM at 123 Main Street, New York.",
  "compass"
);
