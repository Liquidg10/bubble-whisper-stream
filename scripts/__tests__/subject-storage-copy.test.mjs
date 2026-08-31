import assert from "node:assert/strict";
import { expectedMigrationGuardContract } from "../lib/migration-guard-catalog.mjs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { runStorageCopy } from "../copy-isolated-supabase-storage.mjs";
import { subjectScopeBinding } from "../lib/migration-subject-scope.mjs";
import {
  canonicalJson,
  sha256,
  sha256File,
} from "../lib/supabase-isolation.mjs";

const SOURCE_REF = "ekekeywoxvdbfbmqyhjy";
const TARGET_REF = "abcdefghijklmnopqrst";
const SELECTED = "11111111-1111-4111-8111-111111111111";
const OUTSIDE = "22222222-2222-4222-8222-222222222222";
const NEW_USER = "33333333-3333-4333-8333-333333333333";
const BUCKETS = ["photos", "voice-samples"];
const tempDirectories = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function privateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function object(bucket, path, bytes, { ownerId, targetPath } = {}) {
  return { bucket, path, contents: Buffer.from(bytes), ownerId, targetPath };
}

function defaultObjects() {
  return [
    object("photos", `${SELECTED}/a b.png`, "selected photo", {
      ownerId: SELECTED,
      targetPath: `${SELECTED}/a b.png`,
    }),
    object("photos", `${OUTSIDE}/commerce.png`, "private commerce photo", {
      ownerId: OUTSIDE,
    }),
    object("photos", "legacy-own.png", "legacy selected photo", {
      targetPath: `${SELECTED}/legacy-own.png`,
    }),
    object("photos", "legacy-outside.png", "private legacy commerce photo"),
    object("voice-samples", `${SELECTED}/voice.webm`, "selected voice", {
      ownerId: SELECTED,
      targetPath: `${SELECTED}/voice.webm`,
    }),
    object("voice-samples", `${OUTSIDE}/voice.webm`, "private commerce voice", {
      ownerId: OUTSIDE,
    }),
  ];
}

function scopeManifest(assignments = [
  {
    bucket: "photos",
    pathSha256: sha256("legacy-own.png"),
    ownerSubjectId: SELECTED,
  },
  {
    bucket: "photos",
    pathSha256: sha256("legacy-outside.png"),
    ownerSubjectId: OUTSIDE,
  },
]) {
  return {
    version: 1,
    kind: "mind_manual_subject_scope",
    sourceProjectRef: SOURCE_REF,
    targetProjectRef: TARGET_REF,
    subjectIds: [SELECTED],
    legacyStorageAssignments: assignments,
  };
}

function sourceReceipt(scope, objects) {
  const selected = objects.filter((item) => item.targetPath);
  return {
    version: 1,
    kind: "source",
    projectRef: SOURCE_REF,
    status: "ready",
    blockers: [],
    subjectScope: subjectScopeBinding(scope),
    catalog: { migrationGuard: expectedMigrationGuardContract() },
    auth: { userCount: 1, subjectIdsSha256: sha256(SELECTED) },
    storage: {
      objects: BUCKETS.map((bucket) => {
        const rows = selected.filter((item) => item.bucket === bucket);
        return {
          bucket,
          objectCount: rows.length,
          totalBytes: rows.reduce((sum, row) => sum + row.contents.length, 0),
          pathManifestSha256: sha256(
            rows.map((row) => row.path).sort().join("\n"),
          ),
          targetPathManifestSha256: sha256(
            rows.map((row) => row.targetPath).sort().join("\n"),
          ),
        };
      }),
    },
  };
}

function identity(bucket, path) {
  return `${bucket}\0${path}`;
}

