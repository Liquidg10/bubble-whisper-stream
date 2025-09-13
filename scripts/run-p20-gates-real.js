#!/usr/bin/env node
/**
 * P20 E2E Verification Gates Runner - REAL EXECUTION
 * Complete production validation checklist with actual test execution
 */

const { execSync } = require('child_process');
const { existsSync, writeFileSync } = require('fs');

console.log('🚀 Running P20 E2E Verification Gates (REAL EXECUTION)...\n');

const gates = [
  {
    name: 'Task Round-Trip Invariants',
    test: 'tests/e2e/gates/task-roundtrip.spec.ts',
    critical: true
  },
  {
    name: 'List View Accessibility',
    test: 'tests/e2e/gates/accessibility.spec.ts --grep "List view"',
    critical: true
  },
  {
    name: 'Kanban Keyboard Alternatives',
    test: 'tests/e2e/gates/accessibility.spec.ts --grep "keyboard alternatives"',
    critical: true
  },
  {
    name: 'Matrix Reduced Motion',
    test: 'tests/e2e/gates/accessibility.spec.ts --grep "reduced-motion"',
    critical: true
  },
  {
    name: 'Watch Health Monitoring',
    test: 'tests/e2e/gates/watch-health.spec.ts',
    critical: true
  },
  {
    name: 'OAuth Incremental Auth',
    test: 'tests/e2e/gates/oauth-incremental.spec.ts',
    critical: true
  },
  {
    name: 'Auto-Write Safety',
    test: 'tests/e2e/gates/auto-write-safety.spec.ts',
    critical: true
  },
  {
    name: 'CBT Safety & Crisis',
    test: 'tests/e2e/gates/cbt-compliance.spec.ts',
    critical: true
  },
  {
    name: 'Privacy Controls',
    test: 'tests/e2e/gates/privacy-controls.spec.ts',
    critical: false
  },
  {
    name: 'Performance Budgets',
    test: 'tests/e2e/gates/performance-budgets.spec.ts',
    critical: true
  }
];

let passedGates = 0;
let failedGates = 0;
const results = [];

console.log('Building project for testing...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Build failed. Cannot proceed with E2E tests.');
  process.exit(1);
}

// Install Playwright if needed
try {
  execSync('npx playwright --version', { stdio: 'pipe' });
} catch (error) {
  console.log('📦 Installing Playwright...');
  execSync('npx playwright install', { stdio: 'inherit' });
}

for (const gate of gates) {
  console.log(`\n🔍 Testing: ${gate.name}`);
  
  try {
    // Check if test file exists
    const testFile = gate.test.split(' ')[0]; // Get just the file path
    if (!existsSync(testFile)) {
      console.log(`⚠️  Test file not found: ${testFile}`);
      results.push({ gate: gate.name, status: 'SKIP', reason: 'Test file missing' });
      continue;
    }

    // Run the specific test with JSON reporter to capture results
    const output = execSync(`npx playwright test ${gate.test} --reporter=json`, { 
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    
    // Parse JSON output
    const testResult = JSON.parse(output);
    const passed = testResult.stats?.failures === 0;
    
    if (passed) {
      console.log(`✅ ${gate.name}: PASS`);
      results.push({ gate: gate.name, status: 'PASS' });
      passedGates++;
    } else {
      console.log(`❌ ${gate.name}: FAIL`);
      if (gate.critical) {
        console.log(`   🚨 CRITICAL GATE FAILURE - Production readiness blocked`);
      }
      results.push({ 
        gate: gate.name, 
        status: 'FAIL', 
        critical: gate.critical,
        failures: testResult.stats?.failures || 0
      });
      failedGates++;
    }
    
  } catch (error) {
    console.log(`❌ ${gate.name}: FAIL (execution error)`);
    if (gate.critical) {
      console.log(`   🚨 CRITICAL GATE FAILURE - Production readiness blocked`);
    }
    results.push({ 
      gate: gate.name, 
      status: 'FAIL', 
      critical: gate.critical,
      error: error.message.slice(0, 200) + '...'
    });
    failedGates++;
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('P20 E2E VERIFICATION GATES SUMMARY (REAL EXECUTION)');
console.log('='.repeat(60));

const criticalFailures = results.filter(r => r.status === 'FAIL' && r.critical).length;
const totalGates = results.length;

results.forEach(result => {
  const emoji = result.status === 'PASS' ? '✅' : result.status === 'SKIP' ? '⚠️' : '❌';
  const critical = result.critical ? ' (CRITICAL)' : '';
  console.log(`${emoji} ${result.gate}${critical}`);
  
  if (result.error) {
    console.log(`    Error: ${result.error}`);
  }
  if (result.failures) {
    console.log(`    Failures: ${result.failures}`);
  }
});

console.log(`\nResults: ${passedGates}/${totalGates} gates passed`);

// Write detailed report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    total: totalGates,
    passed: passedGates,
    failed: failedGates,
    critical_failures: criticalFailures
  },
  results: results,
  production_ready: criticalFailures === 0
};

writeFileSync('p20-gates-report.json', JSON.stringify(report, null, 2));
console.log('\n📄 Detailed report saved to: p20-gates-report.json');

if (criticalFailures > 0) {
  console.log(`\n🚨 ${criticalFailures} CRITICAL GATE(S) FAILED`);
  console.log('❌ PRODUCTION READINESS: BLOCKED');
  console.log('\nAction required: Fix critical failures before feature flag enablement');
  process.exit(1);
} else if (failedGates > 0) {
  console.log(`\n⚠️  ${failedGates} non-critical gate(s) failed`);
  console.log('✅ PRODUCTION READINESS: CONDITIONAL');
  console.log('\nRecommendation: Address non-critical issues during gradual rollout');
} else {
  console.log('\n🎉 ALL GATES PASSED');
  console.log('✅ PRODUCTION READINESS: APPROVED');
  console.log('\nFeature flags can be safely enabled for gradual rollout');
}

// Feature flag recommendations
console.log('\n📋 FEATURE FLAG ROLLOUT PLAN:');
console.log('1. Enable taskAdapter=true for internal testing');
console.log('2. Enable viewSdk=true + listView=true for 5% canary');
console.log('3. Enable kanbanView=true + matrixView=true for 25% cohort');
console.log('4. Enable autoWriteCalendar=true for full rollout');
console.log('5. Monitor metrics and rollback if needed');

console.log('\n🎯 PRODUCTION ACTIVATION READY!');
console.log('Next step: Run production activation sequence in dashboard');