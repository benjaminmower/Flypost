#!/bin/bash
# Test script for brokerage-specific widget integration

set -e

echo "🧪 Testing Brokerage Widget Integration"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Check widget files exist
echo "Test 1: Checking widget files..."
if [ -f "widget/concierge-widget.js" ] && [ -f "widget/concierge-widget.css" ]; then
    echo -e "${GREEN}✓${NC} Widget files exist"
else
    echo -e "${RED}✗${NC} Widget files missing"
    exit 1
fi

# Test 2: Check theme files exist
echo "Test 2: Checking theme files..."
if [ -f "themes/vista-sir.css" ] && [ -f "themes/compass.css" ] && [ -f "themes/bhhs-utah.css" ]; then
    echo -e "${GREEN}✓${NC} Theme files exist"
else
    echo -e "${RED}✗${NC} Theme files missing"
    exit 1
fi

# Test 3: Check example files exist
echo "Test 3: Checking example files..."
if [ -f "widget/examples/vista-sir-example.html" ] && \
   [ -f "widget/examples/compass-example.html" ] && \
   [ -f "widget/examples/bhhs-utah-example.html" ]; then
    echo -e "${GREEN}✓${NC} Example files exist"
else
    echo -e "${RED}✗${NC} Example files missing"
    exit 1
fi

# Test 4: Validate JavaScript syntax
echo "Test 4: Validating JavaScript syntax..."
if node -c widget/concierge-widget.js 2>/dev/null; then
    echo -e "${GREEN}✓${NC} JavaScript syntax is valid"
else
    echo -e "${RED}✗${NC} JavaScript syntax error"
    exit 1
fi

# Test 5: Check for required configuration elements in examples
echo "Test 5: Validating example structure..."
for example in widget/examples/*.html; do
    filename=$(basename "$example")
    if grep -q "flypost-concierge-container" "$example" && \
       grep -q "FLYPOST_CONFIG" "$example" && \
       grep -q "brokerageId" "$example"; then
        echo -e "${GREEN}✓${NC} $filename has required elements"
    else
        echo -e "${RED}✗${NC} $filename missing required elements"
        exit 1
    fi
done

# Test 6: Check backend has brokerageId support
echo "Test 6: Checking backend brokerageId support..."
if grep -q "brokerageId" ../backend/src/concierge/routes.js && \
   grep -q "brokerageId" ../backend/src/concierge/chatHandler.js; then
    echo -e "${GREEN}✓${NC} Backend has brokerageId support"
else
    echo -e "${RED}✗${NC} Backend missing brokerageId support"
    exit 1
fi

# Test 7: Check documentation exists
echo "Test 7: Checking documentation..."
if [ -f "BROKERAGE_INTEGRATION.md" ]; then
    echo -e "${GREEN}✓${NC} Documentation exists"
else
    echo -e "${RED}✗${NC} Documentation missing"
    exit 1
fi

echo ""
echo "========================================"
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "To test the widget locally:"
echo "1. Start the backend: cd ../backend && ENABLE_CONCIERGE=true npm start"
echo "2. Open widget/examples/vista-sir-example.html in a browser"
echo "3. Update apiBase to 'http://localhost:3001' in the HTML"
