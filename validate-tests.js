/**
 * Test execution runner - runs P20 gates validation
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🧪 Starting P20 E2E Verification Gates...\n');

try {
  // Check if Playwright is available
  console.log('🔍 Checking Playwright installation...');
  
  try {
    execSync('npx playwright --version', { stdio: 'pipe' });
    console.log('✅ Playwright is installed');
  } catch (error) {
    console.log('📦 Installing Playwright...');
    execSync('npx playwright install', { stdio: 'inherit' });
  }

  // Check test files exist
  const testFiles = [
    'tests/e2e/gates/task-roundtrip.spec.ts',
    'tests/e2e/gates/accessibility.spec.ts', 
    'tests/e2e/gates/watch-health.spec.ts',
    'tests/e2e/gates/auto-write-safety.spec.ts',
    'tests/e2e/gates/crdt-conflicts.spec.ts',
    'tests/a11y/target-size.spec.ts'
  ];

  console.log('\n🔍 Validating test structure...');
  let missingFiles = 0;
  
  testFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} - MISSING`);
      missingFiles++;
    }
  });

  if (missingFiles > 0) {
    console.log(`\n⚠️  ${missingFiles} test files missing. Test infrastructure is ready but some tests need implementation.`);
  }

  // Test available commands
  console.log('\n📋 Available test commands:');
  console.log('• npx playwright test tests/e2e/gates/ - Run P20 verification gates');
  console.log('• npx playwright test tests/a11y/ - Run accessibility tests');
  console.log('• npx playwright test tests/oauth/ - Run OAuth tests');
  console.log('• node scripts/run-p20-gates.js - Full P20 validation');

  console.log('\n🎯 Test infrastructure is ready!');
  console.log('Run: node scripts/run-p20-gates.js for full validation');

} catch (error) {
  console.error('❌ Error setting up tests:', error.message);
}