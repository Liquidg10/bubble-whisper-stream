import { describe, expect, it, vi } from 'vitest';
import { taskToBubble } from '@/adapters/taskAdapter';
import type { Task } from '@/types/task';
import { findOutboundTaskCandidate } from '../calendarOutboundTaskEvidence';

vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER_OWNER = '10000000-0000-4000-8000-000000000002';
const ACCOUNT = '20000000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT = '20000000-0000-4000-8000-000000000002';
const REFERENCE = { taskId: 'task-one', calendarAccountId: ACCOUNT, eventId: 'event-one' };
type Raw = Record<string, unknown>;

function bubble(overrides: Partial<Task> = {}): Raw {
  const task: Task = {
    id: 'task-one', type: 'event', title: 'Revised meeting', description: 'Reviewed description',
    completed: false, priority: 50, tags: [], createdAt: 1000, updatedAt: 2000,
    view: { calendar: {
      startTime: '2030-01-01T10:00:00.000Z', durationMin: 90, location: 'Room A', calendarId: ACCOUNT,
    } },
    metadata: { userId: OWNER, calendarImport: { calendarAccountId: ACCOUNT, eventId: 'event-one' } },
    ...overrides,
  };
  // Persisted JSON-shaped fixture also separates adapter's shared references.
  return JSON.parse(JSON.stringify(taskToBubble(task))) as Raw;
}

function parent(row: Raw, path: string): { target: Raw; key: string } {
  const parts = path.split('.');
  const key = parts.pop()!;
  let target = row;
  for (const part of parts) target = target[part] as Raw;
  return { target, key };
}

function set(row: Raw, path: string, value: unknown): void {
  const { target, key } = parent(row, path);
  target[key] = value;
}

function remove(row: Raw, path: string): void {
  const { target, key } = parent(row, path);
  delete target[key];
}

function calendar(row: Raw, field: string, value: unknown): void {
  set(row, `metadata.calendar.${field}`, value);
  set(row, `metadata.canonicalTask.view.calendar.${field}`, value);
}

const inspect = (rows: unknown[], reference = REFERENCE) => findOutboundTaskCandidate(rows, OWNER, reference);

