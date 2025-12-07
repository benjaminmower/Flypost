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
  category?: 'NETWORK_ERROR' | 'SERVER_ERROR' | 'TIMEOUT' | 'CLIENT_ERROR' | 'UNKNOWN'

  constructor(message: string, options?: {
    code?: string
    status?: number
    url?: string
    details?: any
    category?: 'NETWORK_ERROR' | 'SERVER_ERROR' | 'TIMEOUT' | 'CLIENT_ERROR' | 'UNKNOWN'
  }) {
    super(message)
    this.name = 'FlypostError'
    this.code = options?.code
    this.status = options?.status
    this.url = options?.url
    this.details = options?.details
    this.category = options?.category || this.categorizeError(options?.status, options?.code)
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FlypostError)
    }
  }

  private categorizeError(status?: number, code?: string): 'NETWORK_ERROR' | 'SERVER_ERROR' | 'TIMEOUT' | 'CLIENT_ERROR' | 'UNKNOWN' {
    if (code === 'TIMEOUT') return 'TIMEOUT'
    if (!status) return 'NETWORK_ERROR'
    if (status >= 500) return 'SERVER_ERROR'
    if (status >= 400 && status < 500) return 'CLIENT_ERROR'
    return 'UNKNOWN'
  }
}

/**
 * Configuration for Flypost client
 */
export interface FlypostClientConfig {
  apiBase?: string
  timeout?: number
  retryAttempts?: number
  retryDelay?: number
  isMobile?: boolean
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
  private retryAttempts: number
  private retryDelay: number
  private isMobile: boolean

  constructor(config: FlypostClientConfig = {}) {
    this.apiBase = config.apiBase || process.env.FLYPOST_API_BASE || 'http://localhost:3001'
    
    // Detect mobile or use explicit config
    this.isMobile = config.isMobile ?? this.detectMobile()
    
    // Mobile gets longer timeout (90s vs 60s)
    const defaultTimeout = this.isMobile ? 90000 : 60000
    this.timeout = config.timeout || defaultTimeout
    
    this.retryAttempts = config.retryAttempts ?? 3
    this.retryDelay = config.retryDelay ?? 1000
  }

  /**
   * Detect if running on mobile device
   */
  private detectMobile(): boolean {
    // Check if we're in a browser environment
    const global = globalThis as any
    if (typeof global.navigator === 'undefined') return false
    
    const userAgent = global.navigator.userAgent || global.navigator.vendor || global.window?.opera || ''
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any
    
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation()
      } catch (error: any) {
        lastError = error
        
        // Don't retry on client errors (4xx) or if it's the last attempt
        if (error instanceof FlypostError) {
          if (error.category === 'CLIENT_ERROR' || attempt === this.retryAttempts) {
            throw error
          }
        } else if (attempt === this.retryAttempts) {
          throw error
        }
        
        // Calculate exponential backoff delay
        const delay = this.retryDelay * Math.pow(2, attempt)
        console.log(`[FlypostClient] ${operationName} failed (attempt ${attempt + 1}/${this.retryAttempts + 1}), retrying in ${delay}ms...`)
        
        await this.sleep(delay)
      }
    }
    
    throw lastError
  }

  /**
   * Parse a natural-language event description and publish it
   * 
   * @param args - Natural language input and optional user context
   * @returns Event ID and structured event object
   * @throws FlypostError on API errors
   */
  async flypostParseAndPublish(args: ParseAndPublishArgs): Promise<ParseAndPublishResponse> {
    return this.withRetry(
      () => this.performParseAndPublish(args),
      'flypostParseAndPublish'
    )
  }

  private async performParseAndPublish(args: ParseAndPublishArgs): Promise<ParseAndPublishResponse> {
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
          category: 'SERVER_ERROR',
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
        throw new FlypostError(`Request timeout after ${this.timeout}ms`, {
          code: 'TIMEOUT',
          url,
          category: 'TIMEOUT',
        })
      }

      // Handle network errors (check message content to catch mocked errors)
      if (error instanceof TypeError || error.name === 'TypeError' || 
          error.message?.includes('fetch') || error.message?.includes('Network')) {
        throw new FlypostError(error.message || 'Network request failed', {
          code: 'NETWORK_ERROR',
          url,
          details: error,
          category: 'NETWORK_ERROR',
        })
      }

      // Generic error
      throw new FlypostError(error.message || 'Unknown error occurred', {
        url,
        details: error,
        category: 'UNKNOWN',
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
    return this.withRetry(
      () => this.performEventsNear(args),
      'flypostEventsNear'
    )
  }

  private async performEventsNear(args: EventsNearArgs = {}): Promise<EventsNearResponse> {
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
          category: 'SERVER_ERROR',
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
        throw new FlypostError(`Request timeout after ${this.timeout}ms`, {
          code: 'TIMEOUT',
          url,
          category: 'TIMEOUT',
        })
      }

      // Handle network errors (check message content to catch mocked errors)
      if (error instanceof TypeError || error.name === 'TypeError' || 
          error.message?.includes('fetch') || error.message?.includes('Network')) {
        throw new FlypostError(error.message || 'Network request failed', {
          code: 'NETWORK_ERROR',
          url,
          details: error,
          category: 'NETWORK_ERROR',
        })
      }

      // Generic error
      throw new FlypostError(error.message || 'Unknown error occurred', {
        url,
        details: error,
        category: 'UNKNOWN',
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
