#!/usr/bin/env node
/**
 * Integration test for Discovery V1 endpoint with drift protection
 * Tests that forbidden Layer 2 fields are stripped from responses
 */

import { storeEvent } from './src/storage.js'

console.log('🧪 Testing Discovery V1 Integration - Drift Protection\n')
console.log('======================================================\n')

/**
 * Test that creates an event with forbidden fields and verifies they are stripped
 */
async function testDriftProtection() {
  console.log('Test: Forbidden Fields Stripped in Discovery Response')
  console.log('------------------------------------------------------')
  
  try {
    // Create a mock event with forbidden Layer 2 fields
    const mockEventWithDrift = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      flypost: {
        eventId: `evt_drift_test_${Date.now()}`,
        category: 'open-houses',
        submissionTimestamp: new Date().toISOString(),
        // Layer 2 fields that should be stripped
        attendance: 45,
        insights: { quality: 'high' }
      },
      name: 'Test Event with Drift',
      description: 'Testing drift protection',
      startDate: '2025-01-20T10:00:00Z',
      endDate: '2025-01-20T14:00:00Z',
      location: {
        address: {
          streetAddress: '456 Test Ave',
          addressLocality: 'Los Angeles',
          addressRegion: 'CA',
          postalCode: '90001'
        },
        geo: {
          latitude: 34.0522,
          longitude: -118.2437
        }
      },
      brokerageId: 'test-drift-brokerage',
      // More Layer 2 fields at top level
      feedback: 'Great event!',
      sentiment: 'positive',
      buyerToken: 'secret-token-123'
    }
    
    console.log('   📝 Storing event with forbidden Layer 2 fields...')
    await storeEvent(mockEventWithDrift)
    console.log('   ✅ Event stored successfully')
    
    // Now fetch via Discovery V1 endpoint
    console.log('   🔍 Fetching via Discovery V1 endpoint...')
    const response = await fetch('http://localhost:3001/v1/events/near?lat=34.0522&lng=-118.2437&radius=10')
    const data = await response.json()
    
    console.log('   📊 Response received with schemaVersion:', data.schemaVersion)
    
    // Verify Discovery V1 contract
    let passed = 0
    let failed = 0
    
    if (data.schemaVersion === 'discovery.v1') {
      console.log('   ✅ schemaVersion is "discovery.v1"')
      passed++
    } else {
      console.log('   ❌ schemaVersion is incorrect:', data.schemaVersion)
      failed++
    }
    
    if (data.events && data.events.length > 0) {
      console.log(`   ✅ Found ${data.events.length} event(s)`)
      passed++
      
      const event = data.events.find(e => e.name === 'Test Event with Drift')
      
      if (event) {
        console.log('   ✅ Found drift test event')
        passed++
        
        // Verify forbidden fields are NOT present
        const forbiddenFields = ['attendance', 'feedback', 'sentiment', 'buyerToken', 'insights']
        
        for (const field of forbiddenFields) {
          if (!(field in event)) {
            console.log(`   ✅ Forbidden field "${field}" correctly stripped`)
            passed++
          } else {
            console.log(`   ❌ Forbidden field "${field}" still present!`)
            failed++
          }
        }
        
        // Verify allowed fields ARE present
        if (event.eventId) {
          console.log(`   ✅ eventId present: ${event.eventId}`)
          passed++
        } else {
          console.log('   ❌ eventId missing')
          failed++
        }
        
        if (event.eventIdentity) {
          console.log(`   ✅ eventIdentity present: ${event.eventIdentity}`)
          passed++
        } else {
          console.log('   ❌ eventIdentity missing')
          failed++
        }
        
        if (event.name === 'Test Event with Drift') {
          console.log(`   ✅ name preserved: ${event.name}`)
          passed++
        } else {
          console.log('   ❌ name not preserved correctly')
          failed++
        }
        
      } else {
        console.log('   ❌ Could not find drift test event in response')
        failed++
      }
      
    } else {
      console.log('   ❌ No events found in response')
      failed++
    }
    
    console.log(`\n   Summary: ${passed} passed, ${failed} failed`)
    console.log('')
    
    return failed === 0
    
  } catch (error) {
    console.error('   ❌ Test failed with error:', error.message)
    console.error(error.stack)
    return false
  }
}

/**
 * Test long description truncation
 */
async function testDescriptionTruncation() {
  console.log('Test: Description Truncation in Real Response')
  console.log('----------------------------------------------')
  
  try {
    // Create a very long description (800 chars)
    const longDesc = 'This is a very long description. '.repeat(30) // ~1000 chars
    
    const mockEvent = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      flypost: {
        eventId: `evt_truncate_test_${Date.now()}`,
        category: 'open-houses',
        submissionTimestamp: new Date().toISOString()
      },
      name: 'Test Event with Long Description',
      description: longDesc,
      startDate: '2025-01-21T10:00:00Z',
      endDate: '2025-01-21T14:00:00Z',
      location: {
        address: {
          streetAddress: '789 Truncate Blvd',
          addressLocality: 'Los Angeles',
          addressRegion: 'CA',
          postalCode: '90002'
        },
        geo: {
          latitude: 34.0522,
          longitude: -118.2437
        }
      },
      brokerageId: 'test-truncate-brokerage'
    }
    
    console.log(`   📝 Storing event with ${longDesc.length} character description...`)
    await storeEvent(mockEvent)
    console.log('   ✅ Event stored successfully')
    
    // Fetch via Discovery V1 endpoint
    const response = await fetch('http://localhost:3001/v1/events/near?lat=34.0522&lng=-118.2437&radius=10')
    const data = await response.json()
    
    const event = data.events.find(e => e.name === 'Test Event with Long Description')
    
    let passed = 0
    let failed = 0
    
    if (event && event.description) {
      console.log(`   📊 Retrieved description length: ${event.description.length}`)
      
      if (event.description.length <= 503) { // 500 + "..."
        console.log(`   ✅ Description truncated to safe length (${event.description.length} chars)`)
        passed++
      } else {
        console.log(`   ❌ Description not truncated: ${event.description.length} chars`)
        failed++
      }
      
      if (event.description.endsWith('...')) {
        console.log('   ✅ Truncated description ends with "..."')
        passed++
      } else {
        console.log('   ❌ Description does not end with "..."')
        failed++
      }
      
    } else {
      console.log('   ❌ Could not find event or description in response')
      failed++
    }
    
    console.log(`\n   Summary: ${passed} passed, ${failed} failed`)
    console.log('')
    
    return failed === 0
    
  } catch (error) {
    console.error('   ❌ Test failed with error:', error.message)
    return false
  }
}

/**
 * Run all integration tests
 */
async function runAllTests() {
  console.log('Starting Discovery V1 integration tests...\n')
  
  const results = []
  
  results.push(await testDriftProtection())
  results.push(await testDescriptionTruncation())
  
  // Summary
  console.log('======================================================')
  console.log('Integration Test Summary')
  console.log('======================================================')
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log(`\nPassed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('\n✅ All Discovery V1 integration tests passed!')
    console.log('Drift protection is working correctly in the live endpoint.')
    process.exit(0)
  } else {
    console.log(`\n❌ ${total - passed} integration test(s) failed`)
    process.exit(1)
  }
}

// Run tests
runAllTests()
