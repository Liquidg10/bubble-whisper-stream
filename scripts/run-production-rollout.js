#!/usr/bin/env node
/**
 * Production Rollout Orchestrator - P20 Phase 3
 * Complete production deployment pipeline
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';

console.log('🚀 P20 Production Rollout Pipeline\n');

const ROLLOUT_STEPS = [
  {
    name: 'P20 Gate Validation',
    command: 'node scripts/run-p20-gates.js',
    critical: true,
    description: 'Validate all P20 production readiness gates'
  },
  {
    name: 'Feature Flag Validation', 
    command: 'node scripts/validate-flags.js',
    critical: true,
    description: 'Ensure production-safe feature flag configuration'
  },
  {
    name: 'Build Production Bundle',
    command: 'npm run build',
    critical: true,
    description: 'Create optimized production build'
  },
  {
    name: 'Performance Budget Check',
    command: 'npx playwright test tests/e2e/gates/performance-budgets.spec.ts',
    critical: true,
    description: 'Validate FPS targets and memory usage'
  },
  {
    name: 'Security Validation',
    command: 'npx playwright test tests/e2e/gates/privacy-controls.spec.ts',
    critical: true,
    description: 'Verify privacy controls and data protection'
  },
  {
    name: 'Accessibility Compliance',
    command: 'npx playwright test tests/a11y/',
    critical: true,
    description: 'WCAG AA compliance validation'
  },
  {
    name: 'CBT Safety Gates',
    command: 'npx playwright test tests/e2e/gates/cbt-compliance.spec.ts',
    critical: true,
    description: 'Crisis detection and safety protocol validation'
  },
  {
    name: 'CRDT Conflict Resolution',
    command: 'npx playwright test tests/e2e/gates/crdt-conflicts.spec.ts',
    critical: false,
    description: 'Multi-device sync stability testing'
  },
  {
    name: 'OAuth Incremental Flow',
    command: 'npx playwright test tests/e2e/gates/oauth-incremental.spec.ts',
    critical: true,
    description: 'Least privilege authorization testing'
  }
];

async function runRolloutStep(step) {
  console.log(`\n🔍 ${step.name}`);
  console.log(`   ${step.description}`);
  
  try {
    execSync(step.command, { 
      stdio: step.critical ? 'inherit' : 'pipe'
    });
    
    console.log(`✅ ${step.name}: PASSED`);
    return { name: step.name, status: 'PASSED', critical: step.critical };
    
  } catch (error) {
    console.log(`❌ ${step.name}: FAILED`);
    
    if (step.critical) {
      console.log(`   🚨 CRITICAL FAILURE - Production rollout blocked`);
    } else {
      console.log(`   ⚠️  Non-critical failure - Can proceed with caution`);
    }
    
    return { 
      name: step.name, 
      status: 'FAILED', 
      critical: step.critical,
      error: error.message.slice(0, 200) 
    };
  }
}

async function main() {
  console.log('Starting P20 production validation pipeline...\n');
  
  const results = [];
  let criticalFailures = 0;
  let totalFailures = 0;

  // Run each validation step
  for (const step of ROLLOUT_STEPS) {
    const result = await runRolloutStep(step);
    results.push(result);
    
    if (result.status === 'FAILED') {
      totalFailures++;
      if (result.critical) {
        criticalFailures++;
      }
    }
  }

  // Generate rollout report
  const report = {
    timestamp: new Date().toISOString(),
    pipeline: 'P20 Production Rollout',
    totalSteps: ROLLOUT_STEPS.length,
    passed: results.filter(r => r.status === 'PASSED').length,
    failed: totalFailures,
    criticalFailures,
    results,
    recommendation: criticalFailures === 0 ? 'APPROVED' : 'BLOCKED',
    nextSteps: criticalFailures === 0 
      ? [
          'Enable feature flags for 5% canary rollout',
          'Monitor telemetry metrics for 24 hours', 
          'Advance to 25% rollout if stable',
          'Complete full rollout if metrics remain healthy'
        ]
      : [
          'Fix critical gate failures before proceeding',
          'Re-run validation pipeline',
          'Review P20 compliance checklist'
        ]
  };

  // Save report
  writeFileSync('production-rollout-report.json', JSON.stringify(report, null, 2));
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('P20 PRODUCTION ROLLOUT VALIDATION SUMMARY');
  console.log('='.repeat(70));
  
  results.forEach(result => {
    const emoji = result.status === 'PASSED' ? '✅' : '❌';
    const critical = result.critical ? ' (CRITICAL)' : '';
    console.log(`${emoji} ${result.name}${critical}`);
  });
  
  console.log(`\nResults: ${report.passed}/${report.totalSteps} steps passed`);
  
  if (criticalFailures > 0) {
    console.log(`\n🚨 ${criticalFailures} CRITICAL FAILURE(S) DETECTED`);
    console.log('❌ PRODUCTION ROLLOUT: BLOCKED');
    console.log('\n📋 REQUIRED ACTIONS:');
    report.nextSteps.forEach(step => console.log(`   • ${step}`));
    process.exit(1);
    
  } else if (totalFailures > 0) {
    console.log(`\n⚠️  ${totalFailures} non-critical failure(s) detected`);
    console.log('✅ PRODUCTION ROLLOUT: CONDITIONAL APPROVAL');
    console.log('\nRecommendation: Proceed with caution and monitor closely');
    
  } else {
    console.log('\n🎉 ALL VALIDATION GATES PASSED');
    console.log('✅ PRODUCTION ROLLOUT: FULLY APPROVED');
  }

  console.log('\n📋 ROLLOUT SEQUENCE:');
  report.nextSteps.forEach((step, index) => {
    console.log(`   ${index + 1}. ${step}`);
  });
  
  console.log(`\n📊 Full report saved to: production-rollout-report.json`);
  
  if (criticalFailures === 0) {
    console.log('\n🚀 Ready to initiate feature flag canary rollout!');
    console.log('   Use: npm run deploy:canary');
  }
}

main().catch(error => {
  console.error('\n❌ Pipeline execution failed:', error);
  process.exit(1);
});