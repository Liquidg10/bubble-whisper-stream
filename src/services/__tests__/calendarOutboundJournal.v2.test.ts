import { beforeEach, describe, expect, it } from 'vitest';
import { calendarOutboundJournalKey, outboundOperationIdentity, parseOutboundHoldInventory, readOutboundJournal, writeOutboundJournal } from '../calendarOutboundJournal';
const OWNER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '20000000-0000-4000-8000-000000000002';
const OP = '30000000-0000-4000-8000-000000000003';
const OTHER = '40000000-0000-4000-8000-000000000004';
const legacy = () => ({ operationId: OTHER, taskId: 'legacy', calendarAccountId: ACCOUNT, eventId: 'event', createdAt: 1, outcome: 'pending' as const });
const receipt = () => ({ ...legacy(), operationId: OP, intent: { version: 2 as const, googleCalendarId: 'synthetic@example.test', expectedEtag: '"old"', requestDigest: 'a'.repeat(64), afterDigest: 'b'.repeat(64) } });
const journal = () => ({ version: 1 as const, ownerUserId: OWNER, receipts: [legacy(), receipt()] });
const saved = () => localStorage.getItem(calendarOutboundJournalKey(OWNER));
describe('v2 intent in the existing outbound journal slot', () => {
  beforeEach(() => localStorage.clear());
  it('preserves legacy records and minimal hashes without provider text; makes no second storage key', () => {
    const source = journal(); const beforeLegacy = JSON.stringify(source.receipts[0]);
    writeOutboundJournal(OWNER, source, null); expect(localStorage.length).toBe(1);
    const loaded = readOutboundJournal(OWNER).journal; expect(JSON.stringify(loaded.receipts[0])).toBe(beforeLegacy);
    expect(loaded.receipts[1].intent).toEqual(receipt().intent); expect(outboundOperationIdentity(loaded.receipts[0])).toBeNull();
    expect(outboundOperationIdentity(loaded.receipts[1])).toMatchObject({ operationId: OP, googleCalendarId: 'synthetic@example.test', requestDigest: 'a'.repeat(64) });
    expect(saved()).not.toMatch(/description|title|access_token|before|afterFields/);
  });
  it.each([null, undefined, { version: 1 }, { ...receipt().intent, version: 3 }, { ...receipt().intent, googleCalendarId: 'primary' },
    { ...receipt().intent, requestDigest: 'BAD' }, { ...receipt().intent, afterDigest: '' }, { ...receipt().intent, expectedEtag: 'no-quotes' },
    { ...receipt().intent, extra: true }])('rejects own malformed intent without fallback to legacy', intent => {
    const value = { ...journal(), receipts: [{ ...receipt(), intent }] };
    expect(() => writeOutboundJournal(OWNER, value as never, null)).toThrow(); expect(saved()).toBeNull();
  });
  it.each(['version', 'googleCalendarId', 'expectedEtag', 'requestDigest', 'afterDigest'])('requires own intent field %s', key => {
    const intent: Record<string, unknown> = { ...receipt().intent }; const inherited = Object.create({ [key]: intent[key] }); delete intent[key]; Object.assign(inherited, intent);
    expect(() => writeOutboundJournal(OWNER, { ...journal(), receipts: [{ ...receipt(), intent: inherited }] }, null)).toThrow();
  });
  it('does not infer v2 intent from a prototype', () => {
    const source = Object.assign(Object.create({ intent: receipt().intent }), legacy());
    expect(outboundOperationIdentity(source)).toBeNull(); expect(() => writeOutboundJournal(OWNER, { ...journal(), receipts: [source] }, null)).toThrow();
  });
  it.each(['requestDigest', 'afterDigest', 'expectedEtag', 'googleCalendarId', 'taskId', 'eventId', 'calendarAccountId', 'createdAt', 'drop', 'upgrade-legacy'])('refuses immutable history change %s', key => {
    const before = writeOutboundJournal(OWNER, journal(), null); const next = readOutboundJournal(OWNER).journal;
    if (key === 'drop') next.receipts = [next.receipts[1]];
    else if (key === 'upgrade-legacy') next.receipts[0].intent = receipt().intent;
    else if (key === 'createdAt') next.receipts[1].createdAt = 2;
    else if (key === 'taskId') next.receipts[1].taskId = 'different';
    else if (key === 'eventId') next.receipts[1].eventId = 'different';
    else if (key === 'calendarAccountId') next.receipts[1].calendarAccountId = OTHER;
    else if (key === 'googleCalendarId') next.receipts[1].intent!.googleCalendarId = 'other@example.test';
    else if (key === 'expectedEtag') next.receipts[1].intent!.expectedEtag = '"other"';
    else next.receipts[1].intent![key as 'requestDigest' | 'afterDigest'] = 'c'.repeat(64);
    expect(() => writeOutboundJournal(OWNER, next, before)).toThrow(); expect(saved()).toBe(before);
  });
  it('refuses clearing a legacy hold while permitting exact v2 terminal completion', () => {
    const before = writeOutboundJournal(OWNER, journal(), null); const next = readOutboundJournal(OWNER).journal;
    Object.assign(next.receipts[0], { outcome: 'not_written', completedAt: 2 }); expect(() => writeOutboundJournal(OWNER, next, before)).toThrow();
    next.receipts[0] = legacy(); Object.assign(next.receipts[1], { outcome: 'written', completedAt: 2, etag: '"after"' });
    const completed = writeOutboundJournal(OWNER, next, before); const reset = readOutboundJournal(OWNER).journal; reset.receipts[1] = receipt();
    expect(() => writeOutboundJournal(OWNER, reset, completed)).toThrow(); expect(saved()).toBe(completed);
  });
  it('clones nested intent at the UI inventory boundary', () => {
    const source = receipt(); const parsed = parseOutboundHoldInventory([source], OWNER)!;
    parsed[0].intent!.requestDigest = 'f'.repeat(64); expect(source.intent.requestDigest).toBe('a'.repeat(64));
  });
  it.each(['not_written', 'changed-etag', 'uncertain'])('refuses %s contradictory transition from provider-written evidence', kind => {
    const partial = { ...receipt(), outcome: 'provider_written' as const, completedAt: 2, etag: '"partial"' };
    const before = writeOutboundJournal(OWNER, { ...journal(), receipts: [partial] }, null);
    const next = readOutboundJournal(OWNER).journal;
    next.receipts[0].outcome = kind === 'changed-etag' ? 'written' : kind as 'not_written' | 'uncertain';
    if (kind === 'changed-etag') next.receipts[0].etag = '"different"'; else delete next.receipts[0].etag;
    expect(() => writeOutboundJournal(OWNER, next, before)).toThrow(); expect(saved()).toBe(before);
  });
});
