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
  maxRetries?: number
  retryDelay?: number
  writeToken?: string
  brokerageId?: string
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
  brokerageId?: string
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
  private maxRetries: number
  private retryDelay: number
  private writeToken?: string
  private brokerageId?: string

  constructor(config: FlypostClientConfig = {}) {
    this.apiBase = config.apiBase || process.env.FLYPOST_API_BASE || 'http://localhost:3001'
    this.timeout = config.timeout || 60000 // 60 seconds default (increased for high-latency environments)
    this.maxRetries = config.maxRetries ?? 3 // Default 3 retries
    this.retryDelay = config.retryDelay || 1000 // Default 1 second initial delay
    this.writeToken = config.writeToken
    this.brokerageId = config.brokerageId
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Retry on network errors but not on timeout
    if (error instanceof FlypostError) {
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
        return false
      }
      // Don't retry on timeout errors - they should use a longer timeout instead
      if (error.code === 'TIMEOUT') {
        return false
      }
    }
    // Retry on network errors and server errors (5xx)
    return true
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
    
    let lastError: any
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        
        // Add authentication token if provided
        if (this.writeToken) {
          headers['X-Flypost-Write-Token'] = this.writeToken
        }
        
        // Add brokerageId header if provided
        if (this.brokerageId) {
          headers['X-Flypost-Brokerage-Id'] = this.brokerageId
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(args),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const data = await response.json() as ParseAndPublishApiResponse

        if (!response.ok) {
          const errorMessage = data.error || `HTTP ${response.status}: ${response.statusText}`
          
          throw new FlypostError(
            errorMessage,
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
        lastError = error
        
        // If this is already a FlypostError, check if we should retry
        if (error instanceof FlypostError) {
          // Don't retry if this is not a retryable error
          if (!this.isRetryableError(error)) {
            throw error
          }
        } else if (error.name === 'AbortError') {
          // Handle timeout - don't retry timeouts, throw immediately
          throw new FlypostError('Request timeout - consider increasing timeout value', {
            code: 'TIMEOUT',
            url,
            details: {
              timeout: this.timeout,
              suggestion: 'Try increasing the timeout value in the client configuration'
            }
          })
        }
        
        // If this is the last attempt, throw the error
        if (attempt >= this.maxRetries) {
          break
        }
        
        // Calculate exponential backoff delay
        const delayMs = this.retryDelay * Math.pow(2, attempt)
        console.log(`[FlypostClient] Retry attempt ${attempt + 1}/${this.maxRetries} after ${delayMs}ms delay`)
        await this.sleep(delayMs)
      }
    }
    
    // If we get here, all retries failed
    if (lastError instanceof FlypostError) {
      // Enhance error message to indicate retries were attempted
      throw new FlypostError(
        `Failed after ${this.maxRetries + 1} attempts: ${lastError.message}`,
        {
          status: lastError.status,
          url,
          code: lastError.code || 'RETRY_EXHAUSTED',
          details: {
            originalError: lastError.details,
            attempts: this.maxRetries + 1,
            suggestion: 'Check network connectivity and server availability'
          }
        }
      )
    }
    
    // Handle non-FlypostError cases (network errors)
    throw new FlypostError(
      `Network request failed after ${this.maxRetries + 1} attempts: ${lastError.message || 'Unknown error'}`,
      {
        url,
        code: 'NETWORK_ERROR',
        details: {
          originalError: lastError,
          attempts: this.maxRetries + 1,
          suggestion: 'Check network connectivity, consider disabling private browsing mode, or try a different network'
        }
      }
    )
  }

  /**
   * Get events near a location
   * 
   * @param args - Latitude, longitude, and radius (all optional)
   * @returns List of events and total count
   * @throws FlypostError on API errors
   */
  async flypostEventsNear(args: EventsNearArgs = {}): Promise<EventsNearResponse> {
    const { lat, lng, radius = 10, brokerageId } = args
    
    const params = new URLSearchParams()
    if (lat !== undefined) params.append('lat', lat.toString())
    if (lng !== undefined) params.append('lng', lng.toString())
    params.append('radius', radius.toString())
    
    // Add brokerageId if provided (either in args or from client config)
    const effectiveBrokerageId = brokerageId || this.brokerageId
    if (effectiveBrokerageId) {
      params.append('brokerageId', effectiveBrokerageId)
    }

    const url = `${this.apiBase}/v1/events/near?${params.toString()}`
    
    let lastError: any
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        const headers: Record<string, string> = {
          'Accept': 'application/json',
        }
        
        // Add authentication token if provided
        if (this.writeToken) {
          headers['X-Flypost-Write-Token'] = this.writeToken
        }
        
        // Add brokerageId header if provided
        if (effectiveBrokerageId) {
          headers['X-Flypost-Brokerage-Id'] = effectiveBrokerageId
        }

        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const data = await response.json() as EventsNearApiResponse

        if (!response.ok) {
          const errorMessage = data.error || `HTTP ${response.status}: ${response.statusText}`
          
          throw new FlypostError(
            errorMessage,
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

        // Return successful result
        return {
          events: data.data.events || [],
          total: data.data.total || 0,
        }
      } catch (error: any) {
        lastError = error
        
        // If this is already a FlypostError, check if we should retry
        if (error instanceof FlypostError) {
          // Don't retry if this is not a retryable error
          if (!this.isRetryableError(error)) {
            throw error
          }
        } else if (error.name === 'AbortError') {
          // Handle timeout - don't retry timeouts, throw immediately
          throw new FlypostError('Request timeout - consider increasing timeout value', {
            code: 'TIMEOUT',
            url,
            details: {
              timeout: this.timeout,
              suggestion: 'Try increasing the timeout value in the client configuration'
            }
          })
        }
        
        // If this is the last attempt, throw the error
        if (attempt >= this.maxRetries) {
          break
        }
        
        // Calculate exponential backoff delay
        const delayMs = this.retryDelay * Math.pow(2, attempt)
        console.log(`[FlypostClient] Retry attempt ${attempt + 1}/${this.maxRetries} after ${delayMs}ms delay`)
        await this.sleep(delayMs)
      }
    }
    
    // If we get here, all retries failed
    if (lastError instanceof FlypostError) {
      // Enhance error message to indicate retries were attempted
      throw new FlypostError(
        `Failed after ${this.maxRetries + 1} attempts: ${lastError.message}`,
        {
          status: lastError.status,
          url,
          code: lastError.code || 'RETRY_EXHAUSTED',
          details: {
            originalError: lastError.details,
            attempts: this.maxRetries + 1,
            suggestion: 'Check network connectivity and server availability'
          }
        }
      )
    }
    
    // Handle non-FlypostError cases (network errors)
    throw new FlypostError(
      `Network request failed after ${this.maxRetries + 1} attempts: ${lastError.message || 'Unknown error'}`,
      {
        url,
        code: 'NETWORK_ERROR',
        details: {
          originalError: lastError,
          attempts: this.maxRetries + 1,
          suggestion: 'Check network connectivity, consider disabling private browsing mode, or try a different network'
        }
      }
    )
  }
}

/**
 * Create a default Flypost client instance
 */
export function createFlypostClient(config?: FlypostClientConfig): FlypostClient {
  return new FlypostClient(config)
}
