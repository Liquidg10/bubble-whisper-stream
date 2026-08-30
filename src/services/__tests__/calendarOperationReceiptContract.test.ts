import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarOperationDigests, calendarOperationAfterDigest, calendarOperationIdentity,
  equalCalendarOperationIdentity, parseCalendarOperationIdentity, parseCalendarOperationRequest,
  parseCalendarOperationResponse, parseCalendarOperationStoredRecord, parseCalendarOperationResult,
  type CalendarOperationIdentity, type CalendarOperationIntent,
} from '../../../supabase/functions/_shared/calendarOperationReceiptContract';

const owner = '10000000-0000-4000-8000-000000000001';
const fields = { title: 'Review', description: '', location: '', startTime: '2026-08-30T12:00:00.000Z',
  endTime: '2026-08-30T13:00:00.000Z', startTz: 'Pacific/Honolulu', endTz: 'Pacific/Honolulu' };
const intent: CalendarOperationIntent = { operationId: '20000000-0000-4000-8000-000000000002', taskId: 'task-1',
  calendarAccountId: '30000000-0000-4000-8000-000000000003', eventId: 'event-1',
  googleCalendarId: 'fixture@example.invalid', expectedEtag: '"before"', before: fields, after: { ...fields, title: 'Reviewed' } };
const identity: CalendarOperationIdentity = { operationId: intent.operationId, taskId: intent.taskId,
  calendarAccountId: intent.calendarAccountId, eventId: intent.eventId, googleCalendarId: intent.googleCalendarId,
  expectedEtag: intent.expectedEtag, requestDigest: 'a'.repeat(64), afterDigest: 'b'.repeat(64) };
const written = { outcome: 'written', etag: '"after"', cacheUpdated: true };
const recorded = () => ({ version: 2, outcome: 'recorded', ...identity, completedAt: 10, result: written });
const prepare = () => ({ version: 2, action: 'prepare_reviewed_update', operationId: intent.operationId,
  taskId: intent.taskId, calendarAccountId: intent.calendarAccountId, eventId: intent.eventId });
const confirm = () => ({ version: 2, action: 'confirm_reviewed_update', ...identity, before: intent.before, after: intent.after });
const read = () => ({ version: 2, action: 'read_reviewed_update_receipt', ...identity });

