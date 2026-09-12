import { canonicalJson, quoteLiteral } from './supabase-isolation.mjs';
import { scopeSqlPredicate } from './migration-subject-scope.mjs';

// This is a closed allowlist, not permission to copy arbitrary private schemas.
export const CALENDAR_LEDGER = 'mind_manual_calendar.operations';
const HASH = /^[a-f0-9]{64}$/u;
const FIELDS = ['relation', 'copyMode', 'totalRowCount', 'copyRowCount',
  'totalRowsSha256', 'copyRowsSha256', 'unownedRowCount', 'unapprovedRowCount',
  'unresolvedOperationCount'];

export function validatePrivateCalendarInventory(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Private Calendar ledger inventory is missing or duplicated');
  const row = rows[0];
  if (!row || canonicalJson(Object.keys(row).sort()) !== canonicalJson([...FIELDS].sort()) ||
      row.relation !== CALENDAR_LEDGER || row.copyMode !== 'copy' ||
      !['totalRowCount', 'copyRowCount', 'unownedRowCount', 'unapprovedRowCount', 'unresolvedOperationCount']
        .every(key => Number.isSafeInteger(row[key]) && row[key] >= 0) ||
      !HASH.test(row.totalRowsSha256) || !HASH.test(row.copyRowsSha256) ||
      row.copyRowCount > row.totalRowCount || row.unresolvedOperationCount > row.totalRowCount) {
    throw new Error('Private Calendar ledger inventory is invalid');
  }
  return row;
}

export function privateCalendarInventorySql(scope, kind = 'source') {
  if (!['source', 'target'].includes(kind)) throw new Error('Invalid Calendar inventory kind');
  const selected = scopeSqlPredicate(scope, 'r.owner_user_id');
  const inventoried = kind === 'source' ? selected : 'true';
  const digest = condition => `encode(extensions.digest(convert_to(COALESCE(string_agg(to_jsonb(r)::text, E'\\n' ORDER BY to_jsonb(r)::text) FILTER (WHERE ${condition}), ''), 'UTF8'), 'sha256'), 'hex')`;
  // Missing schema/table is an error, never an empty ledger. Preserve every
  // original field including claim nonce, identity, timestamps and outcomes.
  return `BEGIN READ ONLY; SET LOCAL ROLE postgres;
SELECT jsonb_build_array(jsonb_build_object(
  'relation', ${quoteLiteral(CALENDAR_LEDGER)}, 'copyMode', 'copy',
  'totalRowCount', count(*) FILTER (WHERE ${inventoried}),
  'copyRowCount', count(*) FILTER (WHERE ${inventoried}),
  'totalRowsSha256', ${digest(inventoried)}, 'copyRowsSha256', ${digest(inventoried)},
  'unownedRowCount', count(*) FILTER (WHERE ${inventoried} AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.owner_user_id)),
  'unapprovedRowCount', count(*) FILTER (WHERE ${inventoried} AND NOT ${selected}),
  'unresolvedOperationCount', count(*) FILTER (WHERE ${inventoried} AND r.state NOT IN ('written', 'not_written'))
))::text FROM ${CALENDAR_LEDGER} r;
COMMIT;`;
}

export function privateCalendarBlockers(rows) {
  let row;
  try { row = validatePrivateCalendarInventory(rows); }
  catch { return ['private Calendar ledger inventory is missing or invalid']; }
  return [
    ...(row.unownedRowCount ? ['private Calendar ledger has historical operations without a current Auth owner; an explicit disposition is required'] : []),
    ...(row.unapprovedRowCount ? ['private Calendar ledger contains operations outside approved subject scope'] : []),
    ...(row.unresolvedOperationCount ? ['private Calendar ledger has unresolved original provider operations; migration cannot infer completion or original lease attribution'] : []),
  ];
}

export function privateCalendarExportEntry(receipt, scope) {
  const row = validatePrivateCalendarInventory(receipt.privateData);
  return {
    logicalName: CALENDAR_LEDGER,
    relativePath: `data/${CALENDAR_LEDGER}.bin`,
    expectedRows: row.copyRowCount,
    query: `SELECT * FROM ${CALENDAR_LEDGER} WHERE ${scopeSqlPredicate(scope, 'owner_user_id')} ORDER BY owner_user_id, operation_id`,
    sourceRowsSha256: row.copyRowsSha256,
    copyMode: 'copy',
    containsCredentials: true, // claim_token is a server-only completion capability.
  };
}

export function privateCalendarCopyGuardSql(receipt) {
  const row = validatePrivateCalendarInventory(receipt.privateData);
  return `DO $calendar_copy$ BEGIN
  IF (SELECT count(*) FROM ${CALENDAR_LEDGER}) <> ${row.copyRowCount}
     OR (SELECT encode(extensions.digest(convert_to(COALESCE(string_agg(to_jsonb(r)::text, E'\\n' ORDER BY to_jsonb(r)::text), ''), 'UTF8'), 'sha256'), 'hex') FROM ${CALENDAR_LEDGER} r) <> ${quoteLiteral(row.copyRowsSha256)}
     OR EXISTS (SELECT 1 FROM ${CALENDAR_LEDGER} r WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.owner_user_id)) THEN
    RAISE EXCEPTION 'Private Calendar transactional copy parity failed' USING ERRCODE='55000';
  END IF;
END $calendar_copy$;`;
}

export function assertPrivateCalendarParity(actual, expected) {
  validatePrivateCalendarInventory(actual.privateData);
  validatePrivateCalendarInventory(expected.privateData);
  if (canonicalJson(actual.privateData) !== canonicalJson(expected.privateData)) {
    throw new Error('Private Calendar ledger changed from the reviewed source');
  }
}
