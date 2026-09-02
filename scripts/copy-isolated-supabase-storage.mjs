#!/usr/bin/env node
import { privateScopedReceiptSnapshot } from "./lib/import-subject-package.mjs";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateMigrationGuardCatalogBinding } from "./lib/migration-guard-catalog.mjs";
import {
  assertAbsolutePath,
  assertProjectRef,
  canonicalJson,
  parseArgs,
  readManifestLines,
  sha256,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";
import {
  assertScopeBinding,
  classifyStorageObject,
  loadSubjectScope,
  subjectScopeBinding,
} from "./lib/migration-subject-scope.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const PAGE_SIZE = 100;

function usage(logger) {
  logger.log(
    "usage: node scripts/copy-isolated-supabase-storage.mjs " +
      "--subject-scope /absolute/subject-scope.json " +
      "--source-receipt /absolute/source.json --target-ref <ref> " +
      "--receipt /absolute/storage-receipt.json " +
      "[--plan-receipt /absolute/storage-plan.json --execute " +
      "--confirmation COPY_STORAGE:<target-ref>:<plan-sha-prefix>] " +
      "[--verify-only --compare-receipt /absolute/verified-storage.json]",
  );
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...extra,
  };
}

function encodedObjectPath(bucket, path) {
  const encode = (value) => encodeURIComponent(value);
  return `${encode(bucket)}/${path.split("/").map(encode).join("/")}`;
}

async function storageRequest(fetchImpl, url, key, path, options, label) {
  let response;
  try {
    response = await fetchImpl(`${url}/storage/v1${path}`, {
      ...options,
      redirect: "error",
      headers: headers(key, options?.headers),
    });
  } catch {
    throw new Error(`${label} network request failed`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  return response;
}

async function listAuthSubjectIds(fetchImpl, url, key) {
  const subjectIds = [];
  for (let page = 1;; page += 1) {
    let response;
    try {
      response = await fetchImpl(
        `${url}/auth/v1/admin/users?page=${page}&per_page=100`,
        {
          method: "GET",
          redirect: "error",
          headers: headers(key),
        },
      );
    } catch {
      throw new Error("Auth subject inventory network request failed");
    }
    if (!response.ok) {
      throw new Error(
        `Auth subject inventory failed with HTTP ${response.status}`,
      );
    }
    const body = await response.json();
    const users = Array.isArray(body) ? body : body.users;
    if (!Array.isArray(users)) {
      throw new Error("invalid Auth subject inventory response");
    }
    for (const user of users) {
      if (!user || typeof user.id !== "string") {
        throw new Error("invalid Auth subject in inventory response");
      }
      subjectIds.push(user.id);
    }
    if (users.length < 100) break;
  }
  subjectIds.sort();
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new Error("duplicate Auth subject returned by provider");
  }
  return subjectIds;
}

async function verifySelectedSourceAuth(fetchImpl, url, key, subjectIds) {
  for (const subjectId of subjectIds) {
    let response;
    try {
      response = await fetchImpl(
        `${url}/auth/v1/admin/users/${encodeURIComponent(subjectId)}`,
        {
          method: "GET",
          redirect: "error",
          headers: headers(key),
        },
      );
    } catch {
      throw new Error(
        "approved source Auth subject verification request failed",
      );
    }
    if (!response.ok) {
      throw new Error(
        "approved source Auth subjects are missing or unavailable after preflight",
      );
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("invalid approved source Auth subject response");
    }
    if ((body?.user ?? body)?.id !== subjectId) {
      throw new Error(
        "approved source Auth subject response does not match the requested subject",
      );
    }
  }
}

async function verifyTargetBuckets(fetchImpl, url, key, allowedBuckets) {
  const names = new Set();
  for (let offset = 0;; offset += PAGE_SIZE) {
    // Supabase StorageBucketApi.listBuckets returns Bucket[] at GET /bucket;
    // explicit pagination avoids trusting a server-default result cap.
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      sortColumn: "id",
      sortOrder: "asc",
    });
    const response = await storageRequest(
      fetchImpl,
      url,
      key,
      `/bucket?${query}`,
      { method: "GET" },
      "target bucket inventory",
    );
    let buckets;
    try {
      buckets = await response.json();
    } catch {
      throw new Error("invalid target bucket inventory response");
    }
    if (!Array.isArray(buckets)) {
      throw new Error("invalid target bucket inventory response");
    }
    for (const bucket of buckets) {
      if (
        !bucket || typeof bucket.id !== "string" || bucket.name !== bucket.id ||
        !allowedBuckets.includes(bucket.id) || bucket.public !== false ||
        names.has(bucket.id)
      ) {
        throw new Error(
          "target buckets must be exactly the approved private bucket set",
        );
      }
      names.add(bucket.id);
    }
    if (buckets.length < PAGE_SIZE) break;
  }
  if (names.size !== allowedBuckets.length) {
    throw new Error(
      "target buckets must be exactly the approved private bucket set",
    );
  }
}

