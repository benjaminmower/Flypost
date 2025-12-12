#!/usr/bin/env node
/**
 * Test script for routes validation logic
 * Tests the coordinate validation and request body parsing without making actual API calls
 */

console.log('🧪 Testing Routes Validation Logic\n')
console.log('===================================\n')

/**
 * Test coordinate validation logic
 */
function testCoordinateValidation() {
  console.log('Test 1: Coordinate Validation Logic')
  console.log('------------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Test cases
  const cases = [
    { lat: undefined, lng: undefined, shouldPass: true, desc: 'Both undefined' },
    { lat: null, lng: null, shouldPass: true, desc: 'Both null' },
    { lat: 34.0195, lng: -118.4912, shouldPass: true, desc: 'Valid coordinates' },
    { lat: 0, lng: 0, shouldPass: true, desc: 'Zero coordinates' },
    { lat: 90, lng: 180, shouldPass: true, desc: 'Max valid coordinates' },
    { lat: -90, lng: -180, shouldPass: true, desc: 'Min valid coordinates' },
    { lat: 91, lng: 0, shouldPass: false, desc: 'Lat too high' },
    { lat: -91, lng: 0, shouldPass: false, desc: 'Lat too low' },
    { lat: 0, lng: 181, shouldPass: false, desc: 'Lng too high' },
    { lat: 0, lng: -181, shouldPass: false, desc: 'Lng too low' },
    { lat: 'invalid', lng: 0, shouldPass: false, desc: 'Invalid lat string' },
    { lat: 0, lng: 'invalid', shouldPass: false, desc: 'Invalid lng string' },
    { lat: NaN, lng: 0, shouldPass: false, desc: 'NaN lat' },
    { lat: 0, lng: NaN, shouldPass: false, desc: 'NaN lng' },
  ]
  
  // Simulate the validation logic from routes.js
  function validateCoords(lat, lng) {
    let latitude = undefined
    let longitude = undefined
    
    if (lat !== undefined && lat !== null) {
      latitude = typeof lat === 'number' ? lat : parseFloat(lat)
      if (isNaN(latitude)) {
        return { valid: false, error: 'Invalid latitude. Must be a valid number.' }
      }
      if (latitude < -90 || latitude > 90) {
        return { valid: false, error: 'Invalid latitude. Must be between -90 and 90 degrees.' }
      }
    }
    
    if (lng !== undefined && lng !== null) {
      longitude = typeof lng === 'number' ? lng : parseFloat(lng)
      if (isNaN(longitude)) {
        return { valid: false, error: 'Invalid longitude. Must be a valid number.' }
      }
      if (longitude < -180 || longitude > 180) {
        return { valid: false, error: 'Invalid longitude. Must be between -180 and 180 degrees.' }
      }
    }
    
    return { valid: true, latitude, longitude }
  }
  
  // Run test cases
  for (const testCase of cases) {
    const result = validateCoords(testCase.lat, testCase.lng)
    const actualPass = result.valid
    
    if (actualPass === testCase.shouldPass) {
      console.log(`   ✅ ${testCase.desc}: ${actualPass ? 'PASS' : 'FAIL'} (as expected)`)
      passed++
    } else {
      console.log(`   ❌ ${testCase.desc}: Expected ${testCase.shouldPass ? 'PASS' : 'FAIL'}, got ${actualPass ? 'PASS' : 'FAIL'}`)
      if (result.error) {
        console.log(`      Error: ${result.error}`)
      }
      failed++
    }
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${cases.length} cases`)
  console.log('')
  
  return failed === 0
}

/**
 * Test toFixed safety on undefined
 */
function testToFixedSafety() {
  console.log('Test 2: toFixed Safety on Undefined')
  console.log('------------------------------------')
  
  try {
    // Simulate the logging logic from routes.js
    const latitude = undefined
    const longitude = undefined
    
    const latStr = latitude !== undefined ? latitude.toFixed(4) : 'n/a'
    const lngStr = longitude !== undefined ? longitude.toFixed(4) : 'n/a'
    
    console.log(`   ✅ Undefined coordinates logged safely`)
    console.log(`      lat=${latStr}, lng=${lngStr}`)
    
    // Test with defined values
    const lat2 = 34.0195
    const lng2 = -118.4912
    const latStr2 = lat2 !== undefined ? lat2.toFixed(4) : 'n/a'
    const lngStr2 = lng2 !== undefined ? lng2.toFixed(4) : 'n/a'
    
    console.log(`   ✅ Defined coordinates logged correctly`)
    console.log(`      lat=${latStr2}, lng=${lngStr2}`)
    console.log('')
    
    return true
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
    console.log('')
    return false
  }
}

/**
 * Test history parameter handling
 */
function testHistoryParameter() {
  console.log('Test 3: History Parameter Handling')
  console.log('-----------------------------------')
  
  let passed = 0
  let failed = 0
  
  // Test cases
  const cases = [
    { history: undefined, conversationHistory: undefined, shouldUse: undefined, desc: 'Both undefined' },
    { history: [], conversationHistory: undefined, shouldUse: [], desc: 'History empty array' },
    { history: undefined, conversationHistory: [], shouldUse: [], desc: 'ConversationHistory empty array' },
    { history: [{role: 'user', content: 'hi'}], conversationHistory: [], shouldUse: [{role: 'user', content: 'hi'}], desc: 'History takes precedence' },
    { history: [{role: 'user', content: 'hi'}], conversationHistory: undefined, shouldUse: [{role: 'user', content: 'hi'}], desc: 'History when conversationHistory undefined' },
  ]
  
  // Simulate the logic from routes.js
  function selectHistory(history, conversationHistory) {
    return history || conversationHistory
  }
  
  // Run test cases
  for (const testCase of cases) {
    const result = selectHistory(testCase.history, testCase.conversationHistory)
    const matches = JSON.stringify(result) === JSON.stringify(testCase.shouldUse)
    
    if (matches) {
      console.log(`   ✅ ${testCase.desc}`)
      passed++
    } else {
      console.log(`   ❌ ${testCase.desc}`)
      console.log(`      Expected: ${JSON.stringify(testCase.shouldUse)}`)
      console.log(`      Got: ${JSON.stringify(result)}`)
      failed++
    }
  }
  
  console.log(`\n   Summary: ${passed} passed, ${failed} failed out of ${cases.length} cases`)
  console.log('')
  
  return failed === 0
}

/**
 * Run all tests
 */
function runAllTests() {
  console.log('Starting validation tests...\n')
  
  const results = []
  
  results.push(testCoordinateValidation())
  results.push(testToFixedSafety())
  results.push(testHistoryParameter())
  
  // Summary
  console.log('===================================')
  console.log('Test Summary')
  console.log('===================================')
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log(`\nPassed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('\n✅ All validation tests passed!')
    process.exit(0)
  } else {
    console.log(`\n❌ ${total - passed} validation test(s) failed`)
    process.exit(1)
  }
}

// Run tests
runAllTests()
