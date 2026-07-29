#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'config', 'eslint-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

function collectCounts(results) {
  const counts = {};

  for (const result of results) {
    const file = path.relative(root, result.filePath).split(path.sep).join('/');
    for (const message of result.messages) {
      if (message.severity !== 2) continue;
      const rule = message.ruleId || '<fatal>';
      const key = `${file}::${rule}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

const run = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['eslint', '.', '--format', 'json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
);

if (run.error) {
  console.error(`Could not run ESLint: ${run.error.message}`);
  process.exit(2);
}

let results;
try {
  results = JSON.parse(run.stdout);
} catch (error) {
  console.error(`Could not parse ESLint JSON: ${error.message}`);
  if (run.stderr) console.error(run.stderr);
  process.exit(2);
}

const current = collectCounts(results);
const currentTotal = Object.values(current).reduce((sum, count) => sum + count, 0);

if (writeBaseline) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({
      description: 'Inherited ESLint errors on the main-based CI repair branch. New errors or increases fail CI; decreases are allowed.',
      errorCount: currentTotal,
      counts: current,
    }, null, 2)}\n`
  );
  console.log(`Wrote ESLint baseline with ${currentTotal} inherited errors.`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error('Missing config/eslint-baseline.json. Generate it intentionally with --write-baseline.');
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const regressions = Object.entries(current).filter(
  ([key, count]) => count > (baseline.counts[key] || 0)
);
const resolved = Object.entries(baseline.counts).filter(
  ([key, count]) => (current[key] || 0) < count
);

console.log(`ESLint debt: ${currentTotal} current errors; ${baseline.errorCount} inherited baseline.`);
if (resolved.length > 0) {
  console.log(`Improved buckets: ${resolved.length}. Regenerate the baseline in a dedicated cleanup change to lock in those gains.`);
}

if (regressions.length > 0) {
  console.error(`ESLint ratchet failed: ${regressions.length} error bucket(s) increased.`);
  for (const [key, count] of regressions) {
    console.error(`  ${key}: ${baseline.counts[key] || 0} -> ${count}`);
  }
  process.exit(1);
}

console.log('ESLint ratchet passed: no new or increased error buckets.');
