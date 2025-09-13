#!/usr/bin/env node

/**
 * P11 - Accessibility Gate Script
 * Runs comprehensive accessibility checks and generates reports
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GATE_CHECKS = [
  {
    name: 'Target Size Validation',
    command: 'npx playwright test tests/a11y/target-size.spec.ts --reporter=json',
    required: true
  },
  {
    name: 'Keyboard Navigation',
    command: 'npx playwright test tests/a11y/keyboard-alternatives.spec.ts --reporter=json',
    required: true
  },
  {
    name: 'Core A11y Compliance',
    command: 'npx playwright test tests/a11y/core-accessibility.spec.ts --reporter=json',
    required: true
  },
  {
    name: 'Reduced Motion',
    command: 'npx playwright test tests/a11y/reduced-motion.spec.ts --reporter=json',
    required: false
  }
];

async function runAccessibilityGate() {
  console.log('🛡️  Running Accessibility Gate Checks...\n');
  
  const results = [];
  let allPassed = true;
  
  for (const check of GATE_CHECKS) {
    console.log(`Running: ${check.name}`);
    
    try {
      const output = execSync(check.command, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const result = JSON.parse(output);
      const passed = result.stats.failures === 0;
      
      results.push({
        name: check.name,
        passed,
        required: check.required,
        failures: result.stats.failures,
        tests: result.stats.tests
      });
      
      if (check.required && !passed) {
        allPassed = false;
        console.log(`❌ ${check.name}: ${result.stats.failures} failures`);
      } else if (passed) {
        console.log(`✅ ${check.name}: All tests passed`);
      } else {
        console.log(`⚠️  ${check.name}: ${result.stats.failures} failures (non-blocking)`);
      }
      
    } catch (error) {
      const failed = {
        name: check.name,
        passed: false,
        required: check.required,
        error: error.message
      };
      
      results.push(failed);
      
      if (check.required) {
        allPassed = false;
        console.log(`❌ ${check.name}: Test execution failed`);
      } else {
        console.log(`⚠️  ${check.name}: Test execution failed (non-blocking)`);
      }
    }
    
    console.log('');
  }
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    passed: allPassed,
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      required: results.filter(r => r.required).length
    }
  };
  
  // Write report to file
  const reportPath = path.join('test-results', 'a11y-gate-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('📊 Accessibility Gate Summary:');
  console.log(`   Total checks: ${report.summary.total}`);
  console.log(`   Passed: ${report.summary.passed}`);
  console.log(`   Failed: ${report.summary.failed}`);
  console.log(`   Report saved: ${reportPath}\n`);
  
  if (allPassed) {
    console.log('🎉 All required accessibility checks passed!');
    process.exit(0);
  } else {
    console.log('💥 Required accessibility checks failed!');
    console.log('   Fix the failing tests before deployment.');
    process.exit(1);
  }
}

if (require.main === module) {
  runAccessibilityGate().catch(error => {
    console.error('Accessibility gate failed:', error);
    process.exit(1);
  });
}

module.exports = { runAccessibilityGate };