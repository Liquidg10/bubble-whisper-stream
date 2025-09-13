#!/bin/bash

# P20 E2E Verification Gates Test Runner
echo "🧪 Running P20 E2E Verification Gates..."

# Check if Playwright is installed
if ! command -v npx playwright &> /dev/null; then
    echo "❌ Playwright not found. Installing..."
    npx playwright install
fi

# Run E2E Gates Tests
echo "🚪 Running E2E Gates (P20)..."
npx playwright test tests/e2e/gates/ --reporter=html

# Run Accessibility Tests  
echo "♿ Running Accessibility Tests (P11)..."
npx playwright test tests/a11y/ --reporter=html

# Run OAuth Tests
echo "🔐 Running OAuth Tests (P10)..."
npx playwright test tests/oauth/ --reporter=html

echo "✅ All tests completed. Check test-results/ for detailed reports."