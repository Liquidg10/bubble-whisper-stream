import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const ownerOrigin = 'http://127.0.0.1:4181';
const artifactRoot = resolve('node_modules/.cache/mind-manual-owner-fixture');

async function offlineArtifact(page: Page) {
  const requests: string[] = [];
  const external: string[] = [];
  await page.addInitScript(() => {
    const attempts = { indexedDbOpens: 0, webSockets: 0, fetches: 0 };
    Object.defineProperty(window, '__deploymentAttempts', { value: attempts });
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => { attempts.indexedDbOpens++; return originalOpen(...args); };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => { attempts.fetches++; return originalFetch(...args); };
    window.WebSocket = class {
      constructor() { attempts.webSockets++; throw new Error('Offline deployment test blocked WebSocket'); }
    } as unknown as typeof WebSocket;
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    if (!['127.0.0.1', 'localhost', 'bubble-whisper-stream.lovable.app', 'copied.example.test'].includes(url.hostname)) {
      external.push(url.href);
      if (url.hostname === 'fonts.googleapis.com') {
        // Optional typography must not become a prerequisite for App startup.
        await route.abort();
        return;
      }
      // Even the allowed owner build cannot reach providers in this fixture.
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"offline_fixture"}' });
      return;
    }
    const relative = url.pathname === '/' || !url.pathname.includes('.') ? 'index.html' : url.pathname.slice(1);
    const file = resolve(artifactRoot, relative);
    if (!file.startsWith(artifactRoot + sep)) return route.abort();
    try {
      const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css'
        : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      await route.fulfill({ status: 200, contentType, body: readFileSync(file) });
    } catch { await route.fulfill({ status: 404, body: 'Fixture asset not found' }); }
  });
  return { requests, external };
}

test('built HTML preloads only the bundler runtime, not application code or CSS', async () => {
  const html = readFileSync(resolve(artifactRoot, 'index.html'), 'utf8');
  expect(html).not.toMatch(/rel=["']stylesheet["']/u);
  const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]+href="([^"]+)"/gu)].map(match => match[1]);
  expect(preloads).toHaveLength(1);
  expect(preloads[0]).toMatch(/^\/assets\/rolldown-runtime-[\w-]+\.js$/u);
  const runtime = readFileSync(resolve(artifactRoot, preloads[0].slice(1)), 'utf8');
  expect(runtime).not.toMatch(/\b(?:import|fetch|XMLHttpRequest|WebSocket|indexedDB|supabase|document)\b/u);
  expect(html).not.toContain('fonts.googleapis.com');
  expect(html).not.toContain('mountApplication');
});

for (const origin of ['http://localhost:4181', 'https://bubble-whisper-stream.lovable.app', 'https://copied.example.test']) {
  test(`copied isolated build stops before app activity at ${origin}`, async ({ page }, testInfo) => {
    const network = await offlineArtifact(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'App connection paused', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('No app connection was started');
    await expect(page.getByRole('button')).toHaveCount(0);
    expect(network.external).toEqual([]);
    const assets = network.requests.filter(url => /\/assets\//u.test(url));
    expect(assets).toHaveLength(2);
    expect(assets.every(url => /\/assets\/(?:index|rolldown-runtime)-[\w-]+\.js$/u.test(url))).toBe(true);
    expect(network.requests.some(url => /mountApplication|\.css(?:$|\?)/u.test(url))).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { __deploymentAttempts: object }).__deploymentAttempts))
      .toEqual({ indexedDbOpens: 0, webSockets: 0, fetches: 0 });
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('isolated-build-stopped.png'), fullPage: true });
  });
}

test('exact isolated origin starts the actual application with no source-backend traffic', async ({ page }, testInfo) => {
  const network = await offlineArtifact(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, '__preloadErrors', { value: [] });
    window.addEventListener('vite:preloadError', event => {
      (window as unknown as { __preloadErrors: string[] }).__preloadErrors.push(String((event as Event & { payload?: Error }).payload?.stack));
    });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(ownerOrigin);
  try {
    // Fresh root startup now teaches through editable guide bubbles instead
    // of a modal. Exercise that actual local action before declaring startup.
    await expect(page.getByRole('heading', { name: /^Small actions\.\s*Connected possibilities\.$/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Welcome', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start with 3 guide bubbles', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Adaptive Bubble view', exact: true })).toBeVisible();
    await expect(page.locator('[data-adaptive-bubble]')).toHaveCount(3);
  } finally {
    const diagnostics = {
      errors,
      preloadErrors: await page.evaluate(() => (window as unknown as { __preloadErrors: string[] }).__preloadErrors),
      requests: network.requests,
    };
    await testInfo.attach('startup-diagnostics', { contentType: 'application/json', body: JSON.stringify(diagnostics, null, 2) });
  }
  expect(await page.evaluate(() => (window as unknown as { __preloadErrors: string[] }).__preloadErrors)).toEqual([]);
  await expect(page.getByRole('heading', { name: 'App connection paused' })).toHaveCount(0);
  expect(network.requests.some(url => url.includes('mountApplication'))).toBe(true);
  expect(network.requests.some(url => url.includes('fonts.googleapis.com'))).toBe(true);
  expect(network.requests.some(url => url.includes('ekekeywoxvdbfbmqyhjy'))).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('isolated-build-started.png'), fullPage: true });
});
