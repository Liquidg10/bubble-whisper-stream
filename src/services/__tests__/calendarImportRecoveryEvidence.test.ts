import { describe, expect, it } from 'vitest';
import { findRecoveryCandidate, type RecoveryEvent } from '../calendarImportRecoveryEvidence';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER_OWNER = '10000000-0000-4000-8000-000000000002';
const ACCOUNT = '20000000-0000-4000-8000-000000000001';
const OTHER_ACCOUNT = '20000000-0000-4000-8000-000000000002';

function event(overrides: Partial<RecoveryEvent> = {}): RecoveryEvent {
  return {
    user_id: OWNER, calendar_account_id: ACCOUNT, external_event_id: 'event-one', title: 'Owned meeting',
    start_time: '2030-01-01T10:00:00.000Z', end_time: '2030-01-01T11:30:00.000Z',
    description: 'Exact event description', location: 'Room A', ...overrides,
  };
}

function bubble(source = event(), id = 'task-one') {
  const provenance = { calendarAccountId: source.calendar_account_id, eventId: source.external_event_id };
  const calendar = {
    startTime: source.start_time, durationMin: (Date.parse(source.end_time) - Date.parse(source.start_time)) / 60000,
    location: source.location ?? undefined, calendarId: source.calendar_account_id,
  };
  return {
    id, type: 'Task', content: source.title, caption: source.description ?? undefined,
    createdAt: 1000, updatedAt: 2000, completed: false, tags: [], x: 0, y: 0, size: 0.5,
    metadata: {
      userId: source.user_id, calendarImport: { ...provenance }, calendar: { ...calendar },
      canonicalTask: {
        schemaVersion: 1, type: 'event', completed: false, view: { calendar: { ...calendar } },
        metadata: { userId: source.user_id, calendarImport: { ...provenance } },
      },
    },
  };
}

type TestBubble = ReturnType<typeof bubble>;
const inspect = (rows: unknown[], source = event()) => findRecoveryCandidate(rows, OWNER, source);

