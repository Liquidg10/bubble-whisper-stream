import { describe, expect, it } from 'vitest';
import { cbtGuardService } from '../cbtGuardService';

function sanitize(messageContent: string): string {
  return cbtGuardService.filterForNetworkTransmission({ messageContent }).messageContent;
}

describe('cbtGuardService network redaction ordering', () => {
  it.each([
    ['hyphenated local phone', 'Call 555-1234', 'Call [PHONE]'],
    ['bare local phone', 'Call 5551234', 'Call [PHONE]'],
    ['10-digit phone', 'Call 808-555-1234', 'Call [PHONE]'],
    ['SSN', 'SSN 123-45-6789', 'SSN [SSN]'],
    ['spaced card', 'Card 4111 1111 1111 1111', 'Card [CARD]'],
    ['hyphenated card', 'Card 4111-1111-1111-1111', 'Card [CARD]']
  ])('redacts %s without a shorter rule shadowing it', (_label, input, expected) => {
    expect(sanitize(input)).toBe(expected);
  });

  it('classifies adjacent mixed identifiers independently', () => {
    expect(sanitize(
      'Local 555-1234; mobile 808-555-1234; SSN 123-45-6789; card 4111-1111-1111-1111'
    )).toBe(
      'Local [PHONE]; mobile [PHONE]; SSN [SSN]; card [CARD]'
    );
  });
});
