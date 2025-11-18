/**
 * Flypost API Client
 * 
 * TypeScript client for interacting with Flypost endpoints.
 * Supports parse-and-publish and events-near operations.
 */

/**
 * Custom error class for Flypost API errors with normalized structure
 */
export class FlypostError extends Error {
  code?: string
  status?: number
  url?: string
  details?: any

  constructor(message: string, options?: {
    code?: string
    status?: number
    url?: string
    details?: any
  }) {
    super(message)
    this.name = 'FlypostError'
    this.code = options?.code
    this.status = options?.status
    this.url = options?.url
    this.details = options?.details
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FlypostError)
    }
  }
}

/**
 * Configuration for Flypost client
 */
export interface FlypostClientConfig {
  apiBase?: string
  timeout?: number
}

/**
 * Request parameters for parse-and-publish endpoint
 */
export interface ParseAndPublishArgs {
  naturalLanguageInput: string
  userContext?: any
}

/**
 * Response from parse-and-publish endpoint
 */
export interface ParseAndPublishResponse {
  eventId: string
  event: any
}

/**
 * API response wrapper for parse-and-publish
 */
interface ParseAndPublishApiResponse {
  success: boolean
  data?: {
    eventId: string
    event: any
    processing?: any
  }
  error?: string
  details?: any
  code?: string
}

/**
 * Request parameters for events-near endpoint
 */
export interface EventsNearArgs {
  lat?: number
  lng?: number
  radius?: number
}

/**
 * Response from events-near endpoint
 */
export interface EventsNearResponse {
  events: any[]
  total: number
}

/**
 * API response wrapper for events-near
 */
interface EventsNearApiResponse {
  success: boolean
  data?: {
    events: any[]
    total: number
    query?: any
    source?: string
    note?: string
  }
  error?: string
  details?: any
  code?: string
}

/**
 * Flypost API Client class
 */
export class FlypostClient {
  private apiBase: string
  private timeout: number

  constructor(config: FlypostClientConfig = {}) {
    this.apiBase = config.apiBase || process.env.FLYPOST_API_BASE || 'http://localhost:3001'
    this.timeout = config.timeout || 30000 // 30 seconds default
  }

  /**
   * Parse a natural-language event description and publish it
   * 
   * @param args - Natural language input and optional user context
   * @returns Event ID and structured event object
   * @throws FlypostError on API errors
   */
  async flypostParseAndPublish(args: ParseAndPublishArgs): Promise<ParseAndPublishResponse> {
    const url = `${this.apiBase}/api/parse-and-publish`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await response.json() as ParseAndPublishApiResponse

      if (!response.ok) {
        throw new FlypostError(
          data.error || `HTTP ${response.status}: ${response.statusText}`,
          {
            status: response.status,
            url,
            details: data.details,
            code: data.code,
          }
        )
      }

      // Extract eventId and event from the response
      if (!data.success || !data.data) {
        throw new FlypostError('Invalid response format from API', {
          status: response.status,
          url,
          details: data,
        })
      }

      return {
        eventId: data.data.eventId,
        event: data.data.event,
      }
    } catch (error: any) {
      if (error instanceof FlypostError) {
        throw error
      }
      
      // Handle timeout
      if (error.name === 'AbortError') {
        throw new FlypostError('Request timeout', {
          code: 'TIMEOUT',
          url,
        })
      }

      // Handle network errors
      throw new FlypostError(error.message || 'Network request failed', {
        url,
        details: error,
      })
    }
  }

  /**
   * Get events near a location
   * 
   * @param args - Latitude, longitude, and radius (all optional)
   * @returns List of events and total count
   * @throws FlypostError on API errors
   */
  async flypostEventsNear(args: EventsNearArgs = {}): Promise<EventsNearResponse> {
    const { lat, lng, radius = 10 } = args
    
    const params = new URLSearchParams()
    if (lat !== undefined) params.append('lat', lat.toString())
    if (lng !== undefined) params.append('lng', lng.toString())
    params.append('radius', radius.toString())

    const url = `${this.apiBase}/v1/events/near?${params.toString()}`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await response.json() as EventsNearApiResponse

      if (!response.ok) {
        throw new FlypostError(
          data.error || `HTTP ${response.status}: ${response.statusText}`,
          {
            status: response.status,
            url,
            details: data.details,
            code: data.code,
          }
        )
      }

      // Extract events and total from the response
      if (!data.success || !data.data) {
        throw new FlypostError('Invalid response format from API', {
          status: response.status,
          url,
          details: data,
        })
      }

      return {
        events: data.data.events || [],
        total: data.data.total || 0,
      }
    } catch (error: any) {
      if (error instanceof FlypostError) {
        throw error
      }
      
      // Handle timeout
      if (error.name === 'AbortError') {
        throw new FlypostError('Request timeout', {
          code: 'TIMEOUT',
          url,
        })
      }

      // Handle network errors
      throw new FlypostError(error.message || 'Network request failed', {
        url,
        details: error,
      })
    }
  }
}

/**
 * Create a default Flypost client instance
 */
export function createFlypostClient(config?: FlypostClientConfig): FlypostClient {
  return new FlypostClient(config)
}