describe('strict durable Calendar outbound task evidence', () => {
  it('returns only the complete reviewed field set from a persisted Task adapter fixture', () => {
    const result = inspect([bubble()]);
    expect(result).toMatchObject({ taskId: 'task-one', fields: {
      title: 'Revised meeting', description: 'Reviewed description', location: 'Room A',
      startTime: '2030-01-01T10:00:00.000Z', endTime: '2030-01-01T11:30:00.000Z',
    } });
    expect(Object.keys(result!).sort()).toEqual(['fields', 'fingerprint', 'taskId']);
    expect(Object.keys(result!.fields).sort()).toEqual(['description', 'endTime', 'location', 'startTime', 'title']);
  });

  it('accepts task edits without requiring old provider contents', () => {
    const row = bubble({ title: 'User changed title', description: 'New description' });
    calendar(row, 'location', 'New room');
    calendar(row, 'startTime', '2031-06-30T14:00:00-10:00');
    calendar(row, 'durationMin', 30);
    expect(inspect([row])?.fields).toEqual({
      title: 'User changed title', description: 'New description', location: 'New room',
      startTime: '2031-07-01T00:00:00.000Z', endTime: '2031-07-01T00:30:00.000Z',
    });
  });

  it('does not mutate evidence or return unrelated private metadata', () => {
    const row = bubble();
    set(row, 'metadata.privateNote', 'DO NOT RETURN');
    const before = JSON.stringify(row);
    const result = inspect([row]);
    expect(JSON.stringify(row)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('DO NOT RETURN');
  });

  it('does not read or serialize unrelated cyclic or accessor metadata', () => {
    const row = bubble();
    set(row, 'metadata.unrelated', row);
    Object.defineProperty(row.metadata, 'privateNote', { get() { throw new Error('Private'); } });
    expect(inspect([row])?.taskId).toBe('task-one');
  });

  it('has stable fixed-order fingerprints regardless of record key insertion order', () => {
    const row = bubble();
    const reordered = { ...row, metadata: {
      ...(row.metadata as Raw), calendar: {
        calendarId: ACCOUNT, durationMin: 90, location: 'Room A', startTime: '2030-01-01T10:00:00.000Z',
      },
    } };
    expect(inspect([row])?.fingerprint).toBe(inspect([reordered])?.fingerprint);
  });

  it.each([
    ['title', (row: Raw) => set(row, 'content', 'Different title')],
    ['description', (row: Raw) => set(row, 'caption', 'Different description')],
    ['location', (row: Raw) => calendar(row, 'location', 'Different location')],
    ['start time', (row: Raw) => calendar(row, 'startTime', '2030-01-01T12:00:00.000Z')],
    ['end time', (row: Raw) => calendar(row, 'durationMin', 45)],
    ['creation timestamp', (row: Raw) => set(row, 'createdAt', 999)],
    ['revision timestamp', (row: Raw) => set(row, 'updatedAt', 2001)],
  ])('invalidates the fingerprint when %s changes', (_name, mutate) => {
    const first = inspect([bubble()])!;
    const changed = bubble();
    mutate(changed);
    const second = inspect([changed]);
    expect(second).not.toBeNull();
    expect(second!.fingerprint).not.toBe(first.fingerprint);
  });

  it('normalizes sent timestamps while retaining exact persisted format in the fingerprint', () => {
    const first = inspect([bubble()])!;
    const row = bubble();
    calendar(row, 'startTime', '2030-01-01T00:00:00-10:00');
    const second = inspect([row])!;
    expect(second.fields).toEqual(first.fields);
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it('sends empty strings for explicitly absent optional fields without inventing fallback text', () => {
    const row = bubble({ description: undefined });
    remove(row, 'metadata.calendar.location');
    remove(row, 'metadata.canonicalTask.view.calendar.location');
    const result = inspect([row])!;
    expect(result.fields.description).toBe('');
    expect(result.fields.location).toBe('');
    const explicit = bubble({ description: '' });
    calendar(explicit, 'location', '');
    expect(inspect([explicit])!.fields).toEqual(result.fields);
    expect(inspect([explicit])!.fingerprint).not.toBe(result.fingerprint);
  });

  it('accepts exactly 4096 characters without silently truncating sent fields', () => {
    const row = bubble({ title: 'T'.repeat(4096), description: 'D'.repeat(4096) });
    calendar(row, 'location', 'L'.repeat(4096));
    const result = inspect([row])!;
    expect(result.fields.title).toHaveLength(4096);
    expect(result.fields.description).toHaveLength(4096);
    expect(result.fields.location).toHaveLength(4096);
  });

  it.each([
    ['2030-01-01T10:00:00Z', '2030-01-01T10:00:00.000Z'],
    ['2030-01-01T10:00:00.1+05:30', '2030-01-01T04:30:00.100Z'],
    ['2030-01-01T10:00:00.12+00:00', '2030-01-01T10:00:00.120Z'],
    ['2032-02-29T23:59:59.123-10:00', '2032-03-01T09:59:59.123Z'],
    ['2000-02-29T10:00:00.000Z', '2000-02-29T10:00:00.000Z'],
  ])('accepts and normalizes an explicit offset timestamp %s', (start, expected) => {
    const row = bubble();
    calendar(row, 'startTime', start);
    expect(inspect([row])?.fields.startTime).toBe(expected);
  });

  it.each([0.5, 1 / 60, 90.25, 1440])('accepts an exact positive duration of %s minutes within 24 hours', duration => {
    const row = bubble();
    calendar(row, 'durationMin', duration);
    const result = inspect([row])!;
    expect(Date.parse(result.fields.endTime) - Date.parse(result.fields.startTime)).toBe(duration * 60_000);
  });

  it.each([
    '', 'not-a-date', '2030-01-01', '2030-01-01T10:00:00', '2030-01-01 10:00:00Z',
    '2030-01-01T10:00Z', '2030-01-01t10:00:00z', '2030-01-01T10:00:00+0530',
    '2030-01-01T10:00:00.1234Z', '2030-01-01T10:00:00-00:00', '2030-01-01T10:00:00+24:00',
    '2030-01-01T10:00:00+00:60', '2030-01-01T24:00:00Z', '2030-01-01T10:60:00Z',
    '2030-01-01T10:00:60Z', '2030-02-29T10:00:00Z', '1900-02-29T10:00:00Z',
    '2030-02-30T10:00:00Z', '2030-04-31T10:00:00Z', '2030-00-01T10:00:00Z',
    '2030-13-01T10:00:00Z', '2030-01-00T10:00:00Z', '0000-01-01T10:00:00Z',
    '+010000-01-01T10:00:00Z', '9999-12-31T23:59:00Z', null, 1893492000000,
  ])('rejects invalid, ambiguous, unsupported, or overflowing timestamp %j', start => {
    const row = bubble();
    calendar(row, 'startTime', start);
    expect(inspect([row])).toBeNull();
  });

  it.each([0, -0, -1, 1440.001, Number.NaN, Infinity, -Infinity, Number.MAX_VALUE, 0.000001, '90', null, undefined])(
    'rejects nonfinite, out-of-bound, or lossy duration %j', duration => {
      const row = bubble();
      calendar(row, 'durationMin', duration);
      expect(inspect([row])).toBeNull();
    },
  );

  it.each([
    ['content', ''], ['content', '   '], ['content', 'T'.repeat(4097)], ['content', null],
    ['caption', 'D'.repeat(4097)], ['caption', null], ['caption', 42],
    ['metadata.calendar.location', 'L'.repeat(4097)], ['metadata.calendar.location', null],
    ['metadata.canonicalTask.view.calendar.location', 'L'.repeat(4097)],
    ['createdAt', Number.NaN], ['createdAt', -1], ['updatedAt', Infinity], ['updatedAt', -1],
    ['metadata.userId', OTHER_OWNER], ['metadata.calendarImport.calendarAccountId', OTHER_ACCOUNT],
    ['metadata.calendarImport.eventId', 'other-event'], ['metadata.canonicalTask.metadata.userId', OTHER_OWNER],
    ['metadata.canonicalTask.metadata.calendarImport.calendarAccountId', OTHER_ACCOUNT],
    ['metadata.canonicalTask.metadata.calendarImport.eventId', 'other-event'],
    ['metadata.canonicalTask.schemaVersion', 2], ['metadata.canonicalTask.type', 'unsupported'],
    ['metadata.calendar.calendarId', OTHER_ACCOUNT], ['metadata.canonicalTask.view.calendar.calendarId', OTHER_ACCOUNT],
    ['metadata.canonicalTask.view.calendar.startTime', '2030-01-01T10:00:00Z'],
    ['metadata.canonicalTask.view.calendar.durationMin', 60], ['metadata.canonicalTask.view.calendar.location', 'Changed'],
  ])('rejects malformed or divergent field %s=%j', (path, value) => {
    const row = bubble();
    set(row, path, value);
    expect(inspect([row])).toBeNull();
  });

  const requiredPaths = [
    'id', 'metadata', 'content', 'createdAt', 'updatedAt', 'metadata.userId', 'metadata.calendarImport',
    'metadata.calendarImport.calendarAccountId', 'metadata.calendarImport.eventId', 'metadata.canonicalTask',
    'metadata.calendar', 'metadata.calendar.startTime', 'metadata.calendar.durationMin', 'metadata.calendar.calendarId',
    'metadata.canonicalTask.schemaVersion', 'metadata.canonicalTask.type', 'metadata.canonicalTask.metadata',
    'metadata.canonicalTask.metadata.userId', 'metadata.canonicalTask.metadata.calendarImport',
    'metadata.canonicalTask.metadata.calendarImport.calendarAccountId', 'metadata.canonicalTask.metadata.calendarImport.eventId',
    'metadata.canonicalTask.view', 'metadata.canonicalTask.view.calendar',
    'metadata.canonicalTask.view.calendar.startTime', 'metadata.canonicalTask.view.calendar.durationMin',
    'metadata.canonicalTask.view.calendar.calendarId',
  ];

  it.each(requiredPaths)('requires own persisted field %s without projection fallback', path => {
    const row = bubble();
    remove(row, path);
    expect(inspect([row])).toBeNull();
  });

  it.each([...requiredPaths, 'caption', 'metadata.calendar.location', 'metadata.canonicalTask.view.calendar.location'])(
    'rejects an accessor field %s without invoking it', path => {
      const row = bubble();
      const { target, key } = parent(row, path);
      const value = target[key];
      const getter = vi.fn(() => value);
      Object.defineProperty(target, key, { configurable: true, get: getter });
      expect(inspect([row])).toBeNull();
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it.each(['content', 'caption', 'metadata.calendar.location'])('rejects inherited %s instead of sending it', path => {
    const row = bubble();
    const { target, key } = parent(row, path);
    const prior = Object.getOwnPropertyDescriptor(Object.prototype, key);
    let result: ReturnType<typeof inspect>;
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, writable: true, value: target[key] });
      delete target[key];
      result = inspect([row]);
    } finally {
      if (prior) Object.defineProperty(Object.prototype, key, prior);
      else Reflect.deleteProperty(Object.prototype, key);
    }
    expect(result).toBeNull();
  });

  it('requires the exact referenced task without reassignment', () => {
    expect(inspect([bubble({ id: 'other-task' })])).toBeNull();
    expect(inspect([bubble()], { ...REFERENCE, taskId: 'other-task' })).toBeNull();
  });

  it('rejects duplicate task IDs even if the second row claims another owner or event', () => {
    const foreign = bubble({ metadata: { userId: OTHER_OWNER, calendarImport: {
      calendarAccountId: OTHER_ACCOUNT, eventId: 'other-event',
    } } });
    expect(inspect([bubble(), foreign])).toBeNull();
  });

  it.each([
    (row: Raw) => set(row, 'metadata.userId', OTHER_OWNER),
    (row: Raw) => remove(row, 'metadata.calendarImport'),
    (row: Raw) => set(row, 'metadata.canonicalTask.metadata.userId', OTHER_OWNER),
    (row: Raw) => remove(row, 'metadata.canonicalTask.metadata.calendarImport'),
    (row: Raw) => set(row, 'metadata.canonicalTask.schemaVersion', 2),
    (row: Raw) => set(row, 'content', 'Other contents'),
    (row: Raw) => remove(row, 'metadata.canonicalTask'),
  ])('retains ambiguity when duplicate provenance is partially malformed %#', mutate => {
    const duplicate = bubble({ id: 'other-task' });
    mutate(duplicate);
    expect(inspect([bubble(), duplicate])).toBeNull();
  });

  it('counts array-shaped malformed matching rows and provenance as duplicate evidence', () => {
    const duplicate = bubble({ id: 'other-task' });
    expect(inspect([bubble(), Object.assign([], duplicate)])).toBeNull();
    set(duplicate, 'metadata.calendarImport', Object.assign([], (duplicate.metadata as Raw).calendarImport));
    expect(inspect([bubble(), duplicate])).toBeNull();
    expect(inspect([Object.assign([], bubble())])).toBeNull();
  });

  it('ignores unrelated different-task rows without leaking their contents', () => {
    const foreign = bubble({ id: 'foreign-task', title: 'FOREIGN CONTENT', metadata: {
      userId: OTHER_OWNER, calendarImport: { calendarAccountId: OTHER_ACCOUNT, eventId: 'foreign-event' },
    } });
    const result = inspect([foreign, null, false, [], bubble()]);
    expect(result?.taskId).toBe('task-one');
    expect(JSON.stringify(result)).not.toContain('FOREIGN CONTENT');
  });

  it('does not allow an overridden array iterator to hide a duplicate provenance claim', () => {
    const row = bubble();
    const rows = [row, bubble({ id: 'other-task' })];
    Object.defineProperty(rows, Symbol.iterator, { value: function* () { yield row; } });
    expect(inspect(rows)).toBeNull();
  });

  it('rejects accessor storage slots without invoking them', () => {
    const rows = [bubble()];
    const getter = vi.fn(() => rows[0]);
    Object.defineProperty(rows, 0, { get: getter });
    expect(inspect(rows)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects non-array snapshots, missing candidates, and oversized inventories', () => {
    expect(inspect(null as unknown as unknown[])).toBeNull();
    expect(inspect({ 0: bubble(), length: 1 } as unknown as unknown[])).toBeNull();
    expect(inspect([])).toBeNull();
    const oversized = new Array(10_001);
    oversized[0] = bubble();
    expect(inspect(oversized)).toBeNull();
  });

  it.each(['', 'not-a-uuid', '00000000-0000-0000-0000-000000000000', 'AAAAAAAA-0000-4000-8000-000000000001'])(
    'rejects invalid owner %s', owner => {
      expect(findOutboundTaskCandidate([bubble()], owner, REFERENCE)).toBeNull();
    },
  );

  it.each([
    { taskId: '' }, { taskId: '../unsafe' }, { taskId: 'x'.repeat(257) },
    { calendarAccountId: 'not-a-uuid' }, { calendarAccountId: '00000000-0000-0000-0000-000000000000' },
    { eventId: '' }, { eventId: '../event' }, { eventId: 'a'.repeat(257) },
  ])('rejects invalid mapping locator %#', change => {
    expect(inspect([bubble()], { ...REFERENCE, ...change })).toBeNull();
  });

  it.each(['taskId', 'calendarAccountId', 'eventId'])('requires a direct data value for reference field %s', field => {
    const missing = { ...REFERENCE } as Raw;
    delete missing[field];
    expect(inspect([bubble()], missing as typeof REFERENCE)).toBeNull();
    const inherited = Object.assign(Object.create({ [field]: REFERENCE[field as keyof typeof REFERENCE] }), missing);
    expect(inspect([bubble()], inherited)).toBeNull();
    const accessor = { ...REFERENCE };
    const getter = vi.fn(() => REFERENCE[field as keyof typeof REFERENCE]);
    Object.defineProperty(accessor, field, { get: getter });
    expect(inspect([bubble()], accessor)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
});
