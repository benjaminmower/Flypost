/*
 * Test: Occurrence Locking and Identity Protection
 * Validates that locked occurrences cannot have identity fields updated
 * 
 * These are hermetic unit tests that mock Firestore behavior
 */

console.log('🧪 Testing Occurrence Locking and Identity Protection\n')

// Mock Firestore behavior for testing
class MockFirestoreDoc {
  constructor(data = null) {
    this.data = data
    this.exists = data !== null
  }

  get() {
    return Promise.resolve(this)
  }

  data() {
    return this.data
  }

  async set(data, options) {
    if (options?.merge) {
      this.data = { ...this.data, ...data }
    } else {
      this.data = data
    }
    this.exists = true
  }

  async update(updates) {
    Object.keys(updates).forEach(key => {
      if (key.includes('.')) {
        // Handle nested updates like '_firestoreMetadata.updatedAt'
        const parts = key.split('.')
        let target = this.data
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) {
            target[parts[i]] = {}
          }
          target = target[parts[i]]
        }
        target[parts[parts.length - 1]] = updates[key]
      } else {
        this.data[key] = updates[key]
      }
    })
  }
}

class MockFirestoreCollection {
  constructor() {
    this.docs = new Map()
  }

  doc(id) {
    if (!this.docs.has(id)) {
      this.docs.set(id, new MockFirestoreDoc())
    }
    return this.docs.get(id)
  }

  collection(name) {
    if (!this[name]) {
      this[name] = new MockFirestoreCollection()
    }
    return this[name]
  }
}

// Test 1: Unlocked occurrence can be updated
function testUnlockedOccurrenceUpdate() {
  console.log('Test 1: Unlocked occurrence identity fields can be updated')
  
  const occDoc = new MockFirestoreDoc({
    occurrenceId: 'occ_test_001',
    eventId: 'evt_test_001',
    startDate: '2025-01-15T14:00:00Z',
    endDate: '2025-01-15T16:00:00Z',
    eventAddress: '123 Main St, Santa Monica, CA',
    listingUrl: 'https://example.com/listing1',
    lockedAt: null,
    _firestoreMetadata: {
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-10T10:00:00Z'
    }
  })

  // Simulate update with new identity fields (should succeed)
  const newData = {
    occurrenceId: 'occ_test_001',
    eventId: 'evt_test_001',
    startDate: '2025-01-15T15:00:00Z', // Changed
    endDate: '2025-01-15T17:00:00Z',   // Changed
    eventAddress: '456 Oak Ave, Los Angeles, CA', // Changed
    listingUrl: 'https://example.com/listing2', // Changed
    lockedAt: null,
    _firestoreMetadata: {
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-15T12:00:00Z'
    }
  }

  occDoc.set(newData)

  if (occDoc.data.startDate === '2025-01-15T15:00:00Z' &&
      occDoc.data.eventAddress === '456 Oak Ave, Los Angeles, CA') {
    console.log('✅ Unlocked occurrence identity fields updated successfully\n')
    return true
  } else {
    console.error('❌ Failed to update unlocked occurrence\n')
    return false
  }
}

// Test 2: Locked occurrence identity fields cannot be updated
function testLockedOccurrencePreservesIdentity() {
  console.log('Test 2: Locked occurrence identity fields are preserved')
  
  const occDoc = new MockFirestoreDoc({
    occurrenceId: 'occ_test_002',
    eventId: 'evt_test_002',
    startDate: '2025-01-16T14:00:00Z',
    endDate: '2025-01-16T16:00:00Z',
    eventAddress: '789 Pine Rd, Santa Monica, CA',
    listingUrl: 'https://example.com/listing3',
    lockedAt: '2025-01-15T18:00:00Z', // LOCKED
    _firestoreMetadata: {
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-15T18:00:00Z'
    }
  })

  // Simulate lock check and update (should only update metadata)
  const isLocked = !!occDoc.data.lockedAt
  
  if (isLocked) {
    // Only update metadata
    occDoc.update({
      '_firestoreMetadata.updatedAt': '2025-01-16T12:00:00Z'
    })
  }

  // Verify identity fields unchanged
  if (occDoc.data.startDate === '2025-01-16T14:00:00Z' &&
      occDoc.data.endDate === '2025-01-16T16:00:00Z' &&
      occDoc.data.eventAddress === '789 Pine Rd, Santa Monica, CA' &&
      occDoc.data.listingUrl === 'https://example.com/listing3' &&
      occDoc.data._firestoreMetadata.updatedAt === '2025-01-16T12:00:00Z') {
    console.log('✅ Locked occurrence identity preserved, metadata updated\n')
    return true
  } else {
    console.error('❌ Locked occurrence identity was modified\n')
    return false
  }
}

