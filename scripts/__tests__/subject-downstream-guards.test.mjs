import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { subjectScopeBinding } from "../lib/migration-subject-scope.mjs";
import { sha256File } from "../lib/supabase-isolation.mjs";
import {
  guardTargetMutationSql,
  inventorySql as resetInventorySql,
  renderResetSql,
  targetSubjectScopeGuardSql,
  validateMigrationReceipts,
} from "../reset-isolated-supabase-oauth-credentials.mjs";
import {
  inventorySql as quarantineInventorySql,
  validateQuarantineInputs,
} from "../quarantine-isolated-supabase-provider-state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRef = "ekekeywoxvdbfbmqyhjy";
const targetRef = "abcdefghijklmnopqrst";
const selected = "10000000-0000-4000-8000-000000000001";
const unrelated = "20000000-0000-4000-8000-000000000002";
const scope = subjectScopeBinding({
  version: 1,
  kind: "mind_manual_subject_scope",
  sourceProjectRef: sourceRef,
  targetProjectRef: targetRef,
  subjectIds: [selected],
  legacyStorageAssignments: [],
});
const scopes = readFileSync(
  join(root, "supabase/isolation/mind-manual-data-scopes.tsv"),
  "utf8",
)
  .split(/\r?\n/u).filter((line) => line && !line.startsWith("#")).map((line) =>
    line.split("\t")
  );
const resetTemplate = readFileSync(
  join(root, "supabase/isolation/post-import-oauth-credential-reset.sql"),
  "utf8",
);
const quarantineTemplate = readFileSync(
  join(root, "supabase/isolation/post-import-provider-quarantine.sql"),
  "utf8",
);
const syntheticToken = `oauth:v1:${"A".repeat(16)}:${"B".repeat(24)}`;
const syntheticTombstone = `oauth:v1:${"C".repeat(16)}:${"D".repeat(24)}`;

function receiptFixture() {
  const sourceHash = "a".repeat(64);
  const importHash = "b".repeat(64);
  const publicData = scopes.map(([relation, _owner, copyMode]) => ({
    relation,
    copyMode,
    totalRowCount:
      ["oauth_tokens", "calendar_accounts", "calendar_events"].includes(
          relation,
        )
        ? 1
        : 0,
    copyRowCount:
      ["oauth_tokens", "calendar_accounts", "calendar_events"].includes(
          relation,
        )
        ? 1
        : 0,
    copyRowsSha256: "c".repeat(64),
  }));
  const source = {
    version: 1,
    kind: "source",
    projectRef: sourceRef,
    status: "ready",
    blockers: [],
    subjectScope: scope,
    auth: { userCount: 1, subjectIdsSha256: scope.subjectIdsSha256 },
    publicData,
    manifests: {
      dataScopesSha256: sha256File(
        join(root, "supabase/isolation/mind-manual-data-scopes.tsv"),
      ),
    },
  };
  const imported = {
    version: 1,
    status: "verified_pending_storage_and_provider_rebind",
    sourceProjectRef: sourceRef,
    targetProjectRef: targetRef,
    subjectScope: scope,
    sourceReceiptSha256: sourceHash,
    authDecisionSha256: "d".repeat(64),
    packageManifestSha256: "e".repeat(64),
    targetPostImportReceiptSha256: "f".repeat(64),
    authSessionsCopied: false,
    refreshTokensCopied: false,
    sourceMutated: false,
    copiedRelations: publicData.map((row) => ({
      logicalName: `public.${row.relation}`,
      rowCount: row.copyRowCount,
      fileSha256: "9".repeat(64),
    })),
  };
  const reset = {
    version: 1,
    status: "oauth_credentials_reset_pending_google_reauthorization",
    sourceProjectRef: sourceRef,
    targetProjectRef: targetRef,
    subjectScope: scope,
    sourceReceiptSha256: sourceHash,
    importReceiptSha256: importHash,
    sourceMutated: false,
    rowIdsIncluded: false,
    secretValuesIncluded: false,
  };
  return { source, imported, reset, sourceHash, importHash };
}

