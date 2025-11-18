/**
 * Flypost TypeScript Client
 * 
 * Thin client for interacting with Flypost API endpoints.
 * Normalizes OpenAPI response wrappers and provides clean error handling.
 */

// Environment configuration
const FLYPOST_API_BASE = process.env.FLYPOST_API_BASE || 'http://localhost:3001';

/**
 * Custom error class for Flypost API errors
 */
export class FlypostError extends Error {
  public code?: string;
  public status?: number;
  public url?: string;
  public details?: any;

  constructor(message: string, options?: {
    code?: string;
    status?: number;
    url?: string;
    details?: any;
  }) {
    super(message);
    this.name = 'FlypostError';
    this.code = options?.code;
    this.status = options?.status;
    this.url = options?.url;
    this.details = options?.details;
  }
}

/**
 * Parse and publish a natural-language event description
 * 
 * @param args - The parse and publish arguments
 * @param args.naturalLanguageInput - Raw event description
 * @param args.userContext - Optional metadata about the caller or channel
 * @returns Normalized response with eventId and event
 */
export async function flypostParseAndPublish(args: {
  naturalLanguageInput: string;
  userContext?: any;
}): Promise<{ eventId: string; event: any }> {
  const url = `${FLYPOST_API_BASE}/api/parse-and-publish`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        naturalLanguageInput: args.naturalLanguageInput,
        userContext: args.userContext,
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      throw new FlypostError(
        data.error || `HTTP ${response.status}: ${response.statusText}`,
        {
          status: response.status,
          url,
          details: data.details,
        }
      );
    }

    // Normalize OpenAPI response wrapper: { success, data: { eventId, event, ... } }
    if (!data.success || !data.data) {
      throw new FlypostError('Invalid response format', {
        status: response.status,
        url,
        details: data,
      });
    }

    return {
      eventId: data.data.eventId,
      event: data.data.event,
    };
  } catch (error) {
    if (error instanceof FlypostError) {
      throw error;
    }
    
    // Network errors, timeout, etc.
    throw new FlypostError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      {
        url,
        details: error,
      }
    );
  }
}

/**
 * Retrieve events near a latitude/longitude within a search radius
 * 
 * @param args - The events near query arguments
 * @param args.lat - Latitude in decimal degrees (defaults to Santa Monica)
 * @param args.lng - Longitude in decimal degrees (defaults to Santa Monica)
 * @param args.radius - Search radius in kilometers (default: 10)
 * @returns Normalized response with events and total
 */
export async function flypostEventsNear(args?: {
  lat?: number;
  lng?: number;
  radius?: number;
}): Promise<{ events: any[]; total: number }> {
  const queryParams = new URLSearchParams();
  
  // Only include defined query params
  if (args?.lat !== undefined) {
    queryParams.append('lat', args.lat.toString());
  }
  if (args?.lng !== undefined) {
    queryParams.append('lng', args.lng.toString());
  }
  if (args?.radius !== undefined) {
    queryParams.append('radius', args.radius.toString());
  } else {
    // Default radius to 10 when omitted
    queryParams.append('radius', '10');
  }

  const queryString = queryParams.toString();
  const url = `${FLYPOST_API_BASE}/v1/events/near${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json() as any;

    if (!response.ok) {
      throw new FlypostError(
        data.error || `HTTP ${response.status}: ${response.statusText}`,
        {
          status: response.status,
          url,
          details: data.details,
        }
      );
    }

    // Normalize OpenAPI response wrapper: { success, data: { events, total, ... } }
    if (!data.success || !data.data) {
      throw new FlypostError('Invalid response format', {
        status: response.status,
        url,
        details: data,
      });
    }

    return {
      events: data.data.events,
      total: data.data.total,
    };
  } catch (error) {
    if (error instanceof FlypostError) {
      throw error;
    }
    
    // Network errors, timeout, etc.
    throw new FlypostError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      {
        url,
        details: error,
      }
    );
  }
}
