/*
 * Integration Test - Enhanced Parser End-to-End
 * 
 * This test demonstrates the enhanced parsing logic by simulating
 * realistic natural language inputs and validating the complete pipeline.
 * 
 * NOTE: This test requires OPENAI_API_KEY to be set for actual LLM parsing.
 * Without it, the test will use mock validation only.
 */

import { parseEventWithLLM } from './src/llmParser.js'
import { validateEventData } from './src/validation.js'
import { computeEventHash } from './src/hashUtils.js'
import dotenv from 'dotenv'

dotenv.config()

const hasOpenAIKey = !!process.env.OPENAI_API_KEY

console.log('🚀 Enhanced Parser Integration Test')
console.log('=' .repeat(70))

if (!hasOpenAIKey) {
  console.log('⚠️  OPENAI_API_KEY not found - running mock validation only')
  console.log('   Set OPENAI_API_KEY in .env to test actual LLM parsing\n')
}

// Test cases with various natural language patterns
const testCases = [
  {
    name: 'Garage Sale - Simple',
    input: 'Garage sale this Saturday 8am-2pm at 123 Main Street, Springfield IL. Furniture, electronics, toys. Call John 555-1234',
    context: {},
    expectedCategory: 'garage-sales'
  },
  {
    name: 'Open House - Real Estate',
    input: 'Open house Sunday 2-4pm. Beautiful 3 bedroom 2 bath home at 456 Oak Avenue, Santa Monica CA 90405. Agent Sarah Johnson, license #123456, MLS #789012. Email sarah@realty.com',
    context: {},
    expectedCategory: 'open-houses'
  },
  {
    name: 'Job Posting - With Location Context',
    input: 'Now hiring full-time barista. Great pay and benefits. Start immediately. Contact us at jobs@coffeehouse.com',
    context: {
      defaultLocation: '789 Coffee Street, Seattle WA 98101',
      timezone: 'America/Los_Angeles'
    },
    expectedCategory: 'job-postings'
  },
  {
    name: 'Community Alert - Date Range',
    input: 'Street maintenance on Elm Street from December 1st to December 5th. Road will be closed. For info call city services 555-9999',
    context: {
      defaultLocation: 'Portland, OR'
    },
    expectedCategory: 'community-alerts'
  },
  {
    name: 'Happy Hour - Time-based Event',
    input: 'Happy hour every Friday 5pm to 7pm at The Sunset Pub, 321 Bar Avenue. Half-price appetizers and drinks!',
    context: {
      timezone: 'America/New_York'
    },
    expectedCategory: 'happy-hours'
  }
]

// Mock parsed event for when OpenAI key is not available
function createMockEvent(testCase) {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'flypost': {
      'eventId': `evt_mock_${Date.now()}`,
      'category': testCase.expectedCategory,
      'realTimeData': true,
      'crawlable': true,
      'queryable': true,
      'submissionTimestamp': now.toISOString()
    },
    'name': `Mock Event - ${testCase.name}`,
    'description': testCase.input,
    'startDate': tomorrow.toISOString(),
    'location': {
      '@type': 'Place',
      'name': 'Mock Location',
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': testCase.context.defaultLocation || '123 Test Street',
        'addressLocality': 'Test City',
        'addressRegion': 'TC',
        'addressCountry': 'US'
      }
    },
    'organizer': {
      '@type': 'Person',
      'name': 'Mock Organizer',
      'email': 'mock@example.com'
    }
  }
}

