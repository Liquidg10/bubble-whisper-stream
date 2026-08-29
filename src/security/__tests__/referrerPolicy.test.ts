import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('document referrer policy', () => {
  it('sends only the HTTPS origin needed by website-restricted browser keys', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const document = new DOMParser().parseFromString(indexHtml, 'text/html');
    const referrerPolicies = document.querySelectorAll('meta[name="referrer"]');

    expect(referrerPolicies).toHaveLength(1);
    expect(referrerPolicies[0].getAttribute('content')).toBe('strict-origin');
  });
});
