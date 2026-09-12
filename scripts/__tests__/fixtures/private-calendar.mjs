import { sha256 } from '../../lib/supabase-isolation.mjs';
export function emptyCalendarInventory() {
  return [{ relation: 'mind_manual_calendar.operations', copyMode: 'copy', totalRowCount: 0, copyRowCount: 0,
    totalRowsSha256: sha256(''), copyRowsSha256: sha256(''), unownedRowCount: 0, unapprovedRowCount: 0, unresolvedOperationCount: 0 }];
}
export const calendarFixtureSql = `CREATE SCHEMA mind_manual_calendar;
CREATE TABLE mind_manual_calendar.operations (owner_user_id uuid NOT NULL, operation_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'not_written', claim_token uuid DEFAULT gen_random_uuid(), payload text,
  PRIMARY KEY (owner_user_id, operation_id));`;
export function storageScopeFixtureSql(owner, phase = 'open') {
  if (!/^[a-f0-9-]{36}$/.test(owner) || !['open', 'fenced'].includes(phase)) throw new Error('Invalid fixture');
  return `CREATE SCHEMA mind_manual_migration;
    CREATE TABLE mind_manual_migration.control(singleton boolean PRIMARY KEY, phase text);
    INSERT INTO mind_manual_migration.control VALUES(true,'${phase}');
    CREATE TABLE mind_manual_migration.subjects(user_id uuid PRIMARY KEY);
    INSERT INTO mind_manual_migration.subjects VALUES('${owner}');
    CREATE TABLE mind_manual_migration.edge_leases(lease_id uuid PRIMARY KEY);
    CREATE TABLE mind_manual_migration.storage_scope(singleton boolean PRIMARY KEY, owner_subject_id uuid);
    INSERT INTO mind_manual_migration.storage_scope VALUES(true,'${owner}');
    CREATE TABLE mind_manual_migration.storage_legacy_assignments(bucket_id text,path_sha256 text,owner_subject_id uuid);`;
}
