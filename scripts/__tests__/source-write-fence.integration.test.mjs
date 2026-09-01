import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Real, disposable PostgreSQL, never a supplied DATABASE_URL or existing server.
// Override only the local binary directory with MIND_MANUAL_TEST_PG_BIN.
// Missing server binaries fail the suite; they do not become a skipped pass.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const artifact = readFileSync(join(root, "supabase/isolation/source-write-fence.sql"), "utf8");
const readManifest = (name) => readFileSync(join(root, "supabase/isolation", name), "utf8")
  .split(/\r?\n/u).filter((line) => line && !line.startsWith("#"));
const scopes = readManifest("mind-manual-data-scopes.tsv").map((line) => line.split("\t").slice(0, 2));
const functions = readManifest("mind-manual-edge-functions.tsv").map((line) => line.split("\t")[0]);
const selected = "10000000-0000-4000-8000-000000000001";
const unrelated = "20000000-0000-4000-8000-000000000002";
const newcomer = "30000000-0000-4000-8000-000000000003";
const lease = "90000000-0000-4000-8000-000000000009";
const generation = "owner-stage-a.test";
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
let pgBin;
let scratch;
let started = false;
const sessions = new Set();

function command(exe, args, options = {}) {
  const result = spawnSync(join(pgBin, exe), args, {
    encoding: "utf8", env, timeout: 30_000, maxBuffer: 2 * 1024 * 1024, ...options,
  });
  assert.equal(result.error, undefined, `${exe}: ${result.error?.message}`);
  return result;
}

function psqlArgs(database = "postgres") {
  return ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
    "-h", scratch, "-p", "5432", "-U", "postgres", "-d", database];
}

