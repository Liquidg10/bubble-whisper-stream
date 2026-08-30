import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { importTransactionGuards } from "../lib/import-subject-package.mjs";
import { subjectScopeBinding } from "../lib/migration-subject-scope.mjs";
import {
  buildImportCommands,
  validatePostImportTarget,
  validatePreImportTarget,
} from "../import-isolated-supabase-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scopes = readFileSync(
  join(root, "supabase/isolation/mind-manual-data-scopes.tsv"),
  "utf8",
)
  .split(/\r?\n/u).filter((line) => line && !line.startsWith("#")).map((line) =>
    line.split("\t")
  );
const tables = [
  { schema: "auth", name: "users", owner: "id", count: 1 },
  { schema: "auth", name: "identities", owner: "user_id", count: 1 },
  ...scopes.map(([name, owner, copyMode]) => ({
    schema: "public",
    name,
    owner,
    count: copyMode === "skip_transient" ? 0 : 1,
  })),
];
const selected = "10000000-0000-4000-8000-000000000001";
const unrelated = "20000000-0000-4000-8000-000000000002";
const binding = subjectScopeBinding({
  version: 1,
  kind: "mind_manual_subject_scope",
  sourceProjectRef: "ekekeywoxvdbfbmqyhjy",
  targetProjectRef: "abcdefghijklmnopqrst",
  subjectIds: [selected],
  legacyStorageAssignments: [],
});
// Never honor PG*, DATABASE_URL, or an existing service. This suite starts a
// disposable local PostgreSQL cluster with a private Unix socket and no TCP.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
);
let pgBin, scratch, started = false, source;
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
  "--no-psqlrc",
  "--quiet",
  "--tuples-only",
  "--no-align",
  "--set",
  "ON_ERROR_STOP=1",
  "--host",
  scratch,
  "--port",
  "5432",
  "--username",
  "postgres",
  "--dbname",
  "postgres",
];
function sql(statement) {
  const result = command("psql", psqlArgs(), { input: statement });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function rejectsSql(statement, pattern) {
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
const tableName = ({ schema, name }) => `${schema}.${name}`;
function rowInsert(table, owner = selected, payload = "synthetic data") {
  return `INSERT INTO ${tableName(table)} (id, ${
    table.owner === "id" ? "" : "user_id,"
  } payload)
    VALUES ('${owner}', ${
    table.owner === "id" ? "" : `'${owner}',`
  } '${payload}');`;
}
function inventory() {
  return JSON.parse(sql(`SELECT json_agg(row_to_json(inventory)) FROM (
    ${
    tables.map((table) =>
      `SELECT '${tableName(table)}' AS relation, count(*)::integer AS count,
      encode(extensions.digest(convert_to(COALESCE(string_agg(to_jsonb(r)::text, E'\\n' ORDER BY to_jsonb(r)::text), ''), 'UTF8'), 'sha256'), 'hex') AS digest
      FROM ${tableName(table)} r`
    ).join(" UNION ALL ")
  }) inventory;`));
}
function copyCommands() {
  return tables.map((table) =>
    `\\copy ${tableName(table)} FROM '${
      join(scratch, "data", `${tableName(table)}.bin`)
    }' WITH (FORMAT binary)`
  ).join("\n");
}
function importCommands({ afterCopySql = "", receipt = source } = {}) {
  const guards = importTransactionGuards(receipt);
  const manifest = {
    files: tables.map((table) => ({
      logicalName: tableName(table),
      relativePath: `data/${tableName(table)}.bin`,
    })),
  };
  const commands = buildImportCommands(manifest, scratch, receipt);
  return afterCopySql
    ? commands.replace(guards.afterCopy, `${afterCopySql}\n${guards.afterCopy}`)
    : commands;
}
function assertEmpty() {
  assert.ok(
    inventory().every((row) => row.count === 0),
    "failed import must roll back every relation",
  );
}

describe(
  "subject-scoped import guards — real local PostgreSQL and binary COPY",
  { concurrency: false },
  () => {
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
      scratch = mkdtempSync(join(tmpdir(), "mind-manual-subject-import-pg-"));
      assert.equal(
        command("initdb", [
          "-D",
          join(scratch, "pgdata"),
          "-U",
          "postgres",
          "--auth=trust",
          "--no-locale",
          "--encoding=UTF8",
        ]).status,
        0,
      );
      const start = command("pg_ctl", [
        "-D",
        join(scratch, "pgdata"),
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
      ${
          tables.map((table) =>
            `CREATE TABLE ${tableName(table)} (id uuid PRIMARY KEY, ${
              table.owner === "id" ? "" : "user_id uuid,"
            } payload text);`
          ).join("\n")
        }
      ${
          tables.filter((table) => table.count > 0).map((table) =>
            rowInsert(table)
          ).join("\n")
        }
      UPDATE public.calendar_events SET payload=E'tab\\tnewline\\nUnicode Ω';`,
      );
      const rows = inventory();
      const users = rows.find((row) => row.relation === "auth.users");
      const identities = rows.find((row) => row.relation === "auth.identities");
      source = {
        subjectScope: binding,
        auth: {
          userCount: users.count,
          subjectIdsSha256: binding.subjectIdsSha256,
          usersSha256: users.digest,
          identityCount: identities.count,
          identitiesSha256: identities.digest,
        },
        publicData: scopes.map(([relation]) => {
          const row = rows.find((entry) =>
            entry.relation === `public.${relation}`
          );
          return {
            relation,
            copyRowCount: row.count,
            copyRowsSha256: row.digest,
          };
        }),
      };
      // Actual binary artifacts are produced locally and imported by the same psql
      // mode the release script uses, including explicit QUIET-off COPY receipts.
      mkdirSync(join(scratch, "data"), { mode: 0o700 });
      sql(
        tables.map((table) =>
          `\\copy ${tableName(table)} TO '${
            join(scratch, "data", `${tableName(table)}.bin`)
          }' WITH (FORMAT binary)`
        ).join("\n"),
      );
      for (const table of tables) {
        chmodSync(join(scratch, "data", `${tableName(table)}.bin`), 0o600);
      }
    });
    beforeEach(async () => {
      for (const handle of sessions) handle.child.stdin.end("ROLLBACK;\n");
      await Promise.all([...sessions].map((handle) => handle.done));
      sql(`TRUNCATE ${tables.map(tableName).join(", ")};`);
    });
    after(async () => {
      for (const handle of sessions) handle.child.stdin.end("ROLLBACK;\n");
      await Promise.all([...sessions].map((handle) => handle.done));
      if (started) {
        assert.equal(
          command("pg_ctl", [
            "-D",
            join(scratch, "pgdata"),
            "-m",
            "immediate",
            "-w",
            "stop",
          ]).status,
          0,
        );
      }
      // Delete only this test's exact mkdtemp-created disposable local cluster.
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    });
    it("imports all 34 exact binary files, emits COPY receipts despite --quiet, and verifies full row digests", () => {
      assert.equal(tables.length, 34);
      const output = sql(importCommands());
      assert.deepEqual(
        [...output.matchAll(/^COPY\s+(\d+)$/gmu)].map((match) =>
          Number(match[1])
        ),
        tables.map((table) => table.count),
      );
      const rows = inventory();
      for (const table of tables) {
        const row = rows.find((entry) => entry.relation === tableName(table));
        assert.equal(row.count, table.count);
        if (table.schema === "public") {
          assert.equal(
            row.digest,
            source.publicData.find((entry) => entry.relation === table.name)
              .copyRowsSha256,
          );
        } else {assert.equal(
            row.digest,
            source
              .auth[
                table.name === "users" ? "usersSha256" : "identitiesSha256"
              ],
          );}
      }
      assert.equal(
        sql("SELECT payload FROM public.calendar_events"),
        "tab\tnewline\nUnicode Ω",
      );
    });
    it("refuses nonempty target state in every Auth/public table before copying anything", () => {
      for (const table of tables) {
        sql(rowInsert(table, unrelated));
        const result = rejectsSql(
          importCommands(),
          /Target changed after preflight; import refused/u,
        );
        assert.doesNotMatch(result.stdout, /^COPY\s+/mu);
        assert.equal(inventory().reduce((sum, row) => sum + row.count, 0), 1);
        sql(`TRUNCATE ${tableName(table)};`);
      }
    });
    it("rejects same-count wrong subjects after COPY and rolls back all tables", () => {
      for (const table of tables.filter((table) => table.count > 0)) {
        rejectsSql(
          importCommands({
            afterCopySql: `UPDATE ${
              tableName(table)
            } SET ${table.owner}='${unrelated}';`,
          }),
          /transactional copy parity failed|outside approved subject scope/u,
        );
        assertEmpty();
      }
    });
    it("rejects same-count content edits in every copied relation, not just owner identifiers", () => {
      for (const table of tables.filter((table) => table.count > 0)) {
        rejectsSql(
          importCommands({
            afterCopySql: `UPDATE ${
              tableName(table)
            } SET payload='changed while copying';`,
          }),
          /transactional copy parity failed/u,
        );
        assertEmpty();
      }
    });
    it("rejects missing selected rows and injected transient OAuth state before commit", () => {
      rejectsSql(
        importCommands({ afterCopySql: "DELETE FROM public.calendar_events;" }),
        /transactional copy parity failed/u,
      );
      assertEmpty();
      const transient = tables.find((table) => table.name === "oauth_state");
      rejectsSql(
        importCommands({ afterCopySql: rowInsert(transient) }),
        /transactional copy parity failed/u,
      );
      assertEmpty();
    });
    it("rejects a forged matching row digest whose actual Auth subjects differ from the approved binding", () => {
      const forged = structuredClone(source);
      forged.auth.usersSha256 = sql(
        `SELECT encode(extensions.digest(convert_to(to_jsonb(r)::text, 'UTF8'), 'sha256'), 'hex')
      FROM (SELECT '${unrelated}'::uuid AS id, 'synthetic data'::text AS payload) r;`,
      );
      forged.auth.identitiesSha256 = sql(
        `SELECT encode(extensions.digest(convert_to(to_jsonb(r)::text, 'UTF8'), 'sha256'), 'hex')
      FROM (SELECT '${selected}'::uuid AS id, '${unrelated}'::uuid AS user_id, 'synthetic data'::text AS payload) r;`,
      );
      rejectsSql(
        importCommands({
          receipt: forged,
          afterCopySql:
            `UPDATE auth.users SET id='${unrelated}'; UPDATE auth.identities SET user_id='${unrelated}';`,
        }),
        /Target Auth does not match approved subject scope|outside approved subject scope/u,
      );
      assertEmpty();
    });
    it("rejects self-consistent forged public row digests outside the approved owner set", () => {
      const forged = structuredClone(source);
      forged.publicData.find((row) => row.relation === "ai_conversations")
        .copyRowsSha256 = sql(`
      SELECT encode(extensions.digest(convert_to(to_jsonb(r)::text, 'UTF8'), 'sha256'), 'hex')
      FROM (SELECT '${selected}'::uuid AS id, '${unrelated}'::uuid AS user_id, 'synthetic data'::text AS payload) r;`);
      rejectsSql(
        importCommands({
          receipt: forged,
          afterCopySql:
            `UPDATE public.ai_conversations SET user_id='${unrelated}';`,
        }),
        /outside approved subject scope/u,
      );
      assertEmpty();
    });
    it("permits only known pending-storage absence in pre/post import, not unrelated blockers", () => {
      const columnFingerprint = "a".repeat(64);
      const sourceReceipt = {
        ...source,
        storage: { objects: [{ bucket: "photos" }] },
        auth: {
          ...source.auth,
          usersColumnFingerprintSha256: columnFingerprint,
          identitiesColumnFingerprintSha256: columnFingerprint,
        },
      };
      const targetReceipt = {
        kind: "target",
        subjectScope: binding,
        excludedPublicRelations: [],
        publicData: scopes.map(([relation]) => ({
          relation,
          totalRowCount: 0,
        })),
        auth: {
          userCount: 0,
          identityCount: 0,
          usersColumnFingerprintSha256: columnFingerprint,
          identitiesColumnFingerprintSha256: columnFingerprint,
        },
        blockers: ["storage missing from target: photos"],
      };
      for (
        const validate of [validatePreImportTarget, validatePostImportTarget]
      ) {
        assert.doesNotThrow(() => validate(targetReceipt, sourceReceipt));
        for (
          const blocker of [
            "storage missing from target: unapproved",
            "missing private storage bucket: photos",
            "target Auth contains users, identities, or sessions outside the approved subject scope",
            "row-level security is disabled: profiles",
          ]
        ) {
          assert.throws(() =>
            validate({ ...targetReceipt, blockers: [blocker] }, sourceReceipt)
          );
        }
      }
      assert.throws(
        () =>
          validatePreImportTarget({
            ...targetReceipt,
            auth: { ...targetReceipt.auth, userCount: 1 },
          }, sourceReceipt),
        /Auth is not empty/u,
      );
      assert.throws(
        () =>
          validatePostImportTarget({
            ...targetReceipt,
            blockers: ["Auth identity mismatch: usersSha256"],
          }, sourceReceipt),
        /parity failed/u,
      );
    });
    it("refuses incomplete, negative-count or malformed-digest parity inventories before SQL", () => {
      for (
        const mutate of [
          (receipt) => {
            receipt.publicData.pop();
          },
          (receipt) => {
            receipt.auth.userCount = -1;
          },
          (receipt) => {
            receipt.auth.identitiesSha256 = "invalid";
          },
          (receipt) => {
            receipt.publicData[0].copyRowsSha256 = "invalid";
          },
        ]
      ) {
        const receipt = structuredClone(source);
        mutate(receipt);
        assert.throws(
          () => importTransactionGuards(receipt),
          /parity inventory/u,
        );
      }
    });
    it("locks every table until after final parity, so no concurrent writer can slip through the snapshot", async () => {
      const guards = importTransactionGuards(source);
      const importer = session();
      await importer.send(
        `BEGIN; ${guards.beforeCopy}\n${copyCommands()}\n${guards.afterCopy}`,
      );
      for (const table of tables) {
        rejectsSql(
          `SET lock_timeout='25ms'; ${rowInsert(table, unrelated)}`,
          /lock timeout/u,
        );
      }
      await importer.send("ROLLBACK;");
      importer.child.stdin.end();
      await importer.done;
      assertEmpty();
      sql(rowInsert(tables[0], unrelated));
      assert.equal(sql("SELECT count(*) FROM auth.users"), "1");
    });
    it("rejects a writer that commits between preflight and lock acquisition, before any COPY", async () => {
      const writer = session();
      const target = tables.find((table) => table.name === "user_memory");
      await writer.send(`BEGIN; ${rowInsert(target, unrelated)}`);
      const importer = session();
      importer.child.stdin.end(importCommands());
      await writer.send("COMMIT;");
      writer.child.stdin.end();
      await writer.done;
      const result = await importer.done;
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /Target changed after preflight; import refused/u,
      );
      assert.doesNotMatch(result.stdout, /^COPY\s+/mu);
      assert.equal(inventory().reduce((sum, row) => sum + row.count, 0), 1);
    });
  },
);