async function listBucket(fetchImpl, url, key, bucket) {
  const files = [];
  const pendingPrefixes = [""];
  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift();
    for (let offset = 0;; offset += PAGE_SIZE) {
      const response = await storageRequest(
        fetchImpl,
        url,
        key,
        `/object/list/${encodeURIComponent(bucket)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prefix,
            limit: PAGE_SIZE,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        },
        `list ${bucket}`,
      );
      const entries = await response.json();
      if (!Array.isArray(entries)) {
        throw new Error(`invalid list response for ${bucket}`);
      }
      for (const entry of entries) {
        if (
          !entry || typeof entry.name !== "string" ||
          entry.name.length === 0 || entry.name.includes("\0") ||
          entry.name.includes("/") || [".", ".."].includes(entry.name)
        ) {
          throw new Error(`invalid object entry in ${bucket}`);
        }
        const path = `${prefix}${entry.name}`;
        if (entry.id === null || entry.id === undefined) {
          pendingPrefixes.push(`${path}/`);
        } else {
          if (
            entry.owner_id != null && entry.owner != null &&
            entry.owner_id !== entry.owner
          ) {
            throw new Error(`conflicting object owner metadata in ${bucket}`);
          }
          files.push({
            bucket,
            path,
            ownerId: entry.owner_id ?? entry.owner ?? undefined,
            contentType: entry.metadata?.mimetype ?? "application/octet-stream",
            cacheControl: String(entry.metadata?.cacheControl ?? "3600"),
          });
        }
      }
      if (entries.length < PAGE_SIZE) break;
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(files.map(({ path }) => path)).size !== files.length) {
    throw new Error(`duplicate object path returned for ${bucket}`);
  }
  return files;
}

async function downloadObject(fetchImpl, url, key, object) {
  const path = encodedObjectPath(object.bucket, object.path);
  const response = await storageRequest(
    fetchImpl,
    url,
    key,
    `/object/authenticated/${path}`,
    { method: "GET" },
    `download ${object.bucket}/${sha256(object.path).slice(0, 12)}`,
  );
  return Buffer.from(await response.arrayBuffer());
}

async function uploadObject(fetchImpl, url, key, object, contents) {
  const path = encodedObjectPath(object.bucket, object.path);
  await storageRequest(
    fetchImpl,
    url,
    key,
    `/object/${path}`,
    {
      method: "POST",
      headers: {
        "cache-control": object.cacheControl,
        "content-type": object.contentType,
        "x-upsert": "false",
      },
      body: contents,
    },
    `upload ${object.bucket}/${sha256(object.path).slice(0, 12)}`,
  );
}

async function verifySignedUrl(fetchImpl, url, key, object) {
  const path = encodedObjectPath(object.bucket, object.path);
  const response = await storageRequest(
    fetchImpl,
    url,
    key,
    `/object/sign/${path}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    },
    `sign ${object.bucket}/${sha256(object.path).slice(0, 12)}`,
  );
  const body = await response.json();
  const signedPath = body.signedURL ?? body.signedUrl;
  if (typeof signedPath !== "string" || signedPath.length === 0) return false;
  let signedUrl;
  try {
    signedUrl = new URL(
      signedPath.startsWith("/object/")
        ? `/storage/v1${signedPath}`
        : signedPath,
      url,
    );
  } catch {
    throw new Error("invalid signed URL for approved target object");
  }
  if (
    signedUrl.origin !== url || signedUrl.username || signedUrl.password ||
    signedUrl.pathname !== `/storage/v1/object/sign/${path}`
  ) {
    throw new Error("signed URL does not identify the approved target object");
  }
  let signedResponse;
  try {
    signedResponse = await fetchImpl(signedUrl.href, {
      method: "GET",
      redirect: "error",
      headers: { range: "bytes=0-0" },
    });
  } catch {
    throw new Error("approved target signed URL request failed");
  }
  return signedResponse.ok;
}

