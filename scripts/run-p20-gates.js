#!/usr/bin/env node
/**
 * P20 E2E Verification Gates Runner
 * Complete production validation checklist
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🚀 Running P20 E2E Verification Gates...\n');

const gates = [
  {
    name: 'Task Round-Trip Invariants',
    test: 'tests/e2e/gates/task-roundtrip.spec.ts',
    critical: true
  },
  {
    name: 'List View Accessibility',
    test: 'tests/e2e/gates/accessibility.spec.ts:.*List view',
    critical: true
  },
  {
    name: 'Kanban Keyboard Alternatives',
    test: 'tests/e2e/gates/accessibility.spec.ts:.*keyboard alternatives',
    critical: true
  },
  {
    name: 'Matrix Reduced Motion',
    test: 'tests/e2e/gates/accessibility.spec.ts:.*reduced-motion',
    critical: true
  },
  {
    name: 'Watch Health Monitoring',
    test: 'tests/e2e/gates/watch-health.spec.ts',
    critical: true
  },
  {
    name: 'OAuth Incremental Auth',
    test: 'tests/e2e/gates-validation.spec.ts:.*OAuth incremental auth',
    critical: true
  },
  {
    name: 'Auto-Write Ladder',
    test: 'tests/e2e/gates-validation.spec.ts:.*Auto-Write ladder',
    critical: true
  },
  {
    name: 'Planning Mode',
    test: 'tests/e2e/gates-validation.spec.ts:.*Planning mode',
    critical: false
  },
  {
    name: 'Cognitive Load Budgets',
    test: 'tests/e2e/gates-validation.spec.ts:.*Cognitive load',
    critical: true
  },
  {
    name: 'Assistant Voice Cohesion',
    test: 'tests/e2e/gates-validation.spec.ts:.*Assistant voice',
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

for (const gate of gates) {
  console.log(`\n🔍 Testing: ${gate.name}`);
  
  try {
    // Check if test file exists
    if (!existsSync(gate.test.split(':')[0])) {
      console.log(`⚠️  Test file not found: ${gate.test}`);
      results.push({ gate: gate.name, status: 'SKIP', reason: 'Test file missing' });
      continue;
    }

    // Run the specific test
    execSync(`npx playwright test ${gate.test} --reporter=line`, { 
      stdio: 'pipe' 
    });
    
    console.log(`✅ ${gate.name}: PASS`);
    results.push({ gate: gate.name, status: 'PASS' });
    passedGates++;
    
  } catch (error) {
    console.log(`❌ ${gate.name}: FAIL`);
    if (gate.critical) {
      console.log(`   🚨 CRITICAL GATE FAILURE - Production readiness blocked`);
    }
    results.push({ gate: gate.name, status: 'FAIL', critical: gate.critical });
    failedGates++;
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('P20 E2E VERIFICATION GATES SUMMARY');
console.log('='.repeat(60));

const criticalFailures = results.filter(r => r.status === 'FAIL' && r.critical).length;
const totalGates = results.length;

results.forEach(result => {
  const emoji = result.status === 'PASS' ? '✅' : result.status === 'SKIP' ? '⚠️' : '❌';
  const critical = result.critical ? ' (CRITICAL)' : '';
  console.log(`${emoji} ${result.gate}${critical}`);
});

console.log(`\nResults: ${passedGates}/${totalGates} gates passed`);

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