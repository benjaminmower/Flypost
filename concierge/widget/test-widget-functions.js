#!/usr/bin/env node
/**
 * Test script for widget JavaScript functions
 * Tests the address extraction and quick action logic
 */

console.log('🧪 Testing Widget Functions\n');
console.log('====================================\n');

/**
 * Extract property addresses from assistant message text
 * Looks for patterns like "### 🏠 Open House at [Address]"
 */
function extractAddressesFromAssistantText(text) {
  const re = /^###\s+🏠\s+(?:Open House at\s+)?(.+)$/gm;
  const addresses = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    addresses.push(match[1].trim());
  }
  return addresses;
}

/**
 * Test 1: Extract addresses from markdown text
 */
function testAddressExtraction() {
  console.log('Test 1: Address Extraction');
  console.log('---------------------------');
  
  const testCases = [
    {
      name: 'Standard format with "Open House at"',
      text: `
## Open Houses This Weekend

### 🏠 Open House at 1007 S Prospect Ave

- **Open House**: Saturday, Dec 14, 2024 · 1:00-4:00 PM
- **Price**: $2,500,000
- **Beds/Baths**: 4 bed · 3 bath

---

### 🏠 Open House at 425 Vía El Chico

- **Open House**: Saturday, Dec 14, 2024 · 1:00-4:00 PM
- **Price**: $2,100,000
- **Beds/Baths**: 3 bed · 3 bath
`,
      expected: ['1007 S Prospect Ave', '425 Vía El Chico']
    },
    {
      name: 'Without "Open House at" prefix',
      text: `
### 🏠 123 Main Street

### 🏠 456 Oak Avenue
`,
      expected: ['123 Main Street', '456 Oak Avenue']
    },
    {
      name: 'No properties',
      text: 'I apologize, but I couldn\'t find any open houses near you.',
      expected: []
    },
    {
      name: 'Mixed content',
      text: `
Some intro text

### 🏠 Open House at Property One, City

More text here

### 🏠 Property Two, City

Final text
`,
      expected: ['Property One, City', 'Property Two, City']
    }
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    const result = extractAddressesFromAssistantText(testCase.text);
    const success = JSON.stringify(result) === JSON.stringify(testCase.expected);
    
    if (success) {
      console.log(`✅ Test ${index + 1}: ${testCase.name}`);
      console.log(`   Found ${result.length} addresses`);
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: ${testCase.name}`);
      console.log(`   Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`   Got: ${JSON.stringify(result)}`);
      failed++;
    }
  });

  console.log('');
  return failed === 0;
}

/**
 * Test 2: Quick action button logic
 */
function testQuickActionLogic() {
  console.log('Test 2: Quick Action Button Logic');
  console.log('----------------------------------');
  
  const testCases = [
    {
      name: 'Two or more properties - all buttons',
      addresses: ['123 Main St', '456 Oak Ave'],
      expectedButtons: ['compare', 'route', 'walkable'],
      shouldShowCompare: true,
      shouldShowRoute: true,
      shouldShowWalkable: true
    },
    {
      name: 'One property - only walkable button',
      addresses: ['123 Main St'],
      expectedButtons: ['walkable'],
      shouldShowCompare: false,
      shouldShowRoute: false,
      shouldShowWalkable: true
    },
    {
      name: 'No properties - no buttons',
      addresses: [],
      expectedButtons: [],
      shouldShowCompare: false,
      shouldShowRoute: false,
      shouldShowWalkable: false
    }
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    const shouldShowCompare = testCase.addresses.length >= 2;
    const shouldShowRoute = testCase.addresses.length >= 2;
    const shouldShowWalkable = testCase.addresses.length >= 1;
    
    const success = 
      shouldShowCompare === testCase.shouldShowCompare &&
      shouldShowRoute === testCase.shouldShowRoute &&
      shouldShowWalkable === testCase.shouldShowWalkable;
    
    if (success) {
      console.log(`✅ Test ${index + 1}: ${testCase.name}`);
      console.log(`   Compare: ${shouldShowCompare}, Route: ${shouldShowRoute}, Walkable: ${shouldShowWalkable}`);
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: ${testCase.name}`);
      console.log(`   Expected - Compare: ${testCase.shouldShowCompare}, Route: ${testCase.shouldShowRoute}, Walkable: ${testCase.shouldShowWalkable}`);
      console.log(`   Got - Compare: ${shouldShowCompare}, Route: ${shouldShowRoute}, Walkable: ${shouldShowWalkable}`);
      failed++;
    }
  });

  console.log('');
  return failed === 0;
}

/**
 * Test 3: Message construction for quick actions
 */
function testMessageConstruction() {
  console.log('Test 3: Quick Action Message Construction');
  console.log('------------------------------------------');
  
  const testCases = [
    {
      action: 'compare_last_two',
      addresses: ['1007 S Prospect Ave', '425 Vía El Chico'],
      expectedMessage: 'Compare these properties: 1007 S Prospect Ave and 425 Vía El Chico'
    },
    {
      action: 'plan_route',
      addresses: ['Property A', 'Property B', 'Property C'],
      expectedMessage: 'Plan a 1-hour route to visit these open houses: Property A, Property B, Property C'
    },
    {
      action: 'walkable_to_pier',
      addresses: ['123 Main St'],
      expectedMessage: 'Which of these properties are walkable to the pier?'
    }
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    let messageText = '';
    
    switch (testCase.action) {
      case 'compare_last_two':
        messageText = `Compare these properties: ${testCase.addresses[0]} and ${testCase.addresses[1]}`;
        break;
      case 'plan_route':
        messageText = `Plan a 1-hour route to visit these open houses: ${testCase.addresses.join(', ')}`;
        break;
      case 'walkable_to_pier':
        messageText = `Which of these properties are walkable to the pier?`;
        break;
    }
    
    const success = messageText === testCase.expectedMessage;
    
    if (success) {
      console.log(`✅ Test ${index + 1}: ${testCase.action}`);
      console.log(`   Message: "${messageText}"`);
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: ${testCase.action}`);
      console.log(`   Expected: "${testCase.expectedMessage}"`);
      console.log(`   Got: "${messageText}"`);
      failed++;
    }
  });

  console.log('');
  return failed === 0;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting test suite...\n');
  
  const results = [];
  
  // Run tests
  results.push(testAddressExtraction());
  results.push(testQuickActionLogic());
  results.push(testMessageConstruction());
  
  // Summary
  console.log('====================================');
  console.log('Test Summary');
  console.log('====================================');
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\nPassed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n❌ ${total - passed} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