function sourcePathDigest(objects) {
  return sha256(objects.map(({ path }) => path).sort().join("\n"));
}

function contentManifestDigest(objects) {
  return sha256(
    canonicalJson(
      objects
        .map(({ bucket, targetPathSha256, bytes, contentSha256 }) => ({
          bucket,
          targetPathSha256,
          bytes,
          contentSha256,
        }))
        .sort((left, right) =>
          `${left.bucket}\0${left.targetPathSha256}`.localeCompare(
            `${right.bucket}\0${right.targetPathSha256}`,
          )
        ),
    ),
  );
}

function sourcePlanProjection(objects) {
  return objects
    .map(({
      bucket,
      sourcePathSha256,
      targetPathSha256,
      pathRemapped,
      bytes,
      contentSha256,
    }) => ({
      bucket,
      sourcePathSha256,
      targetPathSha256,
      pathRemapped,
      bytes,
      contentSha256,
    }))
    .sort((left, right) =>
      `${left.bucket}\0${left.targetPathSha256}`.localeCompare(
        `${right.bucket}\0${right.targetPathSha256}`,
      )
    );
}

function validateStorageInventory(rows, buckets) {
  if (!Array.isArray(rows)) {
    throw new Error("source receipt must include scoped storage inventory");
  }
  const seen = new Set();
  for (const row of rows) {
    if (
      !row || !buckets.includes(row.bucket) || seen.has(row.bucket) ||
      !Number.isSafeInteger(row.objectCount) || row.objectCount < 0 ||
      !Number.isSafeInteger(row.totalBytes) || row.totalBytes < 0 ||
      !/^[a-f0-9]{64}$/u.test(row.pathManifestSha256 ?? "") ||
      !/^[a-f0-9]{64}$/u.test(row.targetPathManifestSha256 ?? "")
    ) {
      throw new Error("source receipt has invalid scoped storage inventory");
    }
    seen.add(row.bucket);
  }
}

function readPrivateReceipt(path, label) {
  const { value: receipt, sha256: receiptSha256 } = privateScopedReceiptSnapshot(path, label);
  return { receipt, receiptSha256 };
}

export function selectStorageObjects(scope, sourceObjects) {
  const inventory = new Set();
  const selected = [];
  const targets = new Set();
  for (const object of sourceObjects) {
    const sourceIdentity = `${object.bucket}\0${sha256(object.path)}`;
    if (inventory.has(sourceIdentity)) {
      throw new Error("source storage contains duplicate inventory entries");
    }
    inventory.add(sourceIdentity);
    const classification = classifyStorageObject(scope, object);
    if (!classification.selected) continue;
    const identity = `${object.bucket}\0${classification.targetPath}`;
    if (targets.has(identity)) {
      throw new Error("approved source paths collide after storage remapping");
    }
    targets.add(identity);
    selected.push({ ...object, targetPath: classification.targetPath });
  }
  const selectedSubjects = new Set(scope.subjectIds);
  for (const assignment of scope.legacyStorageAssignments) {
    if (
      selectedSubjects.has(assignment.ownerSubjectId) &&
      !inventory.has(`${assignment.bucket}\0${assignment.pathSha256}`)
    ) {
      throw new Error(
        "selected legacy storage assignment is absent from source inventory",
      );
    }
  }
  return selected;
}

function assertTargetStorageSelection(
  scope,
  objects,
  sourceIdentities,
  requireComplete = false,
) {
  const identities = new Set(
    objects.map((object) => `${object.bucket}\0${object.path}`),
  );
  if (objects.length !== identities.size) {
    throw new Error("target storage contains duplicate inventory entries");
  }
  if ([...identities].some((identity) => !sourceIdentities.has(identity))) {
    throw new Error(
      "target storage contains paths outside the approved source selection",
    );
  }
  for (const object of objects) {
    if (!classifyStorageObject(scope, object).selected) {
      throw new Error(
        "target storage contains an object outside the approved scope",
      );
    }
  }
  if (requireComplete && identities.size !== sourceIdentities.size) {
    throw new Error(
      "target storage inventory is missing approved source paths",
    );
  }
}

