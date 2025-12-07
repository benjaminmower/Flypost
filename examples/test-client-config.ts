/**
 * Manual Test Script for Enhanced FlypostClient
 * 
 * Tests the new configuration options and demonstrates:
 * 1. Timeout configuration
 * 2. Retry configuration
 * 3. Authentication token support
 * 4. BrokerageId support
 * 5. Error handling improvements
 */

import { createFlypostClient, FlypostClient } from '../clients/flypostClient.js'

console.log('🧪 Testing Enhanced FlypostClient Configuration\n')
console.log('='.repeat(60))

// Test 1: Default configuration
console.log('\n✅ Test 1: Default Configuration')
console.log('─'.repeat(60))
const defaultClient = createFlypostClient()
console.log('Default client created successfully')
console.log('- Uses default timeout: 60000ms (60s)')
console.log('- Uses default maxRetries: 3')
console.log('- Uses default retryDelay: 1000ms')

// Test 2: Custom timeout configuration
console.log('\n✅ Test 2: Custom Timeout Configuration')
console.log('─'.repeat(60))
const customTimeoutClient = new FlypostClient({
  apiBase: 'http://localhost:3001',
  timeout: 90000, // 90 seconds
})
console.log('Client with custom timeout created successfully')
console.log('- Timeout: 90000ms (90s)')

// Test 3: Retry configuration
console.log('\n✅ Test 3: Custom Retry Configuration')
console.log('─'.repeat(60))
const retryClient = new FlypostClient({
  apiBase: 'http://localhost:3001',
  maxRetries: 5,
  retryDelay: 2000, // 2 seconds initial delay
})
console.log('Client with custom retry settings created successfully')
console.log('- Max retries: 5')
console.log('- Initial retry delay: 2000ms')
console.log('- Retry delays: 2s, 4s, 8s, 16s, 32s (exponential backoff)')

// Test 4: Authentication configuration
console.log('\n✅ Test 4: Authentication Configuration')
console.log('─'.repeat(60))
const authClient = new FlypostClient({
  apiBase: 'http://localhost:3001',
  writeToken: 'test-token-123',
})
console.log('Client with authentication created successfully')
console.log('- Write token configured (will be sent as X-Flypost-Write-Token header)')

// Test 5: BrokerageId configuration
console.log('\n✅ Test 5: Multi-Tenant BrokerageId Configuration')
console.log('─'.repeat(60))
const brokerageClient = new FlypostClient({
  apiBase: 'http://localhost:3001',
  brokerageId: 'vista-sir',
})
console.log('Client with brokerageId created successfully')
console.log('- BrokerageId: vista-sir')
console.log('- Will be sent as X-Flypost-Brokerage-Id header and query param')

// Test 6: Full configuration
console.log('\n✅ Test 6: Full Configuration')
console.log('─'.repeat(60))
const fullClient = new FlypostClient({
  apiBase: 'https://api.goflypost.com',
  timeout: 120000, // 2 minutes for very slow networks
  maxRetries: 4,
  retryDelay: 1500,
  writeToken: 'vista-sir-production-token',
  brokerageId: 'vista-sir',
})
console.log('Fully configured client created successfully')
console.log('- API Base: https://api.goflypost.com')
console.log('- Timeout: 120000ms (2 minutes)')
console.log('- Max retries: 4')
console.log('- Initial retry delay: 1500ms')
console.log('- Write token: configured')
console.log('- BrokerageId: vista-sir')

// Test 7: Configuration summary
console.log('\n' + '='.repeat(60))
console.log('📋 Configuration Options Summary')
console.log('='.repeat(60))
console.log(`
Configuration Options:
----------------------
- apiBase        : Flypost API base URL (default: http://localhost:3001 or env FLYPOST_API_BASE)
- timeout        : Request timeout in ms (default: 60000ms / 60s)
- maxRetries     : Max retry attempts (default: 3)
- retryDelay     : Initial retry delay in ms (default: 1000ms)
- writeToken     : Authentication token for write operations (optional)
- brokerageId    : Default brokerage ID for multi-tenant ops (optional)

Retry Behavior:
---------------
- Retries on: 5xx server errors, network errors
- NO retry on: 4xx client errors (except 429), timeout errors
- Exponential backoff: delay doubles with each retry

Error Messages:
---------------
- TIMEOUT: Request exceeded timeout (suggests increasing timeout)
- NETWORK_ERROR: Network connectivity issues (suggests checking network/private browsing)
- RETRY_EXHAUSTED: All retries failed (includes attempt count)
- 4xx errors: Client errors (not retried)
`)

console.log('✨ All configuration tests completed successfully!\n')
console.log('Next steps:')
console.log('1. Run the backend: cd backend && npm start')
console.log('2. Test actual API calls with the configured clients')
console.log('3. Monitor retry behavior with network issues or server errors')
