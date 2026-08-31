import { describe, expect, it } from 'vitest';
import { loadOptionalFonts } from '../../../loadOptionalFonts';

describe('optional typography after guarded mount', () => {
  it('adds the existing font stylesheet without an awaited startup dependency', () => {
    const document = window.document.implementation.createHTMLDocument('fixture');
    expect(loadOptionalFonts(document)).toBeUndefined();
    const link = document.querySelector('link')!;
    expect(link.rel).toBe('stylesheet');
    expect(link.href).toBe('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');
    expect(() => link.dispatchEvent(new Event('error'))).not.toThrow();
  });

  it('is idempotent within a document, not shared across documents', () => {
    const first = window.document.implementation.createHTMLDocument('first');
    const second = window.document.implementation.createHTMLDocument('second');
    loadOptionalFonts(first);
    loadOptionalFonts(first);
    loadOptionalFonts(second);
    expect(first.querySelectorAll('link')).toHaveLength(1);
    expect(second.querySelectorAll('link')).toHaveLength(1);
  });
});