function selfTest(logger) {
  const objects = [
    { path: "b/two.bin" },
    { path: "a/one.bin" },
  ];
  const expected = sha256("a/one.bin\nb/two.bin");
  if (sourcePathDigest(objects) !== expected) {
    throw new Error("path digest self-test failed");
  }
  const encoded = encodedObjectPath("photos", "owner/a b.png");
  if (encoded !== "photos/owner/a%20b.png") {
    throw new Error("path encoding self-test failed");
  }
  const manifestRow = {
    targetPathSha256: "a".repeat(64),
    bytes: 1,
    contentSha256: "b".repeat(64),
  };
  if (
    contentManifestDigest([{ bucket: "photos", ...manifestRow }]) ===
      contentManifestDigest([{ bucket: "voice-samples", ...manifestRow }])
  ) {
    throw new Error("content manifest must bind the storage bucket");
  }
  const collisionRows = [
    { bucket: "photos", ...manifestRow },
    {
      bucket: "voice-samples",
      ...manifestRow,
      contentSha256: "c".repeat(64),
    },
  ];
  if (
    contentManifestDigest(collisionRows) !==
      contentManifestDigest([...collisionRows].reverse())
  ) {
    throw new Error(
      "content manifest order must be canonical across bucket/path collisions",
    );
  }
  logger.log("storage migration self-test passed");
}

