import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

test('unused VITE environment fields are absent from all emitted JavaScript', () => {
  const artifactRoot = resolve('node_modules/.cache/mind-manual-owner-fixture');
  const assetRoot = resolve(artifactRoot, 'assets');
  const scripts = readdirSync(assetRoot).filter(name => name.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(1);
  const artifacts = [readFileSync(resolve(artifactRoot, 'index.html'), 'utf8'),
    ...scripts.map(name => readFileSync(resolve(assetRoot, name), 'utf8'))];
  const bundle = artifacts.join('\n');
  // Confirm this is the newly built isolated fixture, not an unrelated artifact.
  expect(bundle).toContain('fjxedbaskrbewjunfxaj');
  expect(bundle).toContain('http://127.0.0.1:4181');
  // The fixture build receives this otherwise-unused public environment field.
  // Selecting fields after passing the entire import.meta.env object is too late.
  expect(bundle).not.toContain('VITE_UNUSED_BOUNDARY_SENTINEL');
  expect(bundle).not.toContain('unused-boundary-value-must-not-ship-20260830');
});
