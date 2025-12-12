/**
 * Web Concierge - Helper Utilities
 * 
 * Deterministic planning and comparison helpers for creating
 * intelligent itineraries and property comparisons.
 */

/**
 * Calculate approximate walking distance based on lat/lng coordinates
 * Uses the Haversine formula for distance calculation
 * 
 * @param {number} lat1 - Starting latitude
 * @param {number} lng1 - Starting longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lng2 - Destination longitude
 * @returns {number} Distance in miles
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Estimate travel time based on distance
 * Uses static estimates for walking and driving
 * 
 * @param {number} distanceMiles - Distance in miles
 * @param {string} mode - Travel mode: 'walking' or 'driving'
 * @returns {string} Formatted time estimate (e.g., "5 min", "1 hr 15 min")
 */
export function estimateTravelTime(distanceMiles, mode = 'driving') {
  let minutes;
  
  if (mode === 'walking') {
    // Average walking speed: 3 mph
    minutes = Math.round((distanceMiles / 3) * 60);
  } else {
    // Average driving speed in urban areas: 25 mph (accounting for traffic)
    minutes = Math.round((distanceMiles / 25) * 60);
  }
  
  if (minutes < 60) {
    return `${minutes} min`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
  }
}

/**
 * Generate a time-boxed itinerary of events near a location
 * 
 * @param {Array} events - Array of event objects with location and time data
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @param {number} maxDurationMinutes - Maximum total duration in minutes
 * @returns {Object} Itinerary with events and travel times
 */
export function generateItinerary(events, userLat, userLng, maxDurationMinutes = 60) {
  if (!events || events.length === 0) {
    return {
      totalTime: 0,
      events: [],
      disclaimer: '⚠️ No events available for itinerary planning.'
    };
  }
  
  // Calculate distance from user for each event
  const eventsWithDistance = events.map(event => {
    const eventLat = event.location?.geo?.latitude || event.lat;
    const eventLng = event.location?.geo?.longitude || event.lng;
    
    if (eventLat && eventLng) {
      const distance = calculateDistance(userLat, userLng, eventLat, eventLng);
      return {
        ...event,
        distanceFromUser: distance,
        travelTimeWalking: estimateTravelTime(distance, 'walking'),
        travelTimeDriving: estimateTravelTime(distance, 'driving')
      };
    }
    return null;
  }).filter(e => e !== null);
  
  // Sort by distance (closest first)
  eventsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);
  
  // Build itinerary within time constraint
  const itinerary = [];
  let totalTime = 0;
  const averageEventDuration = 30; // Assume 30 min per open house
  
  for (const event of eventsWithDistance) {
    const travelMinutes = parseInt(event.travelTimeDriving.split(' ')[0]);
    const eventTime = averageEventDuration;
    const segmentTime = travelMinutes + eventTime;
    
    if (totalTime + segmentTime <= maxDurationMinutes) {
      itinerary.push(event);
      totalTime += segmentTime;
    } else {
      break; // Reached time limit
    }
  }
  
  return {
    totalTime,
    events: itinerary,
    disclaimer: '⚠️ **Important**: Travel times are estimates based on average speeds. Actual times may vary with traffic, route, and conditions. Always verify addresses and allow extra time.'
  };
}

/**
 * Normalize listing attributes for side-by-side comparison
 * 
 * @param {Array} listings - Array of listing objects
 * @returns {Object} Normalized comparison data
 */
export function normalizeForComparison(listings) {
  if (!listings || listings.length === 0) {
    return {
      fields: [],
      listings: [],
      disclaimer: '⚠️ No listings available for comparison.'
    };
  }
  
  // Define comparable fields
  const comparableFields = [
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'price', label: 'Price' },
    { key: 'beds', label: 'Bedrooms' },
    { key: 'baths', label: 'Bathrooms' },
    { key: 'sqft', label: 'Square Feet' },
    { key: 'distanceFromUser', label: 'Distance' },
    { key: 'openHouse', label: 'Open House' }
  ];
  
  // Normalize each listing
  const normalizedListings = listings.map(listing => {
    const normalized = {};
    
    comparableFields.forEach(field => {
      let value = listing[field.key];
      
      // Normalize values for comparison
      if (field.key === 'price') {
        // Extract numeric value from price string
        if (typeof value === 'string') {
          const numericPrice = parseInt(value.replace(/[^0-9]/g, ''));
          normalized[field.key] = {
            display: value,
            numeric: numericPrice
          };
        } else {
          normalized[field.key] = { display: 'N/A', numeric: 0 };
        }
      } else if (field.key === 'sqft') {
        if (typeof value === 'string') {
          const numericSqft = parseInt(value.replace(/[^0-9]/g, ''));
          normalized[field.key] = {
            display: value,
            numeric: numericSqft
          };
        } else if (typeof value === 'number') {
          normalized[field.key] = {
            display: value.toLocaleString(),
            numeric: value
          };
        } else {
          normalized[field.key] = { display: 'N/A', numeric: 0 };
        }
      } else if (field.key === 'distanceFromUser') {
        if (typeof value === 'number') {
          normalized[field.key] = {
            display: `${value.toFixed(1)} mi`,
            numeric: value
          };
        } else if (typeof value === 'string') {
          normalized[field.key] = {
            display: value,
            numeric: parseFloat(value) || 0
          };
        } else {
          normalized[field.key] = { display: 'N/A', numeric: 0 };
        }
      } else {
        // Direct values
        normalized[field.key] = {
          display: value || 'N/A',
          numeric: parseFloat(value) || 0
        };
      }
    });
    
    return normalized;
  });
  
  return {
    fields: comparableFields,
    listings: normalizedListings,
    disclaimer: '⚠️ **Comparison Note**: Data shown is as reported in listings. Always verify details directly with listing agents. Property features and conditions may vary.'
  };
}

/**
 * Calculate price per square foot
 * 
 * @param {string|number} price - Price string or number
 * @param {string|number} sqft - Square footage string or number
 * @returns {string} Formatted price per sqft
 */
export function calculatePricePerSqft(price, sqft) {
  try {
    const numericPrice = typeof price === 'string' 
      ? parseInt(price.replace(/[^0-9]/g, ''))
      : price;
    
    const numericSqft = typeof sqft === 'string'
      ? parseInt(sqft.replace(/[^0-9]/g, ''))
      : sqft;
    
    if (!numericPrice || !numericSqft || numericSqft === 0) {
      return 'N/A';
    }
    
    const pricePerSqft = Math.round(numericPrice / numericSqft);
    return `$${pricePerSqft.toLocaleString()}/sqft`;
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Generate distance annotation for events
 * 
 * @param {Array} events - Array of events
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @returns {Array} Events with distance annotations
 */
export function annotateWithDistance(events, userLat, userLng) {
  if (!events || events.length === 0) {
    return [];
  }
  
  return events.map(event => {
    const eventLat = event.location?.geo?.latitude || event.lat;
    const eventLng = event.location?.geo?.longitude || event.lng;
    
    if (eventLat && eventLng) {
      const distance = calculateDistance(userLat, userLng, eventLat, eventLng);
      return {
        ...event,
        distanceFromUser: distance,
        distanceDisplay: `${distance.toFixed(1)} miles`,
        travelTimeWalking: estimateTravelTime(distance, 'walking'),
        travelTimeDriving: estimateTravelTime(distance, 'driving')
      };
    }
    
    return event;
  });
}