export async function runStorageCopy(argv = process.argv.slice(2), {
  fetch: fetchImpl = globalThis.fetch,
  env = process.env,
  logger = console,
} = {}) {
  if (argv.includes("--self-test")) {
    selfTest(logger);
    return;
  }
  if (argv.includes("--help")) {
    usage(logger);
    return;
  }
  const args = parseArgs(argv, {
    "subject-scope": { required: true },
    "source-receipt": { required: true },
    "target-ref": { required: true },
    receipt: { required: true },
    "plan-receipt": {},
    "compare-receipt": {},
    execute: { type: "boolean" },
    "verify-only": { type: "boolean" },
    confirmation: {},
  });
  if (args.execute && args["verify-only"]) {
    throw new Error("--execute and --verify-only are mutually exclusive");
  }
  const targetRef = assertProjectRef(args["target-ref"], "target project ref");
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error("target must differ from source");
  }
  // Scope is operator-reviewed local input. Validate it and every input receipt
  // before reading credentials or making even a metadata-only network request.
  const scope = loadSubjectScope(args["subject-scope"], {
    targetProjectRef: targetRef,
  });
  const scopeBinding = subjectScopeBinding(scope);
  const sourceReceiptPath = assertAbsolutePath(
    args["source-receipt"],
    "source receipt",
  );
  const { receipt: sourceReceipt, receiptSha256: sourceReceiptSha256 } =
    readPrivateReceipt(sourceReceiptPath, "source receipt");
  if (
    sourceReceipt.version !== 1 ||
    sourceReceipt.kind !== "source" ||
    sourceReceipt.projectRef !== SOURCE_PROJECT_REF ||
    sourceReceipt.status !== "ready" ||
    !Array.isArray(sourceReceipt.blockers) ||
    sourceReceipt.blockers.length !== 0
  ) {
    throw new Error("storage copy requires a ready canonical source receipt");
  }
  assertScopeBinding(
    sourceReceipt.subjectScope,
    scopeBinding,
    "source receipt",
  );
  validateMigrationGuardCatalogBinding(sourceReceipt.catalog?.migrationGuard);
  const selectedSubjectIds = [...scope.subjectIds].sort();
  if (
    sourceReceipt.auth?.userCount !== selectedSubjectIds.length ||
    sourceReceipt.auth?.subjectIdsSha256 !==
      sha256(selectedSubjectIds.join("\n"))
  ) {
    throw new Error("source Auth receipt does not match the approved subjects");
  }
  const buckets = readManifestLines(
    "supabase/isolation/mind-manual-buckets.txt",
  );
  validateStorageInventory(sourceReceipt.storage?.objects, buckets);
  const outputReceiptPath = assertAbsolutePath(args.receipt, "output receipt");
  if (existsSync(outputReceiptPath)) {
    throw new Error(
      `refusing to overwrite existing output: ${outputReceiptPath}`,
    );
  }

  let planReceipt = null;
  let planReceiptSha256 = null;
  let comparedStorageReceipt = null;
  let comparedStorageReceiptSha256 = null;
  if (args.execute) {
    if (!args["plan-receipt"]) {
      throw new Error("--execute requires --plan-receipt");
    }
    const planPath = assertAbsolutePath(args["plan-receipt"], "plan receipt");
    if (planPath === outputReceiptPath) {
      throw new Error("execution output must differ from the plan receipt");
    }
    ({ receipt: planReceipt, receiptSha256: planReceiptSha256 } =
      readPrivateReceipt(planPath, "storage plan receipt"));
    assertScopeBinding(planReceipt.subjectScope, scopeBinding, "storage plan");
    const confirmation = `COPY_STORAGE:${targetRef}:${
      planReceiptSha256.slice(0, 12)
    }`;
    if (args.confirmation !== confirmation) {
      throw new Error(
        `--execute requires exact --confirmation ${confirmation}`,
      );
    }
    if (
      planReceipt.version !== 1 ||
      planReceipt.status !== "planned_not_copied" ||
      planReceipt.sourceProjectRef !== SOURCE_PROJECT_REF ||
      planReceipt.targetProjectRef !== targetRef ||
      planReceipt.sourceReceiptSha256 !== sourceReceiptSha256 ||
      !Array.isArray(planReceipt.objects) ||
      planReceipt.sourceSecretValueIncluded !== false ||
      planReceipt.targetSecretValueIncluded !== false ||
      planReceipt.rawObjectPathsIncluded !== false
    ) {
      throw new Error("storage plan receipt does not match this migration");
    }
  } else if (args["verify-only"]) {
    if (!args["compare-receipt"]) {
      throw new Error("--verify-only requires --compare-receipt");
    }
    const comparePath = assertAbsolutePath(
      args["compare-receipt"],
      "verified storage receipt",
    );
    if (comparePath === outputReceiptPath) {
      throw new Error(
        "revalidation output must differ from the verified receipt",
      );
    }
    ({
      receipt: comparedStorageReceipt,
      receiptSha256: comparedStorageReceiptSha256,
    } = readPrivateReceipt(comparePath, "verified storage receipt"));
    assertScopeBinding(
      comparedStorageReceipt.subjectScope,
      scopeBinding,
      "verified storage receipt",
    );
    if (
      comparedStorageReceipt.version !== 1 ||
      comparedStorageReceipt.status !== "verified" ||
      comparedStorageReceipt.sourceProjectRef !== SOURCE_PROJECT_REF ||
      comparedStorageReceipt.targetProjectRef !== targetRef ||
      comparedStorageReceipt.sourceReceiptSha256 !== sourceReceiptSha256 ||
      !Array.isArray(comparedStorageReceipt.objects) ||
      comparedStorageReceipt.sourceSecretValueIncluded !== false ||
      comparedStorageReceipt.targetSecretValueIncluded !== false ||
      comparedStorageReceipt.rawObjectPathsIncluded !== false
    ) {
      throw new Error("storage revalidation input is not a verified receipt");
    }
  } else if (args["plan-receipt"] || args["compare-receipt"]) {
    throw new Error(
      "plan/compare receipts are valid only in execute/verify modes",
    );
  }

  let sourceKey = env.MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY;
  let targetKey = env.MIND_MANUAL_TARGET_SERVICE_ROLE_KEY;
  delete env.MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY;
  delete env.MIND_MANUAL_TARGET_SERVICE_ROLE_KEY;
  if (!sourceKey || !targetKey) {
    throw new Error(
      "MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY and MIND_MANUAL_TARGET_SERVICE_ROLE_KEY must be injected without echoing",
    );
  }
  if (sourceKey === targetKey) {
    throw new Error("source and target service-role keys must differ");
  }

  const sourceUrl = `https://${SOURCE_PROJECT_REF}.supabase.co`;
  const targetUrl = `https://${targetRef}.supabase.co`;
  await verifySelectedSourceAuth(
    fetchImpl,
    sourceUrl,
    sourceKey,
    selectedSubjectIds,
  );
  const targetSubjectIds = await listAuthSubjectIds(
    fetchImpl,
    targetUrl,
    targetKey,
  );
  if (canonicalJson(targetSubjectIds) !== canonicalJson(selectedSubjectIds)) {
    throw new Error("target Auth subject IDs do not match the approved scope");
  }
  await verifyTargetBuckets(fetchImpl, targetUrl, targetKey, buckets);
  const sourceObjects = [];
  const targetObjects = [];
  for (const bucket of buckets) {
    sourceObjects.push(
      ...await listBucket(fetchImpl, sourceUrl, sourceKey, bucket),
    );
    targetObjects.push(
      ...await listBucket(fetchImpl, targetUrl, targetKey, bucket),
    );
  }

  // Never download bytes while classification is incomplete: a later ambiguous
  // legacy entry must invalidate the entire inventory before any object read.
  const mappedSourceObjects = selectStorageObjects(scope, sourceObjects);

  for (const bucket of buckets) {
    const expected = sourceReceipt.storage.objects.find((row) =>
      row.bucket === bucket
    ) ?? {
      objectCount: 0,
      totalBytes: 0,
      pathManifestSha256: sha256(""),
      targetPathManifestSha256: sha256(""),
    };
    const listed = mappedSourceObjects.filter((object) =>
      object.bucket === bucket
    );
    if (
      listed.length !== expected.objectCount ||
      sourcePathDigest(listed) !== expected.pathManifestSha256 ||
      sourcePathDigest(
          listed.map(({ targetPath }) => ({ path: targetPath })),
        ) !==
        expected.targetPathManifestSha256
    ) {
      throw new Error(
        `source storage listing changed after preflight: ${bucket}`,
      );
    }
  }

  const targetByIdentity = new Map(
    targetObjects.map((object) => [`${object.bucket}\0${object.path}`, object]),
  );
  const sourceIdentities = new Set(
    mappedSourceObjects.map((object) =>
      `${object.bucket}\0${object.targetPath}`
    ),
  );
  assertTargetStorageSelection(scope, targetObjects, sourceIdentities);

  const objectReceipts = [];
  const pendingCopies = [];
  for (const sourceObject of mappedSourceObjects) {
    const targetObject = { ...sourceObject, path: sourceObject.targetPath };
    const identity = `${sourceObject.bucket}\0${sourceObject.targetPath}`;
    const sourceContents = await downloadObject(
      fetchImpl,
      sourceUrl,
      sourceKey,
      sourceObject,
    );
    const sourceContentSha256 = sha256(sourceContents);
    const existingTarget = targetByIdentity.get(identity);
    let targetContents = null;
    if (existingTarget) {
      targetContents = await downloadObject(
        fetchImpl,
        targetUrl,
        targetKey,
        existingTarget,
      );
      if (sha256(targetContents) !== sourceContentSha256) {
        throw new Error(
          `target content mismatch at path ${
            sha256(sourceObject.path).slice(0, 12)
          }`,
        );
      }
    }
    const targetContentSha256 = targetContents ? sha256(targetContents) : null;
    const signedUrlVerified = targetContents
      ? await verifySignedUrl(fetchImpl, targetUrl, targetKey, targetObject)
      : false;
    const receiptIndex = objectReceipts.length;
    objectReceipts.push({
      bucket: sourceObject.bucket,
      sourcePathSha256: sha256(sourceObject.path),
      targetPathSha256: sha256(sourceObject.targetPath),
      pathRemapped: sourceObject.path !== sourceObject.targetPath,
      bytes: sourceContents.length,
      contentSha256: sourceContentSha256,
      targetContentSha256,
      copied: false,
      signedUrlVerified,
    });
    if (!existingTarget) {
      pendingCopies.push({
        receiptIndex,
        targetObject,
        sourceContents,
        sourceContentSha256,
        sourcePathSha256: sha256(sourceObject.path),
      });
    }
  }

  const expectedTotalBytes = sourceReceipt.storage.objects.reduce(
    (sum, row) => sum + row.totalBytes,
    0,
  );
  const actualTotalBytes = objectReceipts.reduce(
    (sum, row) => sum + row.bytes,
    0,
  );
  for (const bucket of buckets) {
    const actual = objectReceipts.filter((row) => row.bucket === bucket)
      .reduce((sum, row) => sum + row.bytes, 0);
    const expected = sourceReceipt.storage.objects.find((row) =>
      row.bucket === bucket
    );
    if (actual !== (expected?.totalBytes ?? 0)) {
      throw new Error(
        `downloaded source bytes differ from scoped inventory: ${bucket}`,
      );
    }
  }
  if (expectedTotalBytes !== actualTotalBytes) {
    throw new Error(
      "downloaded source bytes differ from the database inventory",
    );
  }
  const contentManifestSha256 = contentManifestDigest(objectReceipts);
  const sourceProjection = sourcePlanProjection(objectReceipts);
  const commonReceipt = {
    version: 1,
    capturedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    sourceReceiptSha256,
    subjectScope: scopeBinding,
    objectCount: objectReceipts.length,
    totalBytes: actualTotalBytes,
    remappedPathCount:
      objectReceipts.filter(({ pathRemapped }) => pathRemapped).length,
    contentManifestSha256,
    sourceSecretValueIncluded: false,
    targetSecretValueIncluded: false,
    rawObjectPathsIncluded: false,
  };

  if (!args.execute && !args["verify-only"]) {
    const receipt = {
      ...commonReceipt,
      status: "planned_not_copied",
      objects: objectReceipts,
    };
    writePrivateJson(outputReceiptPath, receipt);
    const receiptSha256 = sha256File(outputReceiptPath);
    logger.log(
      `storage ${receipt.status}: ${receipt.objectCount} object(s), ${receipt.totalBytes} bytes`,
    );
    logger.log(`receipt sha256: ${receiptSha256}`);
    logger.log(
      `execute confirmation: COPY_STORAGE:${targetRef}:${
        receiptSha256.slice(0, 12)
      }`,
    );
    return receipt;
  }

  const comparisonReceipt = args.execute ? planReceipt : comparedStorageReceipt;
  if (
    comparisonReceipt.objectCount !== objectReceipts.length ||
    comparisonReceipt.totalBytes !== actualTotalBytes ||
    comparisonReceipt.contentManifestSha256 !== contentManifestSha256 ||
    canonicalJson(sourcePlanProjection(comparisonReceipt.objects)) !==
      canonicalJson(sourceProjection)
  ) {
    throw new Error(
      "source storage content drifted from the reviewed storage receipt",
    );
  }

  if (args.execute) {
    for (const pending of pendingCopies) {
      await uploadObject(
        fetchImpl,
        targetUrl,
        targetKey,
        pending.targetObject,
        pending.sourceContents,
      );
      const targetContents = await downloadObject(
        fetchImpl,
        targetUrl,
        targetKey,
        pending.targetObject,
      );
      const targetContentSha256 = sha256(targetContents);
      const signedUrlVerified = await verifySignedUrl(
        fetchImpl,
        targetUrl,
        targetKey,
        pending.targetObject,
      );
      if (
        targetContentSha256 !== pending.sourceContentSha256 ||
        !signedUrlVerified
      ) {
        throw new Error(
          `target object verification failed at path ${
            pending.sourcePathSha256.slice(0, 12)
          }`,
        );
      }
      objectReceipts[pending.receiptIndex] = {
        ...objectReceipts[pending.receiptIndex],
        targetContentSha256,
        copied: true,
        signedUrlVerified,
      };
    }
  }

  const targetComplete = objectReceipts.every(
    (row) =>
      row.targetContentSha256 === row.contentSha256 && row.signedUrlVerified,
  );
  if (!targetComplete) {
    throw new Error("target storage is not an exact signed-URL-verified copy");
  }
  await verifyTargetBuckets(fetchImpl, targetUrl, targetKey, buckets);
  const finalTargetObjects = [];
  for (const bucket of buckets) {
    finalTargetObjects.push(
      ...await listBucket(fetchImpl, targetUrl, targetKey, bucket),
    );
  }
  assertTargetStorageSelection(
    scope,
    finalTargetObjects,
    sourceIdentities,
    true,
  );
  const finalTargetSubjectIds = await listAuthSubjectIds(
    fetchImpl,
    targetUrl,
    targetKey,
  );
  if (
    canonicalJson(finalTargetSubjectIds) !== canonicalJson(selectedSubjectIds)
  ) {
    throw new Error(
      "target Auth subject IDs changed during storage verification",
    );
  }

  const receipt = args["verify-only"]
    ? {
      ...commonReceipt,
      status: "verified_revalidation",
      storageReceiptSha256: comparedStorageReceiptSha256,
      signedUrlVerifiedCount: objectReceipts.length,
      allObjectsMatch: true,
    }
    : {
      ...commonReceipt,
      status: "verified",
      planReceiptSha256,
      objects: objectReceipts,
    };
  writePrivateJson(outputReceiptPath, receipt);
  logger.log(
    `storage ${receipt.status}: ${receipt.objectCount} object(s), ${receipt.totalBytes} bytes`,
  );
  logger.log(`receipt sha256: ${sha256File(outputReceiptPath)}`);
  sourceKey = undefined;
  targetKey = undefined;
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runStorageCopy().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