describe('pure Calendar import recovery evidence', () => {
  it('returns the exact unique owned candidate without returning private metadata', () => {
    const row = bubble();
    Object.assign(row.metadata, { unrelatedSecret: 'DO NOT RETURN' });
    const result = inspect([row]);
    expect(result).toMatchObject({ taskId: 'task-one', taskTitle: 'Owned meeting' });
    expect(Object.keys(result!).sort()).toEqual(['fingerprint', 'taskId', 'taskTitle']);
    expect(result!.fingerprint).not.toContain('DO NOT RETURN');
  });

  it('does not mutate the source rows', () => {
    const row = bubble();
    const before = JSON.stringify(row);
    inspect([row]);
    expect(JSON.stringify(row)).toBe(before);
  });

  it('uses stable evidence regardless of object key insertion order', () => {
    const original = bubble();
    const reordered = { ...original, metadata: { ...original.metadata, calendar: {
      calendarId: ACCOUNT, location: 'Room A', durationMin: 90, startTime: event().start_time,
    } } };
    expect(inspect([original])!.fingerprint).toBe(inspect([reordered])!.fingerprint);
  });

  it('changes the preview fingerprint if the committed task revision changes', () => {
    const first = bubble();
    const later = { ...first, updatedAt: 2001 };
    expect(inspect([first])!.fingerprint).not.toBe(inspect([later])!.fingerprint);
  });

  it('changes the preview fingerprint if the candidate ID changes', () => {
    expect(inspect([bubble()])!.fingerprint).not.toBe(inspect([bubble(event(), 'task-two')])!.fingerprint);
  });

  it('does not serialize unrelated cyclic or accessor metadata', () => {
    const row = bubble();
    Object.assign(row.metadata, { unrelated: row });
    Object.defineProperty(row.metadata, 'privateContent', { get() { throw new Error('Must not access'); } });
    expect(inspect([row])?.taskId).toBe('task-one');
  });

  it('returns null for no matching owned durable rows', () => {
    expect(inspect([])).toBeNull();
    expect(inspect([bubble(event({ user_id: OTHER_OWNER }))])).toBeNull();
  });

  it('ignores foreign owner/account/event records without returning their contents', () => {
    const result = inspect([
      bubble(event({ user_id: OTHER_OWNER, title: 'FOREIGN OWNER' }), 'foreign-owner'),
      bubble(event({ calendar_account_id: OTHER_ACCOUNT, title: 'FOREIGN ACCOUNT' }), 'foreign-account'),
      bubble(event({ external_event_id: 'event-two', title: 'FOREIGN EVENT' }), 'foreign-event'),
      null, false, ['malformed'], bubble(),
    ]);
    expect(result?.taskId).toBe('task-one');
    expect(result?.fingerprint).not.toMatch(/FOREIGN/);
  });

  it('rejects two matching rows even when their task IDs are identical', () => {
    expect(inspect([bubble(), bubble(event(), 'task-two')])).toBeNull();
    expect(inspect([bubble(), bubble()])).toBeNull();
  });

  it('counts array-shaped malformed matching rows and metadata as ambiguous claims', () => {
    const row = bubble();
    const arrayRow = Object.assign([], row);
    const arrayMetadata = { ...row, metadata: Object.assign([], row.metadata) };
    expect(inspect([bubble(), arrayRow])).toBeNull();
    expect(inspect([bubble(), arrayMetadata])).toBeNull();
    expect(inspect([arrayRow])).toBeNull();
    expect(inspect([arrayMetadata])).toBeNull();
  });

  it('counts malformed matching provenance even when both direct and envelope records are arrays', () => {
    const row = bubble();
    const direct = { ...row.metadata, calendarImport: Object.assign([], row.metadata.calendarImport) };
    const envelopeMetadata = {
      ...row.metadata.canonicalTask.metadata,
      calendarImport: Object.assign([], row.metadata.canonicalTask.metadata.calendarImport),
    };
    const malformed = { ...row, metadata: {
      ...direct, canonicalTask: { ...row.metadata.canonicalTask, metadata: envelopeMetadata },
    } };
    expect(inspect([bubble(), malformed])).toBeNull();
    expect(inspect([malformed])).toBeNull();
  });

  it.each([
    ['divergent direct owner', (row: TestBubble) => { row.metadata.userId = OTHER_OWNER; }],
    ['divergent direct account', (row: TestBubble) => { row.metadata.calendarImport.calendarAccountId = OTHER_ACCOUNT; }],
    ['divergent direct event', (row: TestBubble) => { row.metadata.calendarImport.eventId = 'other-event'; }],
    ['missing direct provenance', (row: TestBubble) => { delete row.metadata.calendarImport; }],
    ['divergent envelope owner', (row: TestBubble) => { row.metadata.canonicalTask.metadata.userId = OTHER_OWNER; }],
    ['divergent envelope account', (row: TestBubble) => { row.metadata.canonicalTask.metadata.calendarImport.calendarAccountId = OTHER_ACCOUNT; }],
    ['divergent envelope event', (row: TestBubble) => { row.metadata.canonicalTask.metadata.calendarImport.eventId = 'other-event'; }],
    ['missing envelope provenance', (row: TestBubble) => { delete row.metadata.canonicalTask.metadata.calendarImport; }],
    ['unknown envelope version', (row: TestBubble) => { row.metadata.canonicalTask.schemaVersion = 2; }],
    ['missing canonical envelope', (row: TestBubble) => { delete row.metadata.canonicalTask; }],
    ['invalid task ID', (row: TestBubble) => { row.id = '../unsafe'; }],
    ['mismatched direct title', (row: TestBubble) => { row.content = 'Changed'; }],
  ])('counts malformed %s as ambiguous instead of hiding the duplicate', (_name, mutate) => {
    const malformed = bubble(event(), 'malformed-duplicate');
    mutate(malformed);
    expect(inspect([bubble(), malformed])).toBeNull();
    expect(inspect([malformed])).toBeNull();
  });

  it.each([
    ['missing direct calendar', (row: TestBubble) => { delete row.metadata.calendar; }],
    ['missing envelope calendar', (row: TestBubble) => { delete row.metadata.canonicalTask.view.calendar; }],
    ['direct start', (row: TestBubble) => { row.metadata.calendar.startTime = '2030-01-01T12:00:00.000Z'; }],
    ['direct duration', (row: TestBubble) => { row.metadata.calendar.durationMin = 45; }],
    ['direct account ID', (row: TestBubble) => { row.metadata.calendar.calendarId = OTHER_ACCOUNT; }],
    ['direct location', (row: TestBubble) => { row.metadata.calendar.location = 'Changed room'; }],
    ['envelope start', (row: TestBubble) => { row.metadata.canonicalTask.view.calendar.startTime = '2030-01-01T12:00:00.000Z'; }],
    ['envelope duration', (row: TestBubble) => { row.metadata.canonicalTask.view.calendar.durationMin = 45; }],
    ['envelope location', (row: TestBubble) => { row.metadata.canonicalTask.view.calendar.location = 'Changed room'; }],
    ['envelope account ID', (row: TestBubble) => { row.metadata.canonicalTask.view.calendar.calendarId = OTHER_ACCOUNT; }],
    ['description', (row: TestBubble) => { row.caption = 'Changed description'; }],
    ['unrecognized type', (row: TestBubble) => { row.metadata.canonicalTask.type = 'unknown'; }],
    ['invalid creation timestamp', (row: TestBubble) => { row.createdAt = Number.NaN; }],
    ['invalid revision timestamp', (row: TestBubble) => { row.updatedAt = Number.POSITIVE_INFINITY; }],
    ['negative revision timestamp', (row: TestBubble) => { row.updatedAt = -1; }],
  ])('rejects a candidate with %s without using projection fallback', (_name, mutate) => {
    const row = bubble();
    mutate(row);
    expect(inspect([row])).toBeNull();
  });

  it('accepts absent null-event description/location and keeps absence distinct in fingerprints', () => {
    const source = event({ description: null, location: null });
    const absent = bubble(source);
    const empty = bubble(source);
    empty.caption = '';
    empty.metadata.calendar.location = '';
    empty.metadata.canonicalTask.view.calendar.location = '';
    expect(inspect([absent], source)?.taskId).toBe('task-one');
    expect(inspect([empty], source)?.taskId).toBe('task-one');
    expect(inspect([absent], source)!.fingerprint).not.toBe(inspect([empty], source)!.fingerprint);
  });

  it('accepts exact fractional durations but rejects equivalent differently formatted start strings', () => {
    const source = event({ end_time: '2030-01-01T10:00:30.000Z' });
    expect(inspect([bubble(source)], source)?.taskId).toBe('task-one');
    const row = bubble();
    row.metadata.calendar.startTime = '2030-01-01T10:00:00Z';
    expect(inspect([row])).toBeNull();
  });

  it.each(['', '../task', 'task/one', 'two words', '\u0000unsafe', 'a'.repeat(257)])('rejects unsafe task ID %j', id => {
    expect(inspect([bubble(event(), id)])).toBeNull();
  });

  it.each([
    { user_id: OTHER_OWNER }, { calendar_account_id: 'not-a-uuid' },
    { calendar_account_id: '00000000-0000-0000-0000-000000000000' }, { external_event_id: '../event' },
    { title: '' }, { title: '   ' }, { title: 'a'.repeat(4097) },
    { start_time: 'not-a-time' }, { end_time: 'not-a-time' },
    { end_time: '2030-01-01T10:00:00.000Z' }, { end_time: '2030-01-01T09:00:00.000Z' },
    { description: 'a'.repeat(4097) }, { location: 'a'.repeat(4097) },
  ])('rejects invalid canonical event input %#', overrides => {
    const source = event(overrides);
    expect(inspect([bubble(source)], source)).toBeNull();
  });

  it('rejects invalid owner identities', () => {
    expect(findRecoveryCandidate([bubble()], '', event())).toBeNull();
    expect(findRecoveryCandidate([bubble()], '00000000-0000-0000-0000-000000000000', event())).toBeNull();
    const uppercaseOwner = 'AAAAAAAA-0000-4000-8000-000000000001';
    const source = event({ user_id: uppercaseOwner });
    expect(findRecoveryCandidate([bubble(source)], uppercaseOwner, source)).toBeNull();
  });

  it('does not use inherited owner/provenance to adopt legacy rows', () => {
    const row = bubble();
    Object.setPrototypeOf(row.metadata, { userId: OWNER, calendarImport: row.metadata.calendarImport });
    delete row.metadata.userId;
    delete row.metadata.calendarImport;
    expect(inspect([row])).toBeNull();
  });

  it('fails closed for accessor-shaped malformed evidence', () => {
    const row = bubble();
    Object.defineProperty(row.metadata, 'calendarImport', { get() { throw new Error('Malformed'); } });
    expect(inspect([row])).toBeNull();
  });

  it.each([
    ['task ID', (row: TestBubble) => row, 'id'],
    ['task metadata', (row: TestBubble) => row, 'metadata'],
    ['task title', (row: TestBubble) => row, 'content'],
    ['creation timestamp', (row: TestBubble) => row, 'createdAt'],
    ['revision timestamp', (row: TestBubble) => row, 'updatedAt'],
    ['canonical transport', (row: TestBubble) => row.metadata, 'canonicalTask'],
    ['direct calendar', (row: TestBubble) => row.metadata, 'calendar'],
    ['canonical version', (row: TestBubble) => row.metadata.canonicalTask, 'schemaVersion'],
    ['canonical type', (row: TestBubble) => row.metadata.canonicalTask, 'type'],
    ['canonical metadata', (row: TestBubble) => row.metadata.canonicalTask, 'metadata'],
    ['canonical view', (row: TestBubble) => row.metadata.canonicalTask, 'view'],
    ['canonical calendar', (row: TestBubble) => row.metadata.canonicalTask.view, 'calendar'],
    ['direct start', (row: TestBubble) => row.metadata.calendar, 'startTime'],
    ['direct duration', (row: TestBubble) => row.metadata.calendar, 'durationMin'],
    ['direct calendar ID', (row: TestBubble) => row.metadata.calendar, 'calendarId'],
  ])('does not synthesize missing %s from Object.prototype', (_name, select, field) => {
    const row = bubble();
    const target = select(row) as Record<string, unknown>;
    const prior = Object.getOwnPropertyDescriptor(Object.prototype, field);
    let result: ReturnType<typeof inspect>;
    try {
      Object.defineProperty(Object.prototype, field, { configurable: true, writable: true, value: target[field] });
      delete target[field];
      result = inspect([row]);
    } finally {
      if (prior) Object.defineProperty(Object.prototype, field, prior);
      else Reflect.deleteProperty(Object.prototype, field);
    }
    expect(result).toBeNull();
  });

  it.each(['user_id', 'calendar_account_id', 'external_event_id', 'title', 'start_time', 'end_time', 'description', 'location'] as const)(
    'requires the event field %s to be owned rather than inherited', field => {
      const source = event();
      const row = bubble(source);
      const prior = Object.getOwnPropertyDescriptor(Object.prototype, field);
      let result: ReturnType<typeof inspect>;
      try {
        Object.defineProperty(Object.prototype, field, { configurable: true, writable: true, value: source[field] });
        delete source[field];
        result = inspect([row], source);
      } finally {
        if (prior) Object.defineProperty(Object.prototype, field, prior);
        else Reflect.deleteProperty(Object.prototype, field);
      }
      expect(result).toBeNull();
    },
  );

  it.each(['caption', 'location'] as const)('never uses inherited optional %s as matching event content', field => {
    const row = bubble();
    const target = field === 'caption' ? row : row.metadata.calendar;
    const prior = Object.getOwnPropertyDescriptor(Object.prototype, field);
    let result: ReturnType<typeof inspect>;
    try {
      Object.defineProperty(Object.prototype, field, { configurable: true, writable: true, value: target[field] });
      delete target[field];
      result = inspect([row]);
    } finally {
      if (prior) Object.defineProperty(Object.prototype, field, prior);
      else Reflect.deleteProperty(Object.prototype, field);
    }
    expect(result).toBeNull();
  });
});