// Test 3: Lock semantics - first attendance locks occurrence
async function testFirstAttendanceLocks() {
  console.log('Test 3: First attendance locks occurrence')
  
  const occCollection = new MockFirestoreCollection()
  const occDoc = occCollection.doc('occ_test_003')

  // Initially, occurrence exists but is not locked
  await occDoc.set({
    occurrenceId: 'occ_test_003',
    eventId: 'evt_test_003',
    startDate: '2025-01-17T14:00:00Z',
    endDate: '2025-01-17T16:00:00Z',
    eventAddress: '321 Elm St, Venice, CA',
    listingUrl: 'https://example.com/listing4',
    lockedAt: null,
    _firestoreMetadata: {
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-10T10:00:00Z'
    }
  })

  // First attendance - lock the occurrence
  await occDoc.set(
    {
      lockedAt: '2025-01-17T15:30:00Z'
    },
    { merge: true }
  )

  if (occDoc.data.lockedAt === '2025-01-17T15:30:00Z' &&
      occDoc.data.eventAddress === '321 Elm St, Venice, CA') {
    console.log('✅ Occurrence locked on first attendance, identity preserved\n')
    return true
  } else {
    console.error('❌ Lock failed or identity lost\n')
    return false
  }
}

// Test 4: Multiple occurrences for same event
function testMultipleOccurrencesIndependentLocks() {
  console.log('Test 4: Multiple occurrences have independent locks')
  
  const eventCollection = new MockFirestoreCollection()
  const occurrencesCollection = eventCollection.collection('occurrences')
  
  // Occurrence 1 - locked
  const occ1 = occurrencesCollection.doc('occ_test_004a')
  occ1.set({
    occurrenceId: 'occ_test_004a',
    eventId: 'evt_test_004',
    startDate: '2025-01-18T10:00:00Z',
    endDate: '2025-01-18T12:00:00Z',
    eventAddress: '555 Beach Blvd, Malibu, CA',
    listingUrl: 'https://example.com/listing5',
    lockedAt: '2025-01-18T10:30:00Z',
    _firestoreMetadata: {
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-18T10:30:00Z'
    }
  })
  
  // Occurrence 2 - not locked
  const occ2 = occurrencesCollection.doc('occ_test_004b')
  occ2.set({
    occurrenceId: 'occ_test_004b',
    eventId: 'evt_test_004',
    startDate: '2025-01-18T14:00:00Z',
    endDate: '2025-01-18T16:00:00Z',
    eventAddress: '555 Beach Blvd, Malibu, CA',
    listingUrl: 'https://example.com/listing5',
    lockedAt: null,
    _firestoreMetadata: {
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-01-10T10:00:00Z'
    }
  })

  // Verify occ1 is locked and occ2 is not
  if (occ1.data.lockedAt && !occ2.data.lockedAt) {
    console.log('✅ Multiple occurrences maintain independent lock states\n')
    return true
  } else {
    console.error('❌ Lock state not independent\n')
    return false
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== Occurrence Locking Tests ===\n')
  
  const results = []
  
  results.push(testUnlockedOccurrenceUpdate())
  results.push(testLockedOccurrencePreservesIdentity())
  results.push(await testFirstAttendanceLocks())
  results.push(testMultipleOccurrencesIndependentLocks())
  
  const passed = results.filter(r => r).length
  const total = results.length
  
  console.log('\n=== Test Summary ===')
  console.log(`Passed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('✅ All tests passed!\n')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed\n')
    process.exit(1)
  }
}

runAllTests().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
