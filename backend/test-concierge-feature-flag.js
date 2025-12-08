/**
 * Test: Web Concierge Feature Flag
 * 
 * Verifies that:
 * 1. Server starts successfully with ENABLE_CONCIERGE=false
 * 2. /api/chat endpoint is not available when disabled
 * 3. Existing v4 endpoints continue to work
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Helper to wait for server to be ready
function waitForServer(port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const checkServer = async () => {
      // Check timeout before making the request
      if (Date.now() - startTime > timeout) {
        reject(new Error('Server did not start in time'))
        return
      }
      
      try {
        const response = await fetch(`http://localhost:${port}/health`)
        if (response.ok) {
          resolve()
        } else {
          setTimeout(checkServer, 100)
        }
      } catch (error) {
        setTimeout(checkServer, 100)
      }
    }
    checkServer()
  })
}

async function testConciergeDisabled() {
  console.log('🧪 Test 1: Concierge Disabled')
  console.log('==============================')
  
  // Start server with ENABLE_CONCIERGE=false
  const serverProcess = spawn('node', ['src/server.js'], {
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: '3002',
      ENABLE_CONCIERGE: 'false',
      NODE_ENV: 'test'
    }
  })

  let serverOutput = ''
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString()
  })
  serverProcess.stderr.on('data', (data) => {
    serverOutput += data.toString()
  })

  try {
    // Wait for server to start
    await waitForServer(3002)
    console.log('✅ Server started successfully')

    // Check that concierge is disabled in output
    if (serverOutput.includes('Web Concierge feature disabled')) {
      console.log('✅ Concierge feature is disabled')
    } else {
      throw new Error('Expected to see "Web Concierge feature disabled" message')
    }

    // Test that /api/chat is not available
    const chatResponse = await fetch('http://localhost:3002/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test', lat: 34, lng: -118 })
    })

    if (chatResponse.status === 404) {
      console.log('✅ /api/chat endpoint is not mounted (404)')
    } else {
      throw new Error(`Expected 404 for /api/chat, got ${chatResponse.status}`)
    }

    // Test that /v1/events/near still works
    const eventsResponse = await fetch('http://localhost:3002/v1/events/near?lat=34&lng=-118')
    const eventsData = await eventsResponse.json()

    if (eventsResponse.ok && eventsData.success) {
      console.log('✅ /v1/events/near endpoint still works')
    } else {
      throw new Error('Expected /v1/events/near to work')
    }

    console.log('✅ Test 1 PASSED: Concierge disabled correctly\n')
  } finally {
    serverProcess.kill()
  }
}

async function testConciergeEnabled() {
  console.log('🧪 Test 2: Concierge Enabled')
  console.log('============================')
  
  // Start server with ENABLE_CONCIERGE=true
  const serverProcess = spawn('node', ['src/server.js'], {
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: '3003',
      ENABLE_CONCIERGE: 'true',
      OPENAI_API_KEY: 'test-key',
      NODE_ENV: 'test'
    }
  })

  let serverOutput = ''
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString()
  })
  serverProcess.stderr.on('data', (data) => {
    serverOutput += data.toString()
  })

  try {
    // Wait for server to start
    await waitForServer(3003)
    console.log('✅ Server started successfully')

    // Check that concierge is enabled in output
    if (serverOutput.includes('Web Concierge feature enabled')) {
      console.log('✅ Concierge feature is enabled')
    } else {
      throw new Error('Expected to see "Web Concierge feature enabled" message')
    }

    if (serverOutput.includes('Web Concierge routes mounted')) {
      console.log('✅ Concierge routes mounted')
    } else {
      throw new Error('Expected to see "Web Concierge routes mounted" message')
    }

    // Test that /api/chat/health is available
    const healthResponse = await fetch('http://localhost:3003/api/chat/health')
    const healthData = await healthResponse.json()

    if (healthResponse.ok && healthData.service === 'web-concierge') {
      console.log('✅ /api/chat/health endpoint is available')
    } else {
      throw new Error('Expected /api/chat/health to work')
    }

    // Test that /api/chat validates input
    const chatResponse = await fetch('http://localhost:3003/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '', lat: 34, lng: -118 })
    })
    const chatData = await chatResponse.json()

    if (chatResponse.status === 400 && chatData.error.includes('invalid')) {
      console.log('✅ /api/chat validates input correctly')
    } else {
      throw new Error('Expected /api/chat to validate empty message')
    }

    // Test that /v1/events/near still works
    const eventsResponse = await fetch('http://localhost:3003/v1/events/near?lat=34&lng=-118')
    const eventsData = await eventsResponse.json()

    if (eventsResponse.ok && eventsData.success) {
      console.log('✅ /v1/events/near endpoint still works')
    } else {
      throw new Error('Expected /v1/events/near to work')
    }

    console.log('✅ Test 2 PASSED: Concierge enabled correctly\n')
  } finally {
    serverProcess.kill()
  }
}

async function runTests() {
  console.log('🚀 Web Concierge Feature Flag Tests')
  console.log('====================================\n')

  try {
    await testConciergeDisabled()
    await testConciergeEnabled()
    
    console.log('✨ All tests passed!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    process.exit(1)
  }
}

runTests()