function mockTransport(initialSource) {
  const source = new Map(
    initialSource.map((
      item,
    ) => [identity(item.bucket, item.path), { ...item }]),
  );
  const target = new Map();
  const sourceUsers = [SELECTED, OUTSIDE];
  const targetUsers = [SELECTED];
  const targetBuckets = BUCKETS.map((name) => ({
    id: name,
    name,
    public: false,
  }));
  const requests = [];
  let signedUrlTransform = (value) => value;
  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetch = async (input, options = {}) => {
    const url = new URL(input);
    const project = url.hostname.split(".")[0];
    assert.ok(
      [SOURCE_REF, TARGET_REF].includes(project),
      "no external host is allowed",
    );
    const store = project === SOURCE_REF ? source : target;
    const method = options.method ?? "GET";
    const route = decodeURIComponent(url.pathname);
    const request = { project, method, route, kind: "metadata" };
    requests.push(request);
    if (route === "/storage/v1/bucket") {
      assert.equal(
        project,
        TARGET_REF,
        "global bucket inventory is target-only",
      );
      assert.equal(method, "GET");
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return json(
        [...targetBuckets].sort((a, b) => a.id.localeCompare(b.id)).slice(
          offset,
          offset + limit,
        ),
      );
    }
    if (route.startsWith("/auth/v1/admin/users/")) {
      assert.equal(
        project,
        SOURCE_REF,
        "individual Auth lookups are source-only",
      );
      const id = route.slice("/auth/v1/admin/users/".length);
      return sourceUsers.includes(id) ? json({ id }) : json({}, 404);
    }
    if (route === "/auth/v1/admin/users") {
      assert.equal(
        project,
        TARGET_REF,
        "never list unrelated source Auth users",
      );
      const users = project === SOURCE_REF ? sourceUsers : targetUsers;
      const offset = (Number(url.searchParams.get("page")) - 1) * 100;
      return json({
        users: users.slice(offset, offset + 100).map((id) => ({ id })),
      });
    }
    const listPrefix = "/storage/v1/object/list/";
    if (route.startsWith(listPrefix)) {
      const bucket = route.slice(listPrefix.length);
      const { prefix, offset, limit } = JSON.parse(options.body);
      const listed = new Map();
      for (const item of store.values()) {
        if (item.bucket !== bucket || !item.path.startsWith(prefix)) continue;
        const rest = item.path.slice(prefix.length);
        if (!rest) continue;
        const segment = rest.split("/")[0];
        if (rest.includes("/")) {
          listed.set(segment, { id: null, name: segment });
        } else {
          listed.set(segment, {
            id: sha256(item.path),
            name: segment,
            owner_id: item.ownerId,
            metadata: {
              size: item.contents.length,
              mimetype: "application/octet-stream",
            },
          });
        }
      }
      return json(
        [...listed.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(
          offset,
          offset + limit,
        ),
      );
    }
    const objectMatch = route.match(
      /^\/storage\/v1\/object\/(authenticated\/|sign\/)?([^/]+)\/(.+)$/u,
    );
    assert.ok(objectMatch, `unexpected mock route ${route}`);
    const [, action = "", bucket, path] = objectMatch;
    request.bucket = bucket;
    request.path = path;
    const stored = store.get(identity(bucket, path));
    if (action === "authenticated/" && method === "GET") {
      request.kind = "download";
      return stored
        ? new Response(stored.contents)
        : new Response(null, { status: 404 });
    }
    if (action === "sign/" && method === "POST") {
      request.kind = "sign";
      if (!stored) return new Response(null, { status: 404 });
      const encoded = `${encodeURIComponent(bucket)}/${
        path.split("/").map(encodeURIComponent).join("/")
      }`;
      return json({
        signedURL: signedUrlTransform(
          `/object/sign/${encoded}?token=offline-test-only`,
        ),
      });
    }
    if (action === "sign/" && method === "GET") {
      request.kind = "signed_download";
      return stored
        ? new Response(stored.contents.subarray(0, 1))
        : new Response(null, { status: 404 });
    }
    if (!action && method === "POST") {
      request.kind = "upload";
      assert.equal(
        options.headers["x-upsert"],
        "false",
        "copy must never overwrite",
      );
      if (stored) return new Response(null, { status: 409 });
      assert.equal(project, TARGET_REF, "source is read-only");
      store.set(identity(bucket, path), object(bucket, path, options.body));
      return json({});
    }
    throw new Error("unhandled mock operation");
  };
  return {
    fetch,
    source,
    target,
    sourceUsers,
    targetUsers,
    targetBuckets,
    requests,
    setSignedUrlTransform(value) {
      signedUrlTransform = value;
    },
  };
}

function harness({ scope = scopeManifest(), objects = defaultObjects() } = {}) {
  const directory = mkdtempSync(
    join(tmpdir(), "mind-manual-subject-storage-test-"),
  );
  tempDirectories.push(directory);
  const scopePath = join(directory, "scope.json");
  const sourcePath = join(directory, "source.json");
  privateJson(scopePath, scope);
  privateJson(sourcePath, sourceReceipt(scope, objects));
  const transport = mockTransport(objects);
  const output = [];
  const args = (receipt = "plan.json") => [
    "--subject-scope",
    scopePath,
    "--source-receipt",
    sourcePath,
    "--target-ref",
    TARGET_REF,
    "--receipt",
    join(directory, receipt),
  ];
  const run = (argv = args(), extra = {}) =>
    runStorageCopy(argv, {
      fetch: transport.fetch,
      env: {
        MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY: "offline-source",
        MIND_MANUAL_TARGET_SERVICE_ROLE_KEY: "offline-target",
      },
      logger: { log: (value) => output.push(value) },
      ...extra,
    });
  const executeArgs = (plan = "plan.json", receipt = "verified.json") => [
    ...args(receipt),
    "--execute",
    "--plan-receipt",
    join(directory, plan),
    "--confirmation",
    `COPY_STORAGE:${TARGET_REF}:${
      sha256File(join(directory, plan)).slice(0, 12)
    }`,
  ];
  return {
    directory,
    scope,
    scopePath,
    sourcePath,
    transport,
    args,
    run,
    executeArgs,
    output,
  };
}

function objectRequests(h) {
  return h.transport.requests.filter((request) => request.kind !== "metadata");
}

function noCredentialAccess() {
  let reads = 0;
  return {
    env: new Proxy({}, {
      get() {
        reads += 1;
        throw new Error("credentials must not be read");
      },
    }),
    assertUntouched() {
      assert.equal(reads, 0);
    },
  };
}

describe("subject-scoped storage migration with offline transport", () => {
  it("rejects missing or forged source guard catalog before credentials and network", async () => {
    for (const migrationGuard of [undefined, {}, { version: 1 }]) {
      const h = harness();
      const source = JSON.parse(readFileSync(h.sourcePath, "utf8"));
      source.catalog = { migrationGuard };
      privateJson(h.sourcePath, source);
      const credentials = noCredentialAccess();
      await assert.rejects(() => h.run(h.args(), { env: credentials.env }), /guard catalog/u);
      credentials.assertUntouched();
      assert.equal(h.transport.requests.length, 0);
    }
  });
  it("requires an explicit scope before credential access or network", async () => {
    const h = harness();
    const credentials = noCredentialAccess();
    await assert.rejects(
      h.run(h.args().slice(2), { env: credentials.env }),
      /subject-scope/u,
    );
    credentials.assertUntouched();
    assert.equal(h.transport.requests.length, 0);
  });

  it("rejects an old unscoped source receipt before credential access", async () => {
    const h = harness();
    const receipt = JSON.parse(readFileSync(h.sourcePath, "utf8"));
    delete receipt.subjectScope;
    privateJson(h.sourcePath, receipt);
    const credentials = noCredentialAccess();
    await assert.rejects(
      h.run(h.args(), { env: credentials.env }),
      /source receipt/u,
    );
    credentials.assertUntouched();
    assert.equal(h.transport.requests.length, 0);
  });

  for (
    const [label, alter] of [
      [
        "unknown",
        (buckets) =>
          buckets.push({ id: "unrelated", name: "unrelated", public: false }),
      ],
      ["public", (buckets) => {
        buckets[0].public = true;
      }],
      ["missing", (buckets) => buckets.pop()],
      ["duplicate", (buckets) => buckets.push({ ...buckets[0] })],
      ["renamed", (buckets) => {
        buckets[0].name = "other";
      }],
      ["missing privacy flag", (buckets) => {
        delete buckets[0].public;
      }],
    ]
  ) {
    it(`rejects ${label} target buckets before reading or writing any object bytes`, async () => {
      const h = harness();
      alter(h.transport.targetBuckets);
      await assert.rejects(h.run(), /exactly the approved private bucket set/u);
      assert.equal(objectRequests(h).length, 0);
      assert.equal(h.transport.target.size, 0);
    });
  }

  it("rejects a READY source receipt that still reports blockers before credentials", async () => {
    const h = harness();
    const receipt = JSON.parse(readFileSync(h.sourcePath, "utf8"));
    receipt.blockers = ["unresolved boundary"];
    privateJson(h.sourcePath, receipt);
    const credentials = noCredentialAccess();
    await assert.rejects(
      h.run(h.args(), { env: credentials.env }),
      /ready canonical source receipt/u,
    );
    credentials.assertUntouched();
    assert.equal(h.transport.requests.length, 0);
  });

  it("malformed private receipt JSON never discloses its raw text", async () => {
    const h = harness();
    writeFileSync(h.sourcePath, `private-path-${SELECTED} is malformed`, {
      mode: 0o600,
    });
    const credentials = noCredentialAccess();
    await assert.rejects(h.run(h.args(), { env: credentials.env }), (error) => {
      assert.equal(error.message, "invalid JSON in source receipt");
      assert.equal(error.message.includes(SELECTED), false);
      return true;
    });
    credentials.assertUntouched();
    assert.equal(h.transport.requests.length, 0);
  });

  it("plans, copies, and revalidates only selected bytes; receipts contain no subjects or raw paths", async () => {
    const h = harness();
    const plan = await h.run();
    assert.equal(plan.status, "planned_not_copied");
    assert.equal(plan.objectCount, 3);
    assert.equal(plan.remappedPathCount, 1);
    assert.equal(h.transport.target.size, 0, "default mode does not upload");
    const verified = await h.run(h.executeArgs());
    assert.equal(verified.status, "verified");
    assert.equal(verified.objects.filter((item) => item.copied).length, 3);
    assert.ok(verified.objects.every((item) => item.signedUrlVerified));
    const revalidation = await h.run([
      ...h.args("revalidation.json"),
      "--verify-only",
      "--compare-receipt",
      join(h.directory, "verified.json"),
    ]);
    assert.equal(revalidation.status, "verified_revalidation");
    for (const receipt of [plan, verified, revalidation]) {
      assert.deepEqual(receipt.subjectScope, subjectScopeBinding(h.scope));
      const serialized = canonicalJson(receipt);
      assert.equal(serialized.includes(SELECTED), false);
      assert.equal(serialized.includes(OUTSIDE), false);
      assert.equal(serialized.includes("legacy-own.png"), false);
      assert.equal(receipt.rawObjectPathsIncluded, false);
      assert.equal(receipt.sourceSecretValueIncluded, false);
      assert.equal(receipt.targetSecretValueIncluded, false);
    }
    for (const request of objectRequests(h)) {
      assert.equal(
        request.path.includes(OUTSIDE),
        false,
        "unselected prefixed bytes must never be touched",
      );
      assert.equal(
        request.path.includes("legacy-outside.png"),
        false,
        "explicitly excluded flat bytes must never be touched",
      );
      if (request.project === TARGET_REF) {
        assert.ok(request.path.startsWith(`${SELECTED}/`));
      }
    }
    assert.equal(
      objectRequests(h).filter((request) => request.kind === "upload").length,
      3,
    );
    const sourceAuthRequests = h.transport.requests.filter((request) =>
      request.project === SOURCE_REF && request.route.startsWith("/auth/v1/")
    );
    assert.ok(
      sourceAuthRequests.every((request) =>
        request.route === `/auth/v1/admin/users/${SELECTED}`
      ),
    );
  });

  it("unrelated source signups and storage changes do not invalidate a selected plan or revalidation", async () => {
    const h = harness();
    await h.run();
    h.transport.sourceUsers.push(NEW_USER);
    h.transport.source.set(
      identity("photos", `${NEW_USER}/new.png`),
      object("photos", `${NEW_USER}/new.png`, "unselected new upload", {
        ownerId: NEW_USER,
      }),
    );
    h.transport.source.get(identity("photos", `${OUTSIDE}/commerce.png`))
      .contents = Buffer.from("unselected changed bytes");
    await h.run(h.executeArgs());
    h.transport.source.delete(identity("photos", `${NEW_USER}/new.png`));
    h.transport.sourceUsers.splice(
      h.transport.sourceUsers.indexOf(NEW_USER),
      1,
    );
    await h.run([
      ...h.args("revalidation.json"),
      "--verify-only",
      "--compare-receipt",
      join(h.directory, "verified.json"),
    ]);
    assert.ok(
      objectRequests(h).every((request) =>
        !request.path.includes(NEW_USER) && !request.path.includes(OUTSIDE)
      ),
    );
  });

  it("does not infer flat-object ownership from a sole source user", async () => {
    const h = harness({
      scope: scopeManifest([]),
      objects: [object("photos", "unassigned.png", "private")],
    });
    h.transport.sourceUsers.splice(0, 2, SELECTED);
    await assert.rejects(h.run(), /Ambiguous legacy storage ownership/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("rejects all ambiguous entries before downloading earlier selected objects", async () => {
    const h = harness();
    h.transport.source.set(
      identity("voice-samples", "zzz-unassigned.webm"),
      object("voice-samples", "zzz-unassigned.webm", "ambiguous"),
    );
    await assert.rejects(h.run(), /Ambiguous legacy storage ownership/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("rejects a selected folder whose metadata owner differs, before any byte request", async () => {
    const h = harness();
    h.transport.source.get(identity("photos", `${SELECTED}/a b.png`)).ownerId =
      OUTSIDE;
    await assert.rejects(h.run(), /folder and owner metadata conflict/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("rejects a legacy assignment whose metadata owner differs", async () => {
    const h = harness();
    h.transport.source.get(identity("photos", "legacy-own.png")).ownerId =
      OUTSIDE;
    await assert.rejects(h.run(), /assignment and owner metadata conflict/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("excludes unassigned legacy objects with an explicit unselected metadata owner", async () => {
    const h = harness();
    h.transport.source.set(
      identity("photos", "outside-owner-only.png"),
      object("photos", "outside-owner-only.png", "outside bytes", {
        ownerId: OUTSIDE,
      }),
    );
    const plan = await h.run();
    assert.equal(plan.objectCount, 3);
    assert.ok(
      objectRequests(h).every((request) =>
        request.path !== "outside-owner-only.png"
      ),
    );
  });

  it("rejects an existing selected target path whose metadata owner is unselected before reading bytes", async () => {
    const h = harness();
    h.transport.target.set(
      identity("photos", `${SELECTED}/a b.png`),
      object("photos", `${SELECTED}/a b.png`, "selected photo", {
        ownerId: OUTSIDE,
      }),
    );
    await assert.rejects(h.run(), /folder and owner metadata conflict/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("requires every selected legacy assignment to exist", async () => {
    const h = harness();
    h.transport.source.delete(identity("photos", "legacy-own.png"));
    await assert.rejects(h.run(), /assignment is absent/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("an excluded legacy deletion and reappearance do not invalidate the selected copy", async () => {
    const h = harness();
    h.transport.source.delete(identity("photos", "legacy-outside.png"));
    await h.run();
    h.transport.source.set(
      identity("photos", "legacy-outside.png"),
      object("photos", "legacy-outside.png", "new unrelated legacy bytes"),
    );
    await h.run(h.executeArgs());
    assert.ok(
      objectRequests(h).every((request) =>
        !request.path.includes("legacy-outside.png")
      ),
    );
  });

  it("rejects selected source paths that collide after legacy remapping", async () => {
    const h = harness();
    h.transport.source.set(
      identity("photos", `${SELECTED}/legacy-own.png`),
      object("photos", `${SELECTED}/legacy-own.png`, "collision", {
        ownerId: SELECTED,
      }),
    );
    await assert.rejects(h.run(), /collide after storage remapping/u);
    assert.equal(objectRequests(h).length, 0);
  });

  for (
    const targetPath of [
      `${OUTSIDE}/commerce.png`,
      `${SELECTED}/unexpected.png`,
    ]
  ) {
    it(`rejects target ${targetPath.startsWith(OUTSIDE) ? "unselected-owner" : "extra selected-owner"} paths before object reads`, async () => {
      const h = harness();
      h.transport.target.set(
        identity("photos", targetPath),
        object("photos", targetPath, "extra"),
      );
      await assert.rejects(h.run(), /outside the approved source selection/u);
      assert.equal(objectRequests(h).length, 0);
    });
  }

  it("requires the target Auth set to equal selected subjects, not all source users", async () => {
    const h = harness();
    h.transport.targetUsers.push(OUTSIDE);
    await assert.rejects(h.run(), /target Auth subject IDs/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("rejects a missing selected source Auth user", async () => {
    const h = harness();
    h.transport.sourceUsers.splice(
      h.transport.sourceUsers.indexOf(SELECTED),
      1,
    );
    await assert.rejects(h.run(), /approved source Auth subjects are missing/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("rejects a swapped-scope plan before credentials or network even with its exact token", async () => {
    const h = harness();
    const plan = await h.run();
    plan.subjectScope = subjectScopeBinding({
      ...h.scope,
      subjectIds: [OUTSIDE],
    });
    privateJson(join(h.directory, "swapped.json"), plan);
    h.transport.requests.length = 0;
    const credentials = noCredentialAccess();
    await assert.rejects(
      h.run(h.executeArgs("swapped.json"), { env: credentials.env }),
      /storage plan does not match/u,
    );
    credentials.assertUntouched();
    assert.equal(h.transport.requests.length, 0);
  });

  it("rejects old unscoped plans before credentials or network", async () => {
    const h = harness();
    const plan = await h.run();
    delete plan.subjectScope;
    privateJson(join(h.directory, "unscoped.json"), plan);
    h.transport.requests.length = 0;
    const credentials = noCredentialAccess();
    await assert.rejects(
      h.run(h.executeArgs("unscoped.json"), { env: credentials.env }),
      /Invalid storage plan/u,
    );
    credentials.assertUntouched();
    assert.equal(h.transport.requests.length, 0);
  });

  it("rejects a swapped-scope verified receipt before credentials or network", async () => {
    const h = harness();
    await h.run();
    const verified = await h.run(h.executeArgs());
    verified.subjectScope = subjectScopeBinding({
      ...h.scope,
      subjectIds: [OUTSIDE],
    });
    privateJson(join(h.directory, "swapped.json"), verified);
    h.transport.requests.length = 0;
    const credentials = noCredentialAccess();
    await assert.rejects(
      h.run([
        ...h.args("revalidation.json"),
        "--verify-only",
        "--compare-receipt",
        join(h.directory, "swapped.json"),
      ], { env: credentials.env }),
      /verified storage receipt does not match/u,
    );
    credentials.assertUntouched();
    assert.equal(h.transport.requests.length, 0);
  });

  it("retains the exact COPY_STORAGE token gate before any network activity", async () => {
    const h = harness();
    await h.run();
    const argv = h.executeArgs();
    argv[argv.length - 1] = "COPY_STORAGE:wrong";
    h.transport.requests.length = 0;
    await assert.rejects(h.run(argv), /exact --confirmation COPY_STORAGE/u);
    assert.equal(h.transport.requests.length, 0);
  });

  it("never overwrites mismatching target bytes", async () => {
    const h = harness();
    await h.run();
    h.transport.target.set(
      identity("photos", `${SELECTED}/a b.png`),
      object("photos", `${SELECTED}/a b.png`, "wrong"),
    );
    await assert.rejects(h.run(h.executeArgs()), /target content mismatch/u);
    assert.equal(
      objectRequests(h).filter((request) => request.kind === "upload").length,
      0,
    );
  });

  it("rejects per-bucket source byte drift even when the overall byte count is unchanged", async () => {
    const h = harness();
    const photo = h.transport.source.get(
      identity("photos", `${SELECTED}/a b.png`),
    );
    const voice = h.transport.source.get(
      identity("voice-samples", `${SELECTED}/voice.webm`),
    );
    photo.contents = Buffer.concat([photo.contents, Buffer.from("+")]);
    voice.contents = voice.contents.subarray(1);
    await assert.rejects(
      h.run(),
      /downloaded source bytes differ from scoped inventory/u,
    );
    assert.equal(h.transport.target.size, 0);
  });

  it("requires selected path and remapped target path digests to match preflight", async () => {
    const h = harness();
    const receipt = JSON.parse(readFileSync(h.sourcePath, "utf8"));
    receipt.storage.objects[0].targetPathManifestSha256 = sha256(
      "wrong approved mapping",
    );
    privateJson(h.sourcePath, receipt);
    await assert.rejects(h.run(), /storage listing changed/u);
    assert.equal(objectRequests(h).length, 0);
  });

  it("does not follow a signed URL for an unapproved object", async () => {
    const h = harness();
    await h.run();
    h.transport.setSignedUrlTransform(() =>
      `/object/sign/photos/${OUTSIDE}/private.png?token=offline`
    );
    await assert.rejects(
      h.run(h.executeArgs()),
      /signed URL does not identify the approved target object/u,
    );
    assert.equal(
      objectRequests(h).filter((request) => request.kind === "signed_download")
        .length,
      0,
    );
  });

  it("rejects an extra target object that appears during copying before issuing a verified receipt", async () => {
    const h = harness();
    await h.run();
    h.transport.setSignedUrlTransform((value) => {
      h.transport.target.set(
        identity("photos", `${OUTSIDE}/late.png`),
        object("photos", `${OUTSIDE}/late.png`, "late unselected bytes"),
      );
      return value;
    });
    await assert.rejects(
      h.run(h.executeArgs()),
      /outside the approved source selection/u,
    );
    assert.ok(
      objectRequests(h).every((request) => !request.path.includes(OUTSIDE)),
    );
  });

  for (
    const [label, alter] of [
      ["extra", (buckets) => {
        if (buckets.length === 2) {
          buckets.push({ id: "late-extra", name: "late-extra", public: false });
        }
      }],
      ["newly public", (buckets) => {
        buckets[0].public = true;
      }],
    ]
  ) {
    it(`rejects a late ${label} target bucket before issuing a verified receipt`, async () => {
      const h = harness();
      await h.run();
      h.transport.setSignedUrlTransform((value) => {
        alter(h.transport.targetBuckets);
        return value;
      });
      await assert.rejects(
        h.run(h.executeArgs()),
        /exactly the approved private bucket set/u,
      );
      const inventoryRequests = h.transport.requests.filter((request) =>
        request.route === "/storage/v1/bucket"
      );
      assert.equal(
        inventoryRequests.length,
        3,
        "plan, initial execution, final execution inventories",
      );
      assert.ok(
        inventoryRequests.every((request) =>
          request.project === TARGET_REF && request.method === "GET"
        ),
      );
    });
  }

  it("rejects an extra target Auth user that appears during copying", async () => {
    const h = harness();
    await h.run();
    h.transport.setSignedUrlTransform((value) => {
      if (!h.transport.targetUsers.includes(NEW_USER)) {
        h.transport.targetUsers.push(NEW_USER);
      }
      return value;
    });
    await assert.rejects(
      h.run(h.executeArgs()),
      /target Auth subject IDs changed/u,
    );
  });

  it("refuses HTTP redirects for every credentialed and signed-URL request", async () => {
    const h = harness();
    const guardedFetch = (url, options) => {
      assert.equal(options.redirect, "error");
      return h.transport.fetch(url, options);
    };
    await h.run(h.args(), { fetch: guardedFetch });
    await h.run(h.executeArgs(), { fetch: guardedFetch });
  });

  it("revalidation never uploads missing target objects", async () => {
    const h = harness();
    await h.run();
    await h.run(h.executeArgs());
    h.transport.target.clear();
    h.transport.requests.length = 0;
    await assert.rejects(
      h.run([
        ...h.args("revalidation.json"),
        "--verify-only",
        "--compare-receipt",
        join(h.directory, "verified.json"),
      ]),
      /not an exact signed-URL-verified copy/u,
    );
    assert.equal(
      objectRequests(h).filter((request) => request.kind === "upload").length,
      0,
    );
  });
});
