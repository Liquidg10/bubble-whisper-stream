#!/usr/bin/env node
/**
 * Complete Production Validation Suite
 * Runs all P20 gates + additional production checks
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

console.log('🏭 Starting Complete Production Validation...\n');

const validationSteps = [
  {
    name: 'Build Verification',
    command: 'npm run build',
    required: true
  },
  {
    name: 'Accessibility CI Gates',
    command: 'npm run test:a11y',
    required: true
  },
  {
    name: 'P20 E2E Verification Gates',
    command: 'npm run test:gates',
    required: true
  },
  {
    name: 'Feature Flag Validation',
    command: 'node scripts/validate-flags.js',
    required: false
  }
];

const results = [];
let allPassed = true;

for (const step of validationSteps) {
  console.log(`\n🔍 Running: ${step.name}`);
  
  try {
    execSync(step.command, { stdio: 'inherit' });
    console.log(`✅ ${step.name}: PASSED`);
    results.push({ step: step.name, status: 'PASS' });
  } catch (error) {
    console.log(`❌ ${step.name}: FAILED`);
    results.push({ step: step.name, status: 'FAIL', required: step.required });
    
    if (step.required) {
      allPassed = false;
    }
  }
}

// Generate validation report
const report = {
  timestamp: new Date().toISOString(),
  results,
  passed: allPassed,
  recommendation: allPassed ? 'APPROVED_FOR_PRODUCTION' : 'BLOCKED_REQUIRES_FIXES'
};

writeFileSync('validation-report.json', JSON.stringify(report, null, 2));

console.log('\n' + '='.repeat(60));
console.log('PRODUCTION VALIDATION COMPLETE');
console.log('='.repeat(60));

if (allPassed) {
  console.log('🎉 ALL VALIDATION STEPS PASSED');
  console.log('✅ System is ready for production rollout');
  console.log('\nNext steps:');
  console.log('1. Enable feature flags in production environment');
  console.log('2. Start with 5% canary rollout');
  console.log('3. Monitor metrics and user feedback');
  console.log('4. Gradually increase to 25% then 100%');
} else {
  console.log('❌ VALIDATION FAILED');
  console.log('🚨 Production rollout is BLOCKED');
  console.log('\nRequired fixes before proceeding:');
  
  results
    .filter(r => r.status === 'FAIL' && r.required)
    .forEach(r => console.log(`   - Fix: ${r.step}`));
}

console.log(`\n📊 Report saved to: validation-report.json`);