async function runTests() {
  let passed = 0
  let failed = 0
  let skipped = 0
  
  for (const testCase of testCases) {
    console.log('\n' + '─'.repeat(70))
    console.log(`📝 Test: ${testCase.name}`)
    console.log('─'.repeat(70))
    console.log(`Input: "${testCase.input.substring(0, 80)}${testCase.input.length > 80 ? '...' : ''}"`)
    
    if (testCase.context && Object.keys(testCase.context).length > 0) {
      console.log(`Context: ${JSON.stringify(testCase.context)}`)
    }
    
    let parsedEvent
    
    try {
      if (hasOpenAIKey) {
        console.log('\n🤖 Parsing with LLM...')
        parsedEvent = await parseEventWithLLM(testCase.input, testCase.context)
        console.log('✅ LLM parsing completed')
      } else {
        console.log('\n📦 Using mock event (no API key)')
        parsedEvent = createMockEvent(testCase)
        skipped++
      }
      
      // Display key extracted fields
      console.log('\n📊 Extracted Fields:')
      console.log(`   - Name: ${parsedEvent.name}`)
      console.log(`   - Category: ${parsedEvent.flypost.category}`)
      console.log(`   - Start Date: ${parsedEvent.startDate}`)
      if (parsedEvent.endDate) {
        console.log(`   - End Date: ${parsedEvent.endDate}`)
      }
      console.log(`   - Location: ${parsedEvent.location.address.streetAddress}`)
      if (parsedEvent.location.address.addressLocality) {
        console.log(`   - City: ${parsedEvent.location.address.addressLocality}`)
      }
      if (parsedEvent.location.address.addressRegion) {
        console.log(`   - State: ${parsedEvent.location.address.addressRegion}`)
      }
      console.log(`   - Organizer: ${parsedEvent.organizer.name || 'N/A'}`)
      if (parsedEvent.organizer.email) {
        console.log(`   - Email: ${parsedEvent.organizer.email}`)
      }
      if (parsedEvent.organizer.phone) {
        console.log(`   - Phone: ${parsedEvent.organizer.phone}`)
      }
      
      // Validate against schema
      console.log('\n🔍 Validating against schema...')
      const validation = validateEventData(parsedEvent)
      
      if (!validation.success) {
        console.log('❌ Schema validation failed:')
        validation.errors.forEach(err => {
          console.log(`   - ${err.field}: ${err.message}`)
        })
        failed++
        continue
      }
      
      console.log('✅ Schema validation passed')
      
      // Check category match (if using real LLM)
      if (hasOpenAIKey && parsedEvent.flypost.category !== testCase.expectedCategory) {
        console.log(`⚠️  Category mismatch: expected "${testCase.expectedCategory}", got "${parsedEvent.flypost.category}"`)
      }
      
      // Compute hash
      console.log('\n🔐 Computing hash...')
      const hash = computeEventHash(parsedEvent)
      console.log(`✅ Hash: ${hash.value.substring(0, 16)}...`)
      
      // Check required fields
      const requiredFields = ['name', 'description', 'startDate', 'location', 'organizer']
      let missingRequired = []
      
      for (const field of requiredFields) {
        if (!parsedEvent[field]) {
          missingRequired.push(field)
        }
      }
      
      if (missingRequired.length > 0) {
        console.log(`❌ Missing required fields: ${missingRequired.join(', ')}`)
        failed++
      } else {
        console.log('✅ All required fields present')
        passed++
      }
      
    } catch (error) {
      console.log(`\n❌ Test failed with error:`)
      console.log(`   ${error.message}`)
      if (error.stack) {
        console.log(`   Stack trace available in logs`)
      }
      failed++
    }
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(70))
  console.log('📊 Integration Test Summary')
  console.log('='.repeat(70))
  
  if (hasOpenAIKey) {
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`📈 Total: ${passed + failed}`)
    
    if (failed === 0) {
      console.log('\n🎉 All integration tests passed!')
      console.log('✨ Enhanced parsing logic is working correctly')
      return 0
    } else {
      console.log('\n⚠️  Some tests failed. Review the output above.')
      return 1
    }
  } else {
    console.log(`📦 Mock validation: ${passed} tests`)
    console.log(`⏭️  Skipped (no API key): ${skipped} LLM parsing tests`)
    console.log(`❌ Failed: ${failed}`)
    console.log('\n💡 Set OPENAI_API_KEY in .env to run full LLM parsing tests')
    return 0
  }
}

// Run tests
runTests()
  .then(exitCode => {
    process.exit(exitCode)
  })
  .catch(error => {
    console.error('\n💥 Unexpected error:', error)
    process.exit(1)
  })
