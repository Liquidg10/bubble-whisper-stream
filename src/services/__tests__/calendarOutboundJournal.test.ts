import { beforeEach, describe, expect, it } from 'vitest';
import { calendarOutboundJournalKey, outboundHeld, readOutboundJournal, writeOutboundJournal } from '../calendarOutboundJournal';
const owner = '11111111-1111-4111-8111-111111111111';
const account = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const pending = () => ({ operationId, taskId: 'saved-task', calendarAccountId: account, eventId: 'event-1', createdAt: 1, outcome: 'pending' as const });
const journal = () => ({ version: 1 as const, ownerUserId: owner, receipts: [pending()] });
describe('versioned outbound update journal', () => {
  beforeEach(() => localStorage.clear());
  it('starts empty and roundtrips only locators and minimal outcomes', () => {
    expect(readOutboundJournal(owner).journal.receipts).toEqual([]);
    const serialized = writeOutboundJournal(owner, journal(), null);
    expect(readOutboundJournal(owner)).toEqual({ snapshot: serialized, journal: journal() });
    expect(outboundHeld(journal(), account, 'event-1')).toBe(true);
    expect(outboundHeld(journal(), account, 'other')).toBe(false);
  });
  it.each(['wrong-owner', 'invalid-json', 'wrong-version', 'unknown-key', 'duplicate', 'bad-id', 'bad-time', 'pending-completed', 'written-no-etag', 'oversized', 'capacity'])('rejects %s without resetting state', kind => {
    const value = journal() as unknown as { version: unknown; ownerUserId: string; receipts: Record<string, unknown>[]; extra?: boolean };
    if (kind === 'wrong-owner') value.ownerUserId = account;
    if (kind === 'wrong-version') value.version = 2;
    if (kind === 'unknown-key') value.extra = true;
    if (kind === 'duplicate') value.receipts.push(pending());
    if (kind === 'bad-id') value.receipts[0].operationId = 'invalid';
    if (kind === 'bad-time') value.receipts[0].createdAt = -1;
    if (kind === 'pending-completed') value.receipts[0].completedAt = 2;
    if (kind === 'written-no-etag') Object.assign(value.receipts[0], { outcome: 'written', completedAt: 2 });
    if (kind === 'capacity') value.receipts = Array.from({ length: 1001 }, pending);
    const raw = kind === 'invalid-json' ? '{bad' : kind === 'oversized' ? ' '.repeat(1024 * 1024 + 1) : JSON.stringify(value);
    localStorage.setItem(calendarOutboundJournalKey(owner), raw);
    expect(() => readOutboundJournal(owner)).toThrow();
    expect(localStorage.getItem(calendarOutboundJournalKey(owner))).toBe(raw);
  });
  it.each(['written', 'not_written', 'provider_written', 'uncertain'] as const)('only known conclusive %s outcomes release a hold', outcome => {
    const value = { ...journal(), receipts: [{ ...pending(), outcome, completedAt: 2, ...(['written', 'provider_written'].includes(outcome) ? { etag: '"new"' } : {}) }] };
    writeOutboundJournal(owner, value, null);
    expect(outboundHeld(readOutboundJournal(owner).journal, account, 'event-1')).toBe(!['written', 'not_written'].includes(outcome));
  });
  it('refuses to overwrite intervening persisted state', () => {
    const saved = writeOutboundJournal(owner, journal(), null);
    expect(() => writeOutboundJournal(owner, { version: 1, ownerUserId: owner, receipts: [] }, null)).toThrow();
    expect(localStorage.getItem(calendarOutboundJournalKey(owner))).toBe(saved);
  });
  it.each(['etag', 'completedAt'])('requires own %s on completed receipts even with inherited data', field => {
    const receipt: Record<string, unknown> = { ...pending(), outcome: 'written', completedAt: 2, etag: '"new"' };
    delete receipt[field];
    localStorage.setItem(calendarOutboundJournalKey(owner), JSON.stringify({ ...journal(), receipts: [receipt] }));
    const old = Object.getOwnPropertyDescriptor(Object.prototype, field);
    Object.defineProperty(Object.prototype, field, { configurable: true, value: field === 'etag' ? '"inherited"' : 2 });
    try { expect(() => readOutboundJournal(owner)).toThrow(); }
    finally { if (old) Object.defineProperty(Object.prototype, field, old); else Reflect.deleteProperty(Object.prototype, field); }
  });
  it.each(['not_written', 'uncertain'])('rejects unexpected provider ETags on %s receipts', outcome => {
    localStorage.setItem(calendarOutboundJournalKey(owner), JSON.stringify({ ...journal(), receipts: [{ ...pending(), outcome, completedAt: 2, etag: '"new"' }] }));
    expect(() => readOutboundJournal(owner)).toThrow();
  });
});