describe("scoped downstream receipt contracts", () => {
  it("accepts one exact scoped source/import/reset chain", () => {
    const { source, imported, reset, sourceHash, importHash } =
      receiptFixture();
    assert.ok(
      validateMigrationReceipts(
        source,
        imported,
        sourceHash,
        targetRef,
      ) instanceof Map,
    );
    assert.deepEqual(
      validateQuarantineInputs(imported, reset, importHash, targetRef),
      scope,
    );
  });
  it("rejects missing, mixed or raw-ID scope envelopes", () => {
    for (
      const value of [undefined, { ...scope, scopeSha256: "0".repeat(64) }, {
        ...scope,
        subjectIds: [selected],
      }]
    ) {
      const { source, imported, reset, sourceHash, importHash } =
        receiptFixture();
      assert.throws(() =>
        validateMigrationReceipts(
          source,
          { ...imported, subjectScope: value },
          sourceHash,
          targetRef,
        )
      );
      assert.throws(() =>
        validateQuarantineInputs(
          imported,
          { ...reset, subjectScope: value },
          importHash,
          targetRef,
        )
      );
    }
  });
  it("rejects target, Auth subject fingerprint, and source-hash substitution", () => {
    const { source, imported, reset, sourceHash, importHash } =
      receiptFixture();
    assert.throws(() =>
      validateMigrationReceipts(
        source,
        imported,
        sourceHash,
        "bcdefghijklmnopqrstu",
      )
    );
    assert.throws(() =>
      validateMigrationReceipts(
        {
          ...source,
          auth: { ...source.auth, subjectIdsSha256: "0".repeat(64) },
        },
        imported,
        sourceHash,
        targetRef,
      )
    );
    assert.throws(() =>
      validateQuarantineInputs(
        imported,
        { ...reset, sourceReceiptSha256: "0".repeat(64) },
        importHash,
        targetRef,
      )
    );
  });
  it("does not relax selected-total equals copy-total or credential disposition", () => {
    const { source, imported, sourceHash } = receiptFixture();
    source.publicData.find((row) => row.relation === "oauth_tokens")
      .totalRowCount = 2;
    assert.throws(
      () => validateMigrationReceipts(source, imported, sourceHash, targetRef),
      /receipt-bound relation/u,
    );
  });
  it("renders only hash/count evidence and refuses unscoped or transactionless SQL", () => {
    const sql = guardTargetMutationSql("BEGIN;\nSELECT 1;\nCOMMIT;", scope);
    assert.doesNotMatch(sql, new RegExp(selected, "u"));
    assert.equal((sql.match(/DO \$subject_scope\$/gu) ?? []).length, 2);
    assert.ok(sql.indexOf("LOCK TABLE") < sql.indexOf("SELECT 1;"));
    assert.throws(() => targetSubjectScopeGuardSql(undefined));
    assert.throws(() => guardTargetMutationSql("SELECT 1;", scope));
  });
});