function sql(statement, database = "postgres") {
  const result = command("psql", psqlArgs(database), { input: statement });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function denies(statement, code = "55000") {
  const result = command("psql", psqlArgs(), { input: statement });
  assert.notEqual(result.status, 0, `Unexpectedly allowed: ${statement}`);
  assert.match(result.stderr, new RegExp(`\\b${code}\\b`, "u"), result.stderr);
}

function session() {
  const child = spawn(join(pgBin, "psql"), psqlArgs(), { env });
  const handle = { child, stdout: "", stderr: "", status: undefined };
  child.stdout.on("data", (chunk) => { handle.stdout += chunk; });
  child.stderr.on("data", (chunk) => { handle.stderr += chunk; });
  handle.done = new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (status) => { handle.status = status; sessions.delete(handle); resolveDone(handle); });
  });
  handle.send = async (statement) => {
    const marker = `done_${Math.random().toString(36).slice(2)}`;
    child.stdin.write(`${statement}\nSELECT '${marker}';\n`);
    const deadline = Date.now() + 5000;
    while (!handle.stdout.includes(marker)) {
      assert.equal(handle.status, undefined, handle.stderr);
      assert.ok(Date.now() < deadline, `Local PostgreSQL session timed out: ${handle.stderr}`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  };
  sessions.add(handle);
  return handle;
}

function activate() {
  sql("SELECT mind_manual_migration.begin_drain(); SELECT mind_manual_migration.fence();");
}

function insert(relation, owner, subject, value = "inserted") {
  return `INSERT INTO public.${relation} (${owner}, payload) VALUES ('${subject}', '${value}');`;
}

describe("manual source write fence — real local PostgreSQL", { concurrency: false }, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN
      ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/opt/postgresql@17/bin",
        "/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/16/bin",
        "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/18/bin",
        ...String(process.env.PATH ?? "").split(delimiter)];
    pgBin = candidates.find((candidate) => ["postgres", "initdb", "pg_ctl", "psql"]
      .every((binary) => existsSync(join(candidate, binary))));
    assert.ok(pgBin, "Install local PostgreSQL server binaries or set MIND_MANUAL_TEST_PG_BIN; remote databases are forbidden.");
    scratch = mkdtempSync(join(tmpdir(), "mind-manual-fence-pg-"));
    const initialized = command("initdb", ["-D", join(scratch, "data"), "-U", "postgres",
      "--auth=trust", "--no-locale", "--encoding=UTF8"]);
    assert.equal(initialized.status, 0, initialized.stderr);
    // No TCP listener: each run has its own private Unix socket directory.
    const data = join(scratch, "data");
    const start = command("pg_ctl", ["-D", data, "-l", join(scratch, "server.log"),
      "-o", `-F -k '${scratch}' -h ''`, "-w", "start"]);
    assert.equal(start.status, 0, start.stderr + start.stdout);
    started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE ROLE supabase_auth_admin; CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, payload text);
      CREATE TABLE auth.identities (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users ON DELETE CASCADE, payload text);
      CREATE TABLE public.commerce_orders (id uuid PRIMARY KEY, user_id uuid, payload text);
      ${scopes.map(([relation, owner]) => `CREATE TABLE public.${relation} (${owner} uuid ${owner === "id" ? "PRIMARY KEY" : ""}, payload text);`).join("\n")}
      CREATE VIEW public.plaid_items_safe AS SELECT user_id, payload FROM public.plaid_items;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role, supabase_auth_admin;
      GRANT ALL ON ALL TABLES IN SCHEMA public, auth TO service_role, supabase_auth_admin;
      GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fixture_authenticated ON public.ai_conversations TO authenticated USING (true) WITH CHECK (true);
    `);
    sql(artifact);
  });

  beforeEach(async () => {
    for (const handle of sessions) handle.child.stdin.end("ROLLBACK;\n");
    await Promise.all([...sessions].map((handle) => handle.done));
    sql(`SELECT mind_manual_migration.resume();
      DELETE FROM mind_manual_migration.edge_leases;
      DELETE FROM mind_manual_migration.subjects;
      TRUNCATE ${scopes.map(([relation]) => `public.${relation}`).join(", ")},
        auth.identities, auth.users, public.commerce_orders CASCADE;
      INSERT INTO auth.users VALUES ('${selected}', 'selected'), ('${unrelated}', 'unrelated');
      INSERT INTO auth.identities VALUES ('${selected}', '${selected}', 'selected'), ('${unrelated}', '${unrelated}', 'unrelated');
      ${scopes.map(([relation, owner]) => insert(relation, owner, selected, "selected") + insert(relation, owner, unrelated, "unrelated")).join("\n")}
      INSERT INTO public.commerce_orders VALUES ('${selected}', '${selected}', 'commerce');
      SELECT mind_manual_migration.configure_subjects(ARRAY['${selected}']::uuid[]);
    `);
  });

  after(async () => {
    for (const handle of sessions) handle.child.stdin.end("ROLLBACK;\n");
    await Promise.all([...sessions].map((handle) => handle.done));
    if (started) {
      const stopped = command("pg_ctl", ["-D", join(scratch, "data"), "-m", "immediate", "-w", "stop"]);
      assert.equal(stopped.status, 0, stopped.stderr);
    }
    // Delete only this test's exact mkdtemp-created disposable cluster.
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it("installs dormant with exact manifest parity and all 102 row/truncate triggers ALWAYS enabled", () => {
    assert.equal(sql("SELECT phase FROM mind_manual_migration.control"), "open");
    assert.deepEqual(sql("SELECT relation_name || E'\\t' || owner_column FROM mind_manual_migration.relation_scopes WHERE schema_name='public' ORDER BY relation_name").split("\n"), scopes.map((scope) => scope.join("\t")).sort());
    assert.deepEqual(sql("SELECT function_name FROM mind_manual_migration.edge_functions ORDER BY function_name").split("\n"), [...functions].sort());
    assert.equal(sql("SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'mind_manual_%fence%' AND tgenabled='A'"), "102");
    sql(`UPDATE public.ai_conversations SET payload='open'; SET ROLE service_role;
      SELECT public.mind_manual_admit_edge('calendar-sync', '${lease}');`);
  });

  it("rejects inherited scope tables and rolls back the entire incomplete installation", () => {
    const database = "mind_manual_inheritance_fixture";
    sql(`CREATE DATABASE ${database}`);
    try {
      sql(`CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid); CREATE TABLE auth.identities (user_id uuid);
        ${scopes.map(([relation, owner]) => `CREATE TABLE public.${relation} (${owner} uuid, payload text);`).join("\n")}
        CREATE TABLE public.uncovered_child () INHERITS (public.ai_conversations);`, database);
      const result = command("psql", psqlArgs(database), { input: artifact });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Mind Manual scope public.ai_conversations requires an ordinary table/u);
      assert.equal(sql("SELECT count(*) FROM pg_namespace WHERE nspname='mind_manual_migration'", database), "0");
      assert.equal(sql("SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'mind_manual_%fence%'", database), "0");
    } finally {
      sql(`DROP DATABASE ${database}`);
    }
  });

  it("blocks insert, update, delete, owner transfers and truncate across every selected public scope", () => {
    activate();
    for (const [relation, owner] of scopes) {
      denies(insert(relation, owner, selected));
      denies(`UPDATE public.${relation} SET payload='changed' WHERE ${owner}='${selected}'`);
      denies(`DELETE FROM public.${relation} WHERE ${owner}='${selected}'`);
      denies(`UPDATE public.${relation} SET ${owner}='${newcomer}' WHERE ${owner}='${selected}'`);
      denies(`UPDATE public.${relation} SET ${owner}='${selected}' WHERE ${owner}='${unrelated}'`);
      denies(`TRUNCATE public.${relation}`);
      sql(`UPDATE public.${relation} SET payload='unrelated continues' WHERE ${owner}='${unrelated}';
        DELETE FROM public.${relation} WHERE ${owner}='${unrelated}';
        ${insert(relation, owner, newcomer)}`);
    }
  });

  it("does not change unrelated commerce, even for the selected user's commerce rows", () => {
    activate();
    sql(`BEGIN; SET ROLE service_role; UPDATE public.commerce_orders SET payload='commerce continues';
      UPDATE auth.users SET payload='unrelated login continues' WHERE id='${unrelated}';
      DELETE FROM public.commerce_orders; INSERT INTO public.commerce_orders VALUES ('${selected}', '${selected}', 'new');
      TRUNCATE public.commerce_orders; COMMIT;`);
  });

  it("blocks selected Auth mutations and identity linking but allows unrelated signup and identity use", () => {
    sql(`ALTER TABLE public.profiles ADD CONSTRAINT fixture_profile_auth_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
      CREATE FUNCTION public.fixture_handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
        INSERT INTO public.profiles (id, payload) VALUES (NEW.id, 'signup profile'); RETURN NEW; END$$;
      CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fixture_handle_new_user();`);
    activate();
    for (const [relation, owner] of [["users", "id"], ["identities", "user_id"]]) {
      denies(`SET ROLE supabase_auth_admin; UPDATE auth.${relation} SET payload='changed' WHERE ${owner}='${selected}'`);
      denies(`SET ROLE supabase_auth_admin; DELETE FROM auth.${relation} WHERE ${owner}='${selected}'`);
      denies(`SET ROLE supabase_auth_admin; UPDATE auth.${relation} SET ${owner}='${selected}' WHERE ${owner}='${unrelated}'`);
      denies(`TRUNCATE auth.${relation} CASCADE`);
    }
    denies(`SET ROLE supabase_auth_admin; INSERT INTO auth.users VALUES ('${selected}', 'reused ID')`);
    denies(`SET ROLE supabase_auth_admin; INSERT INTO auth.identities VALUES ('${newcomer}', '${selected}', 'new link')`);
    sql(`SET ROLE supabase_auth_admin; INSERT INTO auth.users VALUES ('${newcomer}', 'new signup');
      INSERT INTO auth.identities VALUES ('${newcomer}', '${newcomer}', 'new identity');
      UPDATE auth.users SET payload='login metadata' WHERE id='${unrelated}';
      UPDATE auth.identities SET payload='new provider metadata' WHERE user_id='${unrelated}';`);
    assert.equal(sql(`SELECT payload FROM public.profiles WHERE id='${newcomer}'`), "signup profile");
    sql(`SET ROLE supabase_auth_admin; DELETE FROM auth.users WHERE id='${newcomer}';`);
    assert.equal(sql(`SELECT count(*) FROM public.profiles WHERE id='${newcomer}'`), "0");
    sql(`DROP TRIGGER on_auth_user_created ON auth.users; DROP FUNCTION public.fixture_handle_new_user();
      ALTER TABLE public.profiles DROP CONSTRAINT fixture_profile_auth_fk;`);
  });

  it("denies service_role, SECURITY DEFINER, authenticated and replica bypasses", () => {
    activate();
    for (const prefix of ["SET ROLE service_role;", "SET ROLE authenticated;", "SET session_replication_role=replica;"]) {
      denies(`${prefix} ${insert("ai_conversations", "user_id", selected)}`);
    }
    sql(`CREATE FUNCTION public.fixture_definer() RETURNS void LANGUAGE sql SECURITY DEFINER AS
      $$UPDATE public.ai_conversations SET payload='definer bypass' WHERE user_id='${selected}'$$;
      GRANT EXECUTE ON FUNCTION public.fixture_definer() TO authenticated;`);
    denies("SET ROLE authenticated; SELECT public.fixture_definer();");
    denies("SET session_replication_role=replica; TRUNCATE public.ai_conversations;");
    sql("DROP FUNCTION public.fixture_definer()");
  });

  it("rechecks final NEW owner after later BEFORE triggers and handles cascading deletes", () => {
    sql(`CREATE FUNCTION public.fixture_retarget() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      NEW.user_id := '${selected}'; RETURN NEW; END$$;
      CREATE TRIGGER z_fixture_retarget BEFORE INSERT ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.fixture_retarget();
      CREATE TABLE public.fixture_parent (id uuid PRIMARY KEY);
      INSERT INTO public.fixture_parent VALUES ('${selected}');
      ALTER TABLE public.ai_conversations ADD COLUMN parent_id uuid REFERENCES public.fixture_parent ON DELETE CASCADE;
      UPDATE public.ai_conversations SET parent_id='${selected}' WHERE user_id='${selected}';`);
    activate();
    denies(insert("ai_conversations", "user_id", unrelated));
    denies(`DELETE FROM public.fixture_parent WHERE id='${selected}'`);
    sql(`SELECT mind_manual_migration.resume();
      DROP TRIGGER z_fixture_retarget ON public.ai_conversations; DROP FUNCTION public.fixture_retarget();
      ALTER TABLE public.ai_conversations DROP COLUMN parent_id; DROP TABLE public.fixture_parent;`);
  });

  it("drains leases without expiry and requires zero unresolved work before fencing", () => {
    assert.equal(sql(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', '${lease}')`), "t");
    assert.equal(sql(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', '${lease}')`), "f");
    sql(`UPDATE mind_manual_migration.edge_leases SET admitted_at=now()-interval '100 years'; SELECT mind_manual_migration.begin_drain()`);
    assert.equal(sql(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', '${newcomer}')`), "f");
    denies("SELECT mind_manual_migration.fence()");
    sql(`UPDATE public.ai_conversations SET payload='in-flight work may finish while draining' WHERE user_id='${selected}'`);
    assert.equal(sql(`SET ROLE service_role; SELECT public.mind_manual_release_edge('${lease}')`), "t");
    assert.equal(sql(`SET ROLE service_role; SELECT public.mind_manual_release_edge('${lease}')`), "f");
    sql("SELECT mind_manual_migration.fence()");
    assert.equal(sql(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', '${newcomer}')`), "f");
  });

  it("classifies unrelated users without leases and binds selected leases to the exact V2 tuple", () => {
    assert.equal(sql(`SELECT (public.mind_manual_admit_subject_edge(
      'storage-photo', 'upload', '${unrelated}', '${lease}', '${generation}'
    )) ->> 'decision'`), "unselected");
    assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "0");

    assert.equal(sql(`SELECT (public.mind_manual_admit_subject_edge(
      'storage-photo', 'upload', '${selected}', '${lease}', '${generation}'
    )) ->> 'decision'`), "admitted");
    assert.equal(sql(`SELECT subject_id || ':' || function_name || ':' || action || ':' || generation
      FROM mind_manual_migration.edge_leases WHERE lease_id='${lease}'`),
    `${selected}:storage-photo:upload:${generation}`);

    // Neither the old release nor a near-match may delete a selected V2 lease.
    assert.equal(sql(`SELECT public.mind_manual_release_edge('${lease}')`), "f");
    for (const tuple of [
      `'storage-photo', 'delete', '${selected}', '${lease}', '${generation}'`,
      `'storage-photo', 'upload', '${unrelated}', '${lease}', '${generation}'`,
      `'storage-photo', 'upload', '${selected}', '${lease}', 'other-generation'`,
    ]) {
      assert.equal(sql(`SELECT (public.mind_manual_release_subject_edge(${tuple})) ->> 'decision'`), "retained");
      assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "1");
    }
    assert.equal(sql(`SELECT (public.mind_manual_release_subject_edge(
      'storage-photo', 'upload', '${selected}', '${lease}', '${generation}'
    )) ->> 'decision'`), "released");
    assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "0");

    sql("SELECT mind_manual_migration.begin_drain()");
    assert.equal(sql(`SELECT (public.mind_manual_admit_subject_edge(
      'storage-photo', 'delete', '${unrelated}', '${lease}', '${generation}'
    )) ->> 'decision'`), "unselected");
    assert.equal(sql(`SELECT (public.mind_manual_admit_subject_edge(
      'storage-photo', 'delete', '${selected}', '${lease}', '${generation}'
    )) ->> 'decision'`), "blocked");
    assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "0");
  });

  it("blocks V2 before configuration and makes the single selected owner immutable", () => {
    sql("DELETE FROM mind_manual_migration.subjects");
    assert.equal(sql(`SELECT (public.mind_manual_admit_subject_edge(
      'storage-photo', 'upload', '${unrelated}', '${lease}', '${generation}'
    )) ->> 'decision'`), "blocked");
    assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "0");

    sql(`SELECT mind_manual_migration.configure_subjects(ARRAY['${selected}']::uuid[])`);
    assert.equal(sql(`SELECT (public.mind_manual_admit_subject_edge(
      'storage-photo', 'upload', '${unrelated}', '${lease}', '${generation}'
    )) ->> 'decision'`), "unselected");
    assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "0");
    // Exact replay is idempotent; selecting the formerly unrelated caller is forbidden forever.
    sql(`SELECT mind_manual_migration.configure_subjects(ARRAY['${selected}']::uuid[])`);
    denies(`SELECT mind_manual_migration.configure_subjects(ARRAY['${unrelated}']::uuid[])`);
    assert.equal(sql("SELECT user_id FROM mind_manual_migration.subjects"), selected);
  });

  it("retains leases through resume and restores guarded writes without deleting data", () => {
    sql(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('gmail-sync', '${lease}'); RESET ROLE;
      SELECT mind_manual_migration.begin_drain(); SELECT mind_manual_migration.resume();`);
    assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "1");
    sql(`SET ROLE service_role; SELECT public.mind_manual_release_edge('${lease}'); RESET ROLE;`);
    activate();
    const before = sql(`SELECT count(*) FROM public.ai_conversations`);
    sql(`SELECT mind_manual_migration.resume(); UPDATE public.ai_conversations SET payload='resumed' WHERE user_id='${selected}'`);
    assert.equal(sql("SELECT count(*) FROM public.ai_conversations"), before);
  });

  it("denies untrusted RPCs and all API-role access to private state/management", () => {
    for (const role of ["anon", "authenticated"]) {
      denies(`SET ROLE ${role}; SELECT public.mind_manual_admit_edge('calendar-sync', '${lease}')`, "42501");
      denies(`SET ROLE ${role}; SELECT public.mind_manual_release_edge('${lease}')`, "42501");
      denies(`SET ROLE ${role}; SELECT public.mind_manual_admit_subject_edge(
        'storage-photo', 'upload', '${selected}', '${lease}', '${generation}'
      )`, "42501");
      denies(`SET ROLE ${role}; SELECT public.mind_manual_release_subject_edge(
        'storage-photo', 'upload', '${selected}', '${lease}', '${generation}'
      )`, "42501");
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      denies(`SET ROLE ${role}; SELECT * FROM mind_manual_migration.control`, "42501");
      denies(`SET ROLE ${role}; SELECT mind_manual_migration.resume()`, "42501");
      denies(`SET ROLE ${role}; SELECT mind_manual_migration.configure_subjects(ARRAY['${unrelated}']::uuid[])`, "42501");
    }
    denies(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('commerce-billing', '${lease}')`, "22023");
    denies("SET ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', NULL)", "22023");
  });

  it("requires existing explicit subjects, open configuration and the ordered state machine", () => {
    denies("SELECT mind_manual_migration.configure_subjects(ARRAY[]::uuid[])", "22023");
    denies("SELECT mind_manual_migration.configure_subjects(ARRAY[NULL]::uuid[])", "22023");
    denies(`SELECT mind_manual_migration.configure_subjects(ARRAY['${selected}', '${selected}']::uuid[])`, "22023");
    denies(`SELECT mind_manual_migration.configure_subjects(ARRAY['${selected}', '${unrelated}']::uuid[])`, "22023");
    denies(`SELECT mind_manual_migration.configure_subjects(ARRAY['${newcomer}']::uuid[])`, "22023");
    denies("SELECT mind_manual_migration.fence()");
    sql("SELECT mind_manual_migration.begin_drain()");
    denies(`SELECT mind_manual_migration.configure_subjects(ARRAY['${unrelated}']::uuid[])`);
    denies("SELECT mind_manual_migration.begin_drain()");
    sql("SELECT mind_manual_migration.fence()");
    denies("SELECT mind_manual_migration.fence()");
    denies(artifact, "42P06");
    assert.equal(sql("SELECT phase FROM mind_manual_migration.control"), "fenced");
  });

  it("serializes drain against uncommitted Edge admission", async () => {
    const held = session();
    await held.send(`BEGIN; SET LOCAL ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', '${lease}');`);
    denies("SET lock_timeout='150ms'; SELECT mind_manual_migration.begin_drain()", "55P03");
    await held.send("COMMIT;");
    sql("SELECT mind_manual_migration.begin_drain()");
    denies("SELECT mind_manual_migration.fence()");
  });

  it("the draining transition prevents a stale repeatable-read lease snapshot from fencing", async () => {
    const held = session();
    await held.send("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM mind_manual_migration.edge_leases;");
    sql(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', '${lease}'); RESET ROLE;
      SELECT mind_manual_migration.begin_drain();`);
    held.child.stdin.end("SELECT mind_manual_migration.fence();\n");
    const result = await held.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /40001/u);
    assert.equal(sql("SELECT phase FROM mind_manual_migration.control"), "draining");
    assert.equal(sql("SELECT count(*) FROM mind_manual_migration.edge_leases"), "1");
  });

  it("serializes phase and subject transitions against in-flight DB writes", async () => {
    const held = session();
    await held.send(`BEGIN; UPDATE public.ai_conversations SET payload='in flight' WHERE user_id='${selected}';`);
    denies("SET lock_timeout='150ms'; SELECT mind_manual_migration.begin_drain()", "55P03");
    denies(`SET lock_timeout='150ms'; SELECT mind_manual_migration.configure_subjects(ARRAY['${unrelated}']::uuid[])`, "55P03");
    await held.send("COMMIT;");
    activate();
    denies(insert("ai_conversations", "user_id", selected));
  });

  it("rejects a stale repeatable-read transaction after fence activation", async () => {
    const held = session();
    await held.send("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT phase FROM mind_manual_migration.control;");
    activate();
    held.child.stdin.end(insert("ai_conversations", "user_id", selected));
    const result = await held.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /40001/u);
    assert.equal(sql("SELECT count(*) FROM public.ai_conversations"), "2");
  });

  it("fails closed when the control singleton is missing", () => {
    sql("DELETE FROM mind_manual_migration.control");
    denies(insert("ai_conversations", "user_id", selected), "P0002");
    denies(`SET ROLE service_role; SELECT public.mind_manual_admit_edge('calendar-sync', '${lease}')`, "P0002");
    sql("INSERT INTO mind_manual_migration.control (phase) VALUES ('open')");
  });
});
