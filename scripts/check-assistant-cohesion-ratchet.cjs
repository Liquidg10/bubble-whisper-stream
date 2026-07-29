#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { scanDirectory } = require('./lint-assistant-cohesion.cjs');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'config', 'assistant-cohesion-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');
const violations = scanDirectory(path.join(root, 'src'));
const counts = {};

for (const violation of violations) {
  const file = path.relative(root, violation.file).split(path.sep).join('/');
  const persona = violation.message.match(/"([^"]+)"/)?.[1] || '<unknown>';
  const key = `${file}::${persona}`;
  counts[key] = (counts[key] || 0) + 1;
}

const current = Object.fromEntries(
  Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
);
const currentTotal = violations.length;

if (writeBaseline) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({
      description: 'Inherited assistant-cohesion findings. New findings or increases fail CI; decreases are allowed.',
      violationCount: currentTotal,
      counts: current,
    }, null, 2)}\n`
  );
  console.log(`Wrote assistant-cohesion baseline with ${currentTotal} inherited findings.`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error('Missing config/assistant-cohesion-baseline.json. Generate it intentionally with --write-baseline.');
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const regressions = Object.entries(current).filter(
  ([key, count]) => count > (baseline.counts[key] || 0)
);
const resolved = Object.entries(baseline.counts).filter(
  ([key, count]) => (current[key] || 0) < count
);

console.log(`Assistant-cohesion debt: ${currentTotal} current findings; ${baseline.violationCount} inherited baseline.`);
if (resolved.length > 0) {
  console.log(`Improved buckets: ${resolved.length}. Regenerate the baseline in a dedicated cleanup change to lock in those gains.`);
}

if (regressions.length > 0) {
  console.error(`Assistant-cohesion ratchet failed: ${regressions.length} finding bucket(s) increased.`);
  for (const [key, count] of regressions) {
    console.error(`  ${key}: ${baseline.counts[key] || 0} -> ${count}`);
  }
  process.exit(1);
}

console.log('Assistant-cohesion ratchet passed: no new or increased finding buckets.');
