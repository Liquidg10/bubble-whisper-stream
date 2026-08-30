import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { canonicalJson, repoRoot } from "../lib/supabase-isolation.mjs";
import {
  describeMigrationGuardCatalog,
  expectedMigrationGuardContract,
  migrationGuardCatalogSql,
  validateMigrationGuardCatalog,
  validateMigrationGuardCatalogBinding,
} from "../lib/migration-guard-catalog.mjs";

// A disposable Unix-socket-only local cluster. No DATABASE_URL, PG* environment,
// supplied server, or operator-provided golden reference is accepted.
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
const scopeRows = readFileSync(join(repoRoot, "supabase/isolation/mind-manual-data-scopes.tsv"), "utf8")
  .split(/\r?\n/u).filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split("\t").slice(0, 2));
const fenceSql = readFileSync(join(repoRoot, "supabase/isolation/source-write-fence.sql"), "utf8");
const storageSql = readFileSync(join(repoRoot, "supabase/isolation/storage-write-gateway.sql"), "utf8");
let pgBin;
let scratch;
let started = false;
let baseline;

function command(binary, args, options = {}) {
  const result = spawnSync(join(pgBin, binary), args, {
    encoding: "utf8", env: environment, timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function queryResult(statement, database = "postgres") {
  return command("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-h", scratch, "-p", "5432", "-U", "postgres", "-d", database], { input: statement });
}

function sql(statement, database = "postgres") {
  const result = queryResult(statement, database);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(database = "postgres", oidNoise = false) {
  sql(`${oidNoise ? "CREATE SCHEMA oid_noise; CREATE TABLE oid_noise.unrelated (id integer);" : ""}
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.identities (id uuid PRIMARY KEY, user_id uuid);
    ${scopeRows.map(([relation, owner]) => `CREATE TABLE public.${relation} (${owner} uuid, payload text);`).join("\n")}
    CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL DEFAULT false);
    CREATE TABLE storage.objects (id uuid, bucket_id text, name text);
    ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
    ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    INSERT INTO storage.buckets VALUES ('photos', false), ('voice-samples', false);
    CREATE POLICY fixture_managed_storage_access ON storage.objects TO authenticated
      USING (true) WITH CHECK (true);
  `, database);
  sql(fenceSql, database);
  sql(storageSql, database);
}

function mutatedCatalog(statement) {
  const output = sql(`BEGIN; ${statement};\n${migrationGuardCatalogSql({ transaction: false })}\nROLLBACK;`);
  return JSON.parse(output.split("\n").at(-1));
}

function rejectsMutation(statement, component) {
  const catalog = mutatedCatalog(statement);
  assert.notEqual(canonicalJson(catalog), canonicalJson(baseline), "Mutation did not change observed guard structure");
  assert.throws(() => validateMigrationGuardCatalog(catalog),
    component ? new RegExp(`reviewed reference: ${component}`, "u") : /reviewed reference/u);
}

describe("migration guard catalog — real local PostgreSQL", { concurrency: false }, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN
      ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/opt/postgresql@17/bin",
        "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin",
        ...String(process.env.PATH ?? "").split(delimiter)];
    pgBin = candidates.find((path) => ["postgres", "initdb", "pg_ctl", "psql"]
      .every((binary) => existsSync(join(path, binary))));
    assert.ok(pgBin, "Install local PostgreSQL server binaries; remote databases are forbidden.");
    scratch = mkdtempSync(join(tmpdir(), "mind-manual-guard-pg-"));
    const init = command("initdb", ["-D", join(scratch, "data"), "-U", "postgres",
      "--auth=trust", "--no-locale", "--encoding=UTF8"]);
    assert.equal(init.status, 0, init.stderr);
    const start = command("pg_ctl", ["-D", join(scratch, "data"), "-l", join(scratch, "server.log"),
      "-o", `-F -k '${scratch}' -h ''`, "-w", "start"]);
    assert.equal(start.status, 0, start.stderr + start.stdout);
    started = true;
    sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_storage_admin; CREATE ROLE catalog_test_owner;");
    fixture();
    baseline = JSON.parse(sql(migrationGuardCatalogSql()));
  });

  after(() => {
    if (started) {
      const stop = command("pg_ctl", ["-D", join(scratch, "data"), "-m", "immediate", "-w", "stop"]);
      assert.equal(stop.status, 0, stop.stderr);
    }
    // Only the exact private mkdtemp cluster created by this suite is removed.
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it("matches the fixed reviewed reference, SQL pins and hash-only receipt", () => {
    const actual = describeMigrationGuardCatalog(baseline);
    try {
      assert.deepEqual(validateMigrationGuardCatalog(baseline), actual);
      assert.deepEqual(expectedMigrationGuardContract(), actual);
      assert.deepEqual(validateMigrationGuardCatalogBinding(actual), actual);
    } catch (error) {
      // Review these deterministic hashes beside SQL changes; the test never
      // rewrites the golden or accepts this local output as a live receipt.
      assert.fail(`${error.message}\nDisposable fixture reference:\n${JSON.stringify(actual, null, 2)}`);
    }
    assert.equal(baseline.edgeFunctions.length, 34);
    assert.equal(baseline.relationScopes.length, 34);
    assert.equal(baseline.triggers.filter((trigger) => !trigger.internal).length, 102);
    assert.equal(baseline.storageGuard[0].policies.length, 3);
    assert.equal(actual.operationalRowsIncluded, false);
    assert.ok(!canonicalJson(actual).includes("CREATE FUNCTION"));
  });

  it("is deterministic across fresh databases with different object OIDs", () => {
    sql("CREATE DATABASE guard_second_fixture;");
    try {
      fixture("guard_second_fixture", true);
      const second = JSON.parse(sql(migrationGuardCatalogSql(), "guard_second_fixture"));
      assert.deepEqual(second, baseline);
      assert.deepEqual(validateMigrationGuardCatalog(second), expectedMigrationGuardContract());
    } finally {
      sql("DROP DATABASE guard_second_fixture;");
    }
  });

  it("excludes only operational subject, phase/time and unresolved lease rows", () => {
    const changed = mutatedCatalog(`
      INSERT INTO mind_manual_migration.subjects VALUES ('10000000-0000-4000-8000-000000000001');
      INSERT INTO mind_manual_migration.edge_leases VALUES ('20000000-0000-4000-8000-000000000002', 'storage-photo', now());
      UPDATE mind_manual_migration.control SET phase='draining', changed_at='2040-01-01';
    `);
    assert.deepEqual(changed, baseline);
    assert.deepEqual(validateMigrationGuardCatalog(changed), expectedMigrationGuardContract());
    assert.ok(!canonicalJson(changed).includes("10000000-0000-4000-8000-000000000001"));
  });

  it("does not mistake matching empty catalogs or a hash-only binding for installed guards", () => {
    assert.throws(() => validateMigrationGuardCatalog({}), /Invalid migration guard catalog fields/u);
    assert.throws(() => validateMigrationGuardCatalog(expectedMigrationGuardContract()), /Invalid migration guard catalog fields/u);
    const absent = structuredClone(baseline);
    absent.schema = null;
    assert.throws(() => validateMigrationGuardCatalog(absent), /Missing migration guard control schema/u);
    const result = queryResult("BEGIN; DROP SCHEMA mind_manual_migration CASCADE; " + migrationGuardCatalogSql({ transaction: false }));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not exist/u);
  });

  it("rejects missing, stale, fabricated and extra-field receipt contracts", () => {
    for (const binding of [undefined, null, {}, { ...expectedMigrationGuardContract(), extra: true }]) {
      assert.throws(() => validateMigrationGuardCatalogBinding(binding), /missing, stale or unreviewed/u);
    }
    for (const mutate of [
      (contract) => { contract.catalogSha256 = "0".repeat(64); },
      (contract) => { contract.querySha256 = "0".repeat(64); },
      (contract) => { contract.pinnedInputs["supabase/isolation/source-write-fence.sql"] = "0".repeat(64); },
      (contract) => { contract.components.triggers = "0".repeat(64); },
      (contract) => { contract.operationalRowsIncluded = true; },
    ]) {
      const binding = expectedMigrationGuardContract();
      mutate(binding);
      assert.throws(() => validateMigrationGuardCatalogBinding(binding), /missing, stale or unreviewed/u);
    }
  });

  const structuralMutations = [
    ["disabled guard trigger", "ALTER TABLE public.ai_conversations DISABLE TRIGGER mind_manual_subject_write_fence", "triggers"],
    ["replica-only guard trigger", "ALTER TABLE public.ai_conversations ENABLE REPLICA TRIGGER mind_manual_subject_write_fence", "triggers"],
    ["ordinary-only guard trigger", "ALTER TABLE public.ai_conversations ENABLE TRIGGER mind_manual_subject_write_fence", "triggers"],
    ["removed guard trigger", "DROP TRIGGER mind_manual_truncate_fence ON auth.users", "triggers"],
    ["renamed guard trigger", "ALTER TRIGGER mind_manual_subject_write_fence ON auth.users RENAME TO innocuous_name", "triggers"],
    ["extra guard target", "CREATE TABLE public.unexpected_guard_target (user_id uuid); CREATE TRIGGER hidden_guard BEFORE INSERT ON public.unexpected_guard_target FOR EACH ROW EXECUTE FUNCTION mind_manual_migration.guard_subject_write('user_id')", "triggers"],
    ["retargeted guard trigger", "CREATE FUNCTION public.bypass_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$; DROP TRIGGER mind_manual_subject_write_fence ON public.ai_conversations; CREATE TRIGGER mind_manual_subject_write_fence BEFORE INSERT OR UPDATE OR DELETE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.bypass_guard(); ALTER TABLE public.ai_conversations ENABLE ALWAYS TRIGGER mind_manual_subject_write_fence", "triggers"],
    ["changed trigger owner argument", "DROP TRIGGER mind_manual_subject_write_fence ON public.ai_conversations; CREATE TRIGGER mind_manual_subject_write_fence BEFORE INSERT OR UPDATE OR DELETE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION mind_manual_migration.guard_subject_write('id'); ALTER TABLE public.ai_conversations ENABLE ALWAYS TRIGGER mind_manual_subject_write_fence", "triggers"],
    ["schema owner", "ALTER SCHEMA mind_manual_migration OWNER TO catalog_test_owner", "schema"],
    ["schema API grant", "GRANT USAGE ON SCHEMA mind_manual_migration TO authenticated", "schema"],
    ["table API grant", "GRANT SELECT ON mind_manual_migration.control TO authenticated", "relations"],
    ["column API grant", "GRANT UPDATE(phase) ON mind_manual_migration.control TO authenticated", "relations"],
    ["table owner", "ALTER TABLE mind_manual_migration.control OWNER TO catalog_test_owner"],
    ["private RLS", "ALTER TABLE mind_manual_migration.subjects ENABLE ROW LEVEL SECURITY", "relations"],
    ["column default", "ALTER TABLE mind_manual_migration.control ALTER COLUMN changed_at SET DEFAULT now()", "relations"],
    ["removed phase constraint", "ALTER TABLE mind_manual_migration.control DROP CONSTRAINT control_phase_check", "relations"],
    ["extra private table", "CREATE TABLE mind_manual_migration.unreviewed (id integer)"],
    ["extra private enum", "CREATE TYPE mind_manual_migration.unreviewed AS ENUM ('unsafe')"],
    ["extra private function", "CREATE FUNCTION mind_manual_migration.unreviewed() RETURNS integer LANGUAGE sql AS 'SELECT 1'"],
    ["extra public guard overload", "CREATE FUNCTION public.mind_manual_admit_edge(integer) RETURNS boolean LANGUAGE sql AS 'SELECT true'", "functions"],
    ["RPC owner", "ALTER FUNCTION public.mind_manual_admit_edge(text, uuid) OWNER TO catalog_test_owner", "functions"],
    ["RPC security invoker", "ALTER FUNCTION public.mind_manual_admit_edge(text, uuid) SECURITY INVOKER", "functions"],
    ["RPC search path", "ALTER FUNCTION public.mind_manual_admit_edge(text, uuid) SET search_path=public,pg_catalog", "functions"],
    ["RPC execute privilege", "GRANT EXECUTE ON FUNCTION public.mind_manual_admit_edge(text, uuid) TO authenticated", "functions"],
    ["private function execute privilege", "GRANT EXECUTE ON FUNCTION mind_manual_migration.fence() TO PUBLIC", "functions"],
    ["modified function body", "CREATE OR REPLACE FUNCTION mind_manual_migration.resume() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN NULL; END$$", "functions"],
    ["private default ACL", "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA mind_manual_migration GRANT SELECT ON TABLES TO authenticated"],
    ["edge registry addition", "INSERT INTO mind_manual_migration.edge_functions VALUES ('unwrapped-writer')", "edgeFunctions"],
    ["edge registry deletion", "DELETE FROM mind_manual_migration.edge_functions WHERE function_name='storage-photo'", "edgeFunctions"],
    ["relation registry ownership", "UPDATE mind_manual_migration.relation_scopes SET owner_column='id' WHERE relation_name='ai_conversations'", "relationScopes"],
    ["removed storage policy", "DROP POLICY mind_manual_gateway_insert ON storage.objects", "storageGuard"],
    ["relaxed storage policy", "ALTER POLICY mind_manual_gateway_insert ON storage.objects WITH CHECK (true)", "storageGuard"],
    ["renamed storage policy", "ALTER POLICY mind_manual_gateway_insert ON storage.objects RENAME TO hidden_policy", "storageGuard"],
    ["permissive storage policy", "DROP POLICY mind_manual_gateway_insert ON storage.objects; CREATE POLICY mind_manual_gateway_insert ON storage.objects AS PERMISSIVE FOR INSERT TO anon,authenticated WITH CHECK (bucket_id NOT IN ('photos','voice-samples'))", "storageGuard"],
    ["extra guard storage policy", "CREATE POLICY mind_manual_gateway_unreviewed ON storage.objects FOR SELECT USING (true)", "storageGuard"],
    ["storage policy client role", "ALTER POLICY mind_manual_gateway_delete ON storage.objects TO authenticated", "storageGuard"],
    ["disabled storage RLS", "ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY", "storageGuard"],
    ["storage owner", "ALTER TABLE storage.objects OWNER TO postgres", "storageGuard"],
    ["client RLS bypass", "ALTER ROLE authenticated BYPASSRLS", "storageGuard"],
    ["client superuser", "ALTER ROLE anon SUPERUSER", "storageGuard"],
    ["client inherited storage ownership", "GRANT supabase_storage_admin TO authenticated", "storageGuard"],
    ["client inherited privileged role", "GRANT service_role TO authenticated", "storageGuard"],
    ["client noninherited owner membership", "ALTER ROLE authenticated NOINHERIT; GRANT supabase_storage_admin TO authenticated", "storageGuard"],
  ];
  for (const [name, statement, component] of structuralMutations) {
    it(`rejects ${name}`, () => rejectsMutation(statement, component));
  }

  it("ignores unrelated provider-managed storage policies and application data", () => {
    const changed = mutatedCatalog(`
      DROP POLICY fixture_managed_storage_access ON storage.objects;
      CREATE POLICY another_provider_policy ON storage.objects FOR SELECT TO anon USING (true);
      ALTER TABLE storage.objects ADD COLUMN managed_provider_field text;
      INSERT INTO storage.objects VALUES (NULL, 'unrelated-bucket', 'unrelated', 'provider metadata');
      INSERT INTO public.ai_conversations VALUES ('10000000-0000-4000-8000-000000000001', 'unrelated content');
    `);
    assert.deepEqual(changed, baseline);
    assert.deepEqual(validateMigrationGuardCatalog(changed), expectedMigrationGuardContract());
  });
});