// This suite never reads DATABASE_URL, linked project state, credentials, or a
// running service. It creates an isolated local cluster with Unix sockets only.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
);
let pgBin, scratch, started = false;
const sessions = new Set();
function command(exe, args, options = {}) {
  const result = spawnSync(join(pgBin, exe), args, {
    encoding: "utf8",
    env,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.error, undefined, `${exe}: ${result.error?.message}`);
  return result;
}
const psqlArgs = () => [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-h",
  scratch,
  "-p",
  "5432",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
function sql(statement) {
  const result = command("psql", psqlArgs(), { input: statement });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function rejectsSql(statement, pattern = /approved (subject )?scope/u) {
  const result = command("psql", psqlArgs(), { input: statement });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
  return result;
}
function session() {
  const child = spawn(join(pgBin, "psql"), psqlArgs(), { env });
  const handle = { child, stdout: "", stderr: "", status: undefined };
  child.stdout.on("data", (chunk) => {
    handle.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    handle.stderr += chunk;
  });
  handle.done = new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (status) => {
      handle.status = status;
      sessions.delete(handle);
      resolveDone(handle);
    });
  });
  handle.send = async (statement) => {
    const marker = `done_${Math.random().toString(36).slice(2)}`;
    child.stdin.write(`${statement}\nSELECT '${marker}';\n`);
    const deadline = Date.now() + 5000;
    while (!handle.stdout.includes(marker)) {
      assert.equal(handle.status, undefined, handle.stderr);
      assert.ok(Date.now() < deadline, "Local PostgreSQL session timed out");
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  };
  sessions.add(handle);
  return handle;
}
function expectedReset() {
  const inventory = JSON.parse(sql(resetInventorySql(null, scope)));
  return new Map(
    inventory.relations.map((
      row,
    ) => [row.relation, {
      rowCount: row.rowCount,
      rowsSha256: row.rowsSha256,
    }]),
  );
}

describe("scoped downstream mutations — real local PostgreSQL", {
  concurrency: false,
}, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN
      ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : [
        "/opt/homebrew/opt/postgresql@16/bin",
        "/opt/homebrew/opt/postgresql@17/bin",
        "/opt/homebrew/opt/postgresql@18/bin",
        "/usr/lib/postgresql/16/bin",
        "/usr/lib/postgresql/17/bin",
        "/usr/lib/postgresql/18/bin",
        ...String(process.env.PATH ?? "").split(delimiter),
      ];
    pgBin = candidates.find((candidate) =>
      ["postgres", "initdb", "pg_ctl", "psql"].every((binary) =>
        existsSync(join(candidate, binary))
      )
    );
    assert.ok(
      pgBin,
      "Local PostgreSQL server binaries required; no remote fallback",
    );
    scratch = mkdtempSync(join(tmpdir(), "mind-manual-subject-downstream-pg-"));
    const initialized = command("initdb", [
      "-D",
      join(scratch, "data"),
      "-U",
      "postgres",
      "--auth=trust",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    assert.equal(initialized.status, 0, initialized.stderr);
    const start = command("pg_ctl", [
      "-D",
      join(scratch, "data"),
      "-l",
      join(scratch, "server.log"),
      "-o",
      `-F -k '${scratch}' -h ''`,
      "-w",
      "start",
    ]);
    assert.equal(start.status, 0, start.stderr);
    started = true;
    sql(
      `CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE auth.identities (id uuid DEFAULT gen_random_uuid(), user_id uuid);
      ${
        scopes.map(([relation, owner]) =>
          `CREATE TABLE public.${relation} (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, ${
            owner === "id" ? "" : "user_id uuid,"
          } payload text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());`
        ).join("\n")
      }
      ALTER TABLE public.oauth_tokens ADD provider text, ADD service_type text, ADD provider_account_id text, ADD account_email text, ADD scope text,
        ADD access_token text, ADD refresh_token text, ADD token_expires_at timestamptz;
      ALTER TABLE public.calendar_accounts ADD oauth_token_id uuid, ADD provider text, ADD account_name text, ADD account_email text,
        ADD calendar_id text, ADD calendar_name text, ADD is_primary boolean, ADD bounded_sync_window_days integer,
        ADD sync_enabled boolean, ADD last_sync_at timestamptz, ADD sync_token text, ADD watch_channel_id text, ADD watch_resource_id text,
        ADD watch_expires_at timestamptz, ADD watch_status text, ADD next_sync_token text, ADD sync_status text, ADD last_sync_error text,
        ADD sync_cursor text, ADD last_full_sync_at timestamptz, ADD sync_page_token text;
      ALTER TABLE public.calendar_events ADD calendar_account_id uuid;
      ALTER TABLE public.email_accounts ADD history_id text, ADD watch_expiration timestamptz, ADD watch_resource_id text, ADD watch_channel_id text;
      ALTER TABLE public.gmail_watch_subscriptions ADD status text, ADD history_id text, ADD last_notification_history_id text,
        ADD watch_expires_at timestamptz, ADD last_notification_at timestamptz, ADD last_sync_at timestamptz, ADD stopped_at timestamptz,
        ADD last_error_code text, ADD last_error_message text;
      ALTER TABLE public.webhook_subscriptions ADD is_active boolean;
      ALTER TABLE public.plaid_sync_status ADD webhook_url text, ADD is_healthy boolean;`,
    );
  });
  beforeEach(async () => {
    for (const handle of sessions) handle.child.stdin.end("ROLLBACK;\n");
    await Promise.all([...sessions].map((handle) => handle.done));
    sql(
      `TRUNCATE auth.identities, auth.users, ${
        scopes.map(([relation]) => `public.${relation}`).join(", ")
      };
      INSERT INTO auth.users VALUES ('${selected}'); INSERT INTO auth.identities (user_id) VALUES ('${selected}');
      INSERT INTO public.ai_conversations (user_id,payload) VALUES ('${selected}','preserved');
      INSERT INTO public.oauth_tokens (id,user_id,provider,service_type,provider_account_id,access_token,refresh_token,token_expires_at)
        VALUES ('${selected}','${selected}','google','calendar','synthetic-provider','${syntheticToken}','${syntheticToken}',now()+interval '1 hour');
      INSERT INTO public.calendar_accounts (id,user_id,oauth_token_id,provider,calendar_id,sync_enabled,watch_status,watch_channel_id,sync_status)
        VALUES ('${selected}','${selected}','${selected}','google','primary',true,'active','synthetic-channel','idle');
      INSERT INTO public.calendar_events (user_id,calendar_account_id,payload) VALUES ('${selected}','${selected}','preserve cache');`,
    );
  });
  after(async () => {
    for (const handle of sessions) handle.child.stdin.end("ROLLBACK;\n");
    await Promise.all([...sessions].map((handle) => handle.done));
    if (started) {
      assert.equal(
        command("pg_ctl", [
          "-D",
          join(scratch, "data"),
          "-m",
          "immediate",
          "-w",
          "stop",
        ]).status,
        0,
      );
    }
    // Only this test's exact disposable mkdtemp cluster is removed.
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });
  it("executes the actual reset transaction and preserves Calendar rows", () => {
    const before = JSON.parse(sql(resetInventorySql(null, scope)));
    sql(
      renderResetSql(resetTemplate, expectedReset(), syntheticTombstone, scope),
    );
    const after = JSON.parse(sql(resetInventorySql(syntheticTombstone, scope)));
    assert.equal(after.oauth.tombstoneMatchCount, 1);
    assert.equal(after.oauth.nonNullRefreshCount, 0);
    assert.equal(after.calendar.syncDisabledCount, 1);
    assert.deepEqual(after.preservation, before.preservation);
  });
  it("executes actual provider quarantine only on a selected-only target", () => {
    sql(
      `INSERT INTO public.email_accounts(user_id,history_id) VALUES ('${selected}','history');
      INSERT INTO public.gmail_watch_subscriptions(user_id,status,history_id) VALUES ('${selected}','active','history');
      INSERT INTO public.webhook_subscriptions(user_id,is_active) VALUES ('${selected}',true);
      INSERT INTO public.plaid_sync_status(user_id,webhook_url,is_healthy) VALUES ('${selected}','https://example.invalid/callback',true);
      INSERT INTO public.oauth_state(user_id) VALUES ('${selected}');`,
    );
    sql(guardTargetMutationSql(quarantineTemplate, scope));
    assert.ok(
      Object.values(JSON.parse(sql(quarantineInventorySql(scope)))).every((
        count,
      ) => count === 0),
    );
  });
  it("rejects a new Auth subject and same-count subject replacement before mutation", () => {
    const expected = expectedReset();
    sql(`INSERT INTO auth.users VALUES ('${unrelated}')`);
    rejectsSql(
      renderResetSql(resetTemplate, expected, syntheticTombstone, scope),
    );
    assert.equal(
      sql("SELECT access_token FROM public.oauth_tokens"),
      syntheticToken,
    );
    sql(`DELETE FROM auth.users WHERE id='${selected}'`);
    rejectsSql(guardTargetMutationSql(quarantineTemplate, scope));
    assert.equal(
      sql("SELECT watch_status FROM public.calendar_accounts"),
      "active",
    );
  });
  it("rejects a foreign or null owner in every durable relation, including tables not mutated by reset", () => {
    for (const [relation, owner] of scopes) {
      for (const ownerValue of [unrelated, ...(owner === "id" ? [] : [null])]) {
        sql(
          `INSERT INTO public.${relation} (${owner},payload) VALUES (${
            ownerValue === null ? "NULL" : `'${ownerValue}'`
          },'unapproved')`,
        );
        rejectsSql(
          guardTargetMutationSql(
            "BEGIN;\nUPDATE public.ai_conversations SET payload='mutated';\nCOMMIT;",
            scope,
          ),
        );
        assert.equal(
          sql(
            `SELECT payload FROM public.ai_conversations WHERE user_id='${selected}'`,
          ),
          "preserved",
        );
        sql(`DELETE FROM public.${relation} WHERE payload='unapproved'`);
      }
    }
  });
  it("rejects foreign Auth identities and new public durable relations", () => {
    sql(`INSERT INTO auth.identities(user_id) VALUES ('${unrelated}')`);
    rejectsSql(guardTargetMutationSql(quarantineTemplate, scope));
    sql(
      `DELETE FROM auth.identities WHERE user_id='${unrelated}'; CREATE TABLE public.unapproved_relation (user_id uuid)`,
    );
    try {
      rejectsSql(
        guardTargetMutationSql(quarantineTemplate, scope),
        /unapproved public relations/u,
      );
    } finally {
      sql("DROP TABLE public.unapproved_relation");
    }
  });
  it("catches same-count OAuth content drift under the mutation lock", () => {
    const expected = expectedReset();
    sql("UPDATE public.oauth_tokens SET payload='changed after receipt'");
    rejectsSql(
      renderResetSql(resetTemplate, expected, syntheticTombstone, scope),
      /rows drifted/u,
    );
    assert.equal(
      sql("SELECT access_token FROM public.oauth_tokens"),
      syntheticToken,
    );
  });
  it("rolls back a trigger-created foreign owner detected by the post-mutation guard", () => {
    sql(
      `CREATE FUNCTION public.fixture_foreign_owner() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      INSERT INTO public.user_memory(user_id,payload) VALUES ('${unrelated}','side effect'); RETURN NEW; END$$;
      CREATE TRIGGER fixture_foreign_owner AFTER UPDATE ON public.calendar_accounts FOR EACH ROW EXECUTE FUNCTION public.fixture_foreign_owner();`,
    );
    try {
      rejectsSql(guardTargetMutationSql(quarantineTemplate, scope));
      assert.equal(
        sql("SELECT watch_status FROM public.calendar_accounts"),
        "active",
      );
      assert.equal(sql("SELECT count(*) FROM public.user_memory"), "0");
    } finally {
      sql(
        "DROP TRIGGER fixture_foreign_owner ON public.calendar_accounts; DROP FUNCTION public.fixture_foreign_owner()",
      );
    }
  });
  it("holds locks on Auth and every scoped table until commit", async () => {
    const owner = session();
    await owner.send(
      `BEGIN; ${targetSubjectScopeGuardSql(scope, { lock: true })}`,
    );
    for (
      const [schema, relation, column] of [["auth", "users", "id"], [
        "auth",
        "identities",
        "user_id",
      ], ...scopes.map(([relation, column]) => ["public", relation, column])]
    ) {
      rejectsSql(
        `SET lock_timeout='25ms'; INSERT INTO ${schema}.${relation} (${column}) VALUES ('${unrelated}')`,
        /lock timeout/u,
      );
    }
    await owner.send("ROLLBACK;");
    owner.child.stdin.end();
    await owner.done;
    sql(`INSERT INTO auth.users VALUES ('${unrelated}')`);
    assert.equal(sql("SELECT count(*) FROM auth.users"), "2");
  });
  it("detects rows committed before lock acquisition and never writes them", async () => {
    const writer = session();
    await writer.send(
      `BEGIN; INSERT INTO public.user_memory(user_id,payload) VALUES ('${unrelated}','late writer');`,
    );
    const mutator = session();
    mutator.child.stdin.end(guardTargetMutationSql(quarantineTemplate, scope));
    // Writer owns the table lock first; the guarded mutation cannot pass it.
    await writer.send("COMMIT;");
    writer.child.stdin.end();
    await writer.done;
    const result = await mutator.done;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside the approved subject scope/u);
    assert.equal(
      sql("SELECT watch_status FROM public.calendar_accounts"),
      "active",
    );
  });
});