describe('exact operation-bound Calendar receipt contract', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());

  it('uses stable, field-ordered digests without persisting Calendar text', async () => {
    const first = await calendarOperationDigests(owner, intent);
    const reordered = { ...intent, before: { ...intent.before, title: intent.before.title } };
    expect(await calendarOperationDigests(owner, reordered)).toEqual(first);
    expect(first.requestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.afterDigest).toBe(await calendarOperationAfterDigest(intent.after));
    expect(first.requestDigest).not.toBe(first.afterDigest);
    expect(JSON.stringify(first)).not.toContain('Reviewed');
    expect(await calendarOperationDigests('40000000-0000-4000-8000-000000000004', intent)).not.toEqual(first);
  });
  for (const key of ['operationId','taskId','calendarAccountId','eventId','googleCalendarId','expectedEtag'] as const) {
    it(`binds ${key} into immutable intent`, async () => {
      const replacements = { operationId: '40000000-0000-4000-8000-000000000004', taskId: 'task-2',
        calendarAccountId: '50000000-0000-4000-8000-000000000005', eventId: 'event-2', googleCalendarId: 'other@example.invalid', expectedEtag: '"other"' };
      const changed = await calendarOperationDigests(owner, { ...intent, [key]: replacements[key] });
      const original = await calendarOperationDigests(owner, intent);
      expect(changed.requestDigest).not.toBe(original.requestDigest);
      expect(changed.afterDigest).toBe(original.afterDigest);
    });
  }
  for (const side of ['before', 'after'] as const) {
    for (const [key, value] of Object.entries({ title: 'Different', description: 'Different', location: 'Different',
      startTime: '2026-08-30T12:30:00.000Z', endTime: '2026-08-30T13:30:00.000Z', startTz: 'UTC', endTz: 'UTC' })) {
      it(`binds ${side}.${key} exactly`, async () => {
        const first = await calendarOperationDigests(owner, intent);
        const next = await calendarOperationDigests(owner, { ...intent, [side]: { ...intent[side], [key]: value } });
        expect(next.requestDigest).not.toBe(first.requestDigest);
        if (side === 'after') expect(next.afterDigest).not.toBe(first.afterDigest);
        else expect(next.afterDigest).toBe(first.afterDigest);
      });
    }
  }
  it('rejects invalid digest inputs instead of inventing a default', async () => {
    await expect(calendarOperationDigests('invalid', intent)).rejects.toThrow('Invalid Calendar intent');
    await expect(calendarOperationDigests(owner, { ...intent, googleCalendarId: 'primary' })).rejects.toThrow();
    await expect(calendarOperationAfterDigest({ ...fields, title: '' })).rejects.toThrow();
  });
  it('freezes both digest encodings before awaiting crypto', async () => {
    const expected = await calendarOperationDigests(owner, intent);
    const mutable = structuredClone(intent);
    let release!: () => void;
    const pause = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    vi.stubGlobal('crypto', { subtle: { digest: async (algorithm: AlgorithmIdentifier, bytes: BufferSource) => {
      if (++calls === 1) await pause;
      return webcrypto.subtle.digest(algorithm, bytes);
    } } });
    const pending = calendarOperationDigests(owner, mutable);
    mutable.after.title = 'Changed during asynchronous hashing';
    mutable.before.title = 'Also changed';
    mutable.googleCalendarId = 'changed@example.invalid';
    release();
    expect(await pending).toEqual(expected);
  });
  it('accepts only the exact prepare/confirm/lookup request shape', () => {
    for (const request of [prepare(), confirm(), read()]) expect(parseCalendarOperationRequest(request)).toEqual(request);
    expect(parseCalendarOperationRequest({ ...confirm(), version: 1 })).toBeNull();
    expect(parseCalendarOperationRequest({ ...read(), before: fields })).toBeNull();
    expect(parseCalendarOperationRequest({ ...prepare(), action: 'update' })).toBeNull();
  });
  for (const key of Object.keys(identity)) {
    it(`rejects missing or inherited ${key}`, () => {
      const partial: Record<string, unknown> = { ...identity }; delete partial[key];
      expect(parseCalendarOperationIdentity(partial)).toBeNull();
      expect(parseCalendarOperationIdentity(Object.assign(Object.create({ [key]: identity[key as keyof typeof identity] }), partial))).toBeNull();
      const malformed: Record<string, unknown> = { ...confirm() }; delete malformed[key];
      expect(parseCalendarOperationRequest(malformed)).toBeNull();
      expect(equalCalendarOperationIdentity(identity, { ...identity, [key]: 'different' })).toBe(false);
    });
  }
  for (const [key, value] of [
    ['requestDigest', 'A'.repeat(64)], ['afterDigest', 'a'.repeat(63)], ['expectedEtag', 'unquoted'],
    ['googleCalendarId', 'primary'], ['googleCalendarId', '*'], ['googleCalendarId', 'white space'],
    ['googleCalendarId', 'bad\n'], ['googleCalendarId', 'x'.repeat(1025)], ['taskId', '../private'],
    ['eventId', ''], ['operationId', '00000000-0000-0000-0000-000000000000'],
    ['eventId', 'event\n'], ['taskId', 'task\n'], ['requestDigest', 'a'.repeat(64) + '\n'],
    ['expectedEtag', '"etag"\n'], ['calendarAccountId', identity.calendarAccountId + '\n'],
  ]) {
    it(`rejects invalid identity ${key} ${JSON.stringify(value)}`, () => {
      expect(parseCalendarOperationIdentity({ ...identity, [key]: value })).toBeNull();
      expect(parseCalendarOperationRequest({ ...confirm(), [key]: value })).toBeNull();
      expect(parseCalendarOperationResponse({ ...recorded(), [key]: value })).toBeNull();
    });
  }
  it('selects identity without copying request fields or response metadata', () => {
    expect(calendarOperationIdentity(confirm())).toEqual(identity);
    expect(parseCalendarOperationIdentity({ ...identity, secret: 'not part of identity' })).toBeNull();
  });
  it('keeps every nonterminal observation separate from recorded completion', () => {
    const held = { version: 2, outcome: 'held', ...identity, code: 'operation_pending' };
    expect(parseCalendarOperationResponse(held)).toEqual(held);
    for (const result of [{ outcome: 'uncertain', code: 'provider_outcome_unknown' },
      { outcome: 'provider_written_cache_unknown', etag: '"after"', cacheUpdated: false }]) {
      expect(parseCalendarOperationResult(result, identity.expectedEtag)).toEqual(result);
      expect(parseCalendarOperationResponse({ ...recorded(), result })).toBeNull();
    }
    expect(parseCalendarOperationResponse({ ...recorded(), result: { outcome: 'not_written', code: 'provider_outcome_unknown' } })).toBeNull();
    expect(parseCalendarOperationResponse({ ...held, code: 'current_values_match' })).toBeNull();
  });
  it('accepts only recognized exact terminal evidence', () => {
    expect(parseCalendarOperationResponse(recorded())).toEqual(recorded());
    expect(parseCalendarOperationResponse({ ...recorded(), result: { outcome: 'not_written', code: 'stale_review' } })).not.toBeNull();
    for (const result of [{ ...written, cacheUpdated: false }, { ...written, etag: identity.expectedEtag },
      { ...written, fields }, { outcome: 'not_written', code: 'stale_review', extra: true }])
      expect(parseCalendarOperationResponse({ ...recorded(), result })).toBeNull();
    for (const completedAt of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null])
      expect(parseCalendarOperationResponse({ ...recorded(), completedAt })).toBeNull();
  });
  it('validates preview while never treating unavailability as not-written evidence', () => {
    const ready = { version: 2, outcome: 'ready', operationId: intent.operationId, taskId: intent.taskId,
      calendarAccountId: intent.calendarAccountId, eventId: intent.eventId,
      googleCalendarId: intent.googleCalendarId, expectedEtag: intent.expectedEtag, before: fields };
    expect(parseCalendarOperationResponse(ready)).toEqual(ready);
    expect(parseCalendarOperationResponse({ ...prepare(), action: undefined, outcome: 'unavailable', code: 'disabled' })).toBeNull();
    const { action: _action, ...base } = prepare();
    expect(parseCalendarOperationResponse({ ...base, outcome: 'unavailable', code: 'disabled' })?.outcome).toBe('unavailable');
  });
  it('checks owner and stored state/result consistency', () => {
    const pending = { ownerUserId: owner, identity, state: 'pending', completedAt: null, result: null };
    expect(parseCalendarOperationStoredRecord(pending, owner)).toEqual(pending);
    const stored = { ...pending, state: 'written', completedAt: 10, result: written };
    expect(parseCalendarOperationStoredRecord(stored, owner)).toEqual(stored);
    expect(parseCalendarOperationStoredRecord(stored, '40000000-0000-4000-8000-000000000004')).toBeNull();
    for (const change of [{ state: 'pending' }, { completedAt: null }, { claimToken: 'private' },
      { result: { ...written, cacheUpdated: false } }]) expect(parseCalendarOperationStoredRecord({ ...stored, ...change }, owner)).toBeNull();
    const partial = { ...stored, state: 'provider_written', result: { outcome: 'provider_written_cache_unknown', etag: '"after"', cacheUpdated: false } };
    expect(parseCalendarOperationStoredRecord(partial, owner)).toEqual(partial);
  });
});
