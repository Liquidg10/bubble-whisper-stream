#!/usr/bin/env node
/**
 * Run P20 E2E Verification Gates
 * Execute the complete production validation suite
 */

import { execSync } from 'child_process';

console.log('🚀 Starting P20 E2E Verification Gates...\n');

// Set environment for testing
process.env.NODE_ENV = 'test';
process.env.CI = 'true';

const steps = [
  {
    name: 'Install Playwright browsers',
    command: 'npx playwright install --with-deps chromium firefox webkit'
  },
  {
    name: 'Build application',
    command: 'npm run build'
  },
  {
    name: 'Start preview server (background)',
    command: 'npm run preview &',
    background: true
  },
  {
    name: 'Run P20 E2E Gates',
    command: 'node scripts/run-p20-gates.js'
  },
  {
    name: 'Run Accessibility CI Tests', 
    command: 'npx playwright test tests/a11y --reporter=html'
  },
  {
    name: 'Validate Feature Flags',
    command: 'node scripts/validate-flags.js'
  },
  {
    name: 'Generate Production Validation Report',
    command: 'node scripts/production-validation.js'
  }
];

let backgroundPids = [];

async function runStep(step) {
  console.log(`\n📋 ${step.name}...`);
  
  try {
    if (step.background) {
      // Start background process
      const child = execSync(step.command, { 
        stdio: 'pipe',
        detached: true
      });
      backgroundPids.push(child.pid);
      console.log(`✅ ${step.name}: Started (PID: ${child.pid})`);
      
      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      execSync(step.command, { stdio: 'inherit' });
      console.log(`✅ ${step.name}: COMPLETED`);
    }
  } catch (error) {
    console.log(`❌ ${step.name}: FAILED`);
    throw error;
  }
}

async function main() {
  try {
    for (const step of steps) {
      await runStep(step);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 P20 E2E VERIFICATION GATES COMPLETE');
    console.log('='.repeat(60));
    console.log('✅ All validation steps passed');
    console.log('📊 Check validation-report.json for detailed results');
    console.log('\n📋 Next steps:');
    console.log('1. Review validation report');
    console.log('2. Enable feature flags for canary rollout');
    console.log('3. Monitor production metrics');
    console.log('4. Proceed with gradual rollout');
    
  } catch (error) {
    console.log('\n❌ E2E VALIDATION FAILED');
    console.log('🚨 Production rollout BLOCKED');
    console.log(`Error: ${error.message}`);
    process.exit(1);
  } finally {
    // Cleanup background processes
    backgroundPids.forEach(pid => {
      try {
        process.kill(pid);
      } catch (error) {
        // Process may have already terminated
      }
    });
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Terminating validation...');
  backgroundPids.forEach(pid => {
    try {
      process.kill(pid);
    } catch (error) {
      // Process may have already terminated
    }
  });
  process.exit(0);
});

main();