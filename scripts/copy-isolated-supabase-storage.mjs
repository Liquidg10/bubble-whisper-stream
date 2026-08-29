#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertAbsolutePath,
  assertPrivateFile,
  assertProjectRef,
  canonicalJson,
  parseArgs,
  readManifestLines,
  sha256,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const PAGE_SIZE = 100;

function usage() {
  console.log(
    "usage: node scripts/copy-isolated-supabase-storage.mjs " +
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

async function storageRequest(url, key, path, options, label) {
  let response;
  try {
    response = await fetch(`${url}/storage/v1${path}`, {
      ...options,
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

async function listAuthSubjectIds(url, key) {
  const subjectIds = [];
  for (let page = 1;; page += 1) {
    let response;
    try {
      response = await fetch(
        `${url}/auth/v1/admin/users?page=${page}&per_page=100`,
        {
          method: "GET",
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

async function listBucket(url, key, bucket) {
  const files = [];
  const pendingPrefixes = [""];
  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift();
    for (let offset = 0;; offset += PAGE_SIZE) {
      const response = await storageRequest(
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
          !entry || typeof entry.name !== "string" || entry.name.includes("\0")
        ) {
          throw new Error(`invalid object entry in ${bucket}`);
        }
        const path = `${prefix}${entry.name}`;
        if (entry.id === null || entry.id === undefined) {
          pendingPrefixes.push(`${path}/`);
        } else {
          files.push({
            bucket,
            path,
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

async function downloadObject(url, key, object) {
  const path = encodedObjectPath(object.bucket, object.path);
  const response = await storageRequest(
    url,
    key,
    `/object/authenticated/${path}`,
    { method: "GET" },
    `download ${object.bucket}/${sha256(object.path).slice(0, 12)}`,
  );
  return Buffer.from(await response.arrayBuffer());
}

async function uploadObject(url, key, object, contents) {
  const path = encodedObjectPath(object.bucket, object.path);
  await storageRequest(
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

async function verifySignedUrl(url, key, object) {
  const path = encodedObjectPath(object.bucket, object.path);
  const response = await storageRequest(
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
  const signedUrl = signedPath.startsWith("http")
    ? signedPath
    : `${url}${signedPath}`;
  const signedResponse = await fetch(signedUrl, {
    method: "GET",
    headers: { range: "bytes=0-0" },
  });
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

function selfTest() {
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
  console.log("storage migration self-test passed");
}

async function main() {
  if (process.argv.slice(2).includes("--self-test")) {
    selfTest();
    return;
  }
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
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
  const sourceReceiptPath = assertAbsolutePath(
    args["source-receipt"],
    "source receipt",
  );
  assertPrivateFile(sourceReceiptPath, "source receipt");
  const sourceReceipt = JSON.parse(readFileSync(sourceReceiptPath, "utf8"));
  if (
    sourceReceipt.version !== 1 ||
    sourceReceipt.kind !== "source" ||
    sourceReceipt.projectRef !== SOURCE_PROJECT_REF ||
    sourceReceipt.status !== "ready"
  ) {
    throw new Error("storage copy requires a ready canonical source receipt");
  }
  const targetRef = assertProjectRef(args["target-ref"], "target project ref");
  if (targetRef === SOURCE_PROJECT_REF) {
    throw new Error("target must differ from source");
  }
  const outputReceiptPath = assertAbsolutePath(args.receipt, "output receipt");
  if (existsSync(outputReceiptPath)) {
    throw new Error(`refusing to overwrite existing output: ${outputReceiptPath}`);
  }

  const sourceReceiptSha256 = sha256File(sourceReceiptPath);
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
    assertPrivateFile(planPath, "storage plan receipt");
    planReceipt = JSON.parse(readFileSync(planPath, "utf8"));
    planReceiptSha256 = sha256File(planPath);
    const confirmation = `COPY_STORAGE:${targetRef}:${
      planReceiptSha256.slice(0, 12)
    }`;
    if (args.confirmation !== confirmation) {
      throw new Error(`--execute requires exact --confirmation ${confirmation}`);
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
      throw new Error("revalidation output must differ from the verified receipt");
    }
    assertPrivateFile(comparePath, "verified storage receipt");
    comparedStorageReceipt = JSON.parse(readFileSync(comparePath, "utf8"));
    comparedStorageReceiptSha256 = sha256File(comparePath);
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
    throw new Error("plan/compare receipts are valid only in execute/verify modes");
  }

  let sourceKey = process.env.MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY;
  let targetKey = process.env.MIND_MANUAL_TARGET_SERVICE_ROLE_KEY;
  delete process.env.MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY;
  delete process.env.MIND_MANUAL_TARGET_SERVICE_ROLE_KEY;
  if (!sourceKey || !targetKey) {
    throw new Error(
      "MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY and MIND_MANUAL_TARGET_SERVICE_ROLE_KEY must be injected without echoing",
    );
  }
  if (sourceKey === targetKey) {
    throw new Error("source and target service-role keys must differ");
  }

  const buckets = readManifestLines(
    "supabase/isolation/mind-manual-buckets.txt",
  );
  const sourceUrl = `https://${SOURCE_PROJECT_REF}.supabase.co`;
  const targetUrl = `https://${targetRef}.supabase.co`;
  const sourceSubjectIds = await listAuthSubjectIds(sourceUrl, sourceKey);
  const targetSubjectIds = await listAuthSubjectIds(targetUrl, targetKey);
  if (
    sourceSubjectIds.length !== sourceReceipt.auth.userCount ||
    sha256(sourceSubjectIds.join("\n")) !== sourceReceipt.auth.subjectIdsSha256
  ) {
    throw new Error("source Auth subjects changed after preflight");
  }
  if (canonicalJson(targetSubjectIds) !== canonicalJson(sourceSubjectIds)) {
    throw new Error("target Auth subject IDs do not match the source");
  }
  const sourceObjects = [];
  const targetObjects = [];
  for (const bucket of buckets) {
    sourceObjects.push(...await listBucket(sourceUrl, sourceKey, bucket));
    targetObjects.push(...await listBucket(targetUrl, targetKey, bucket));
  }

  const subjectSet = new Set(sourceSubjectIds);
  const mappedSourceObjects = sourceObjects.map((object) => {
    const firstSegment = object.path.split("/", 1)[0];
    if (subjectSet.has(firstSegment)) {
      return { ...object, targetPath: object.path };
    }
    if (
      object.bucket === "photos" &&
      !object.path.includes("/") &&
      sourceSubjectIds.length === 1
    ) {
      return { ...object, targetPath: `${sourceSubjectIds[0]}/${object.path}` };
    }
    throw new Error(
      `object path cannot be mapped to an Auth owner: ${object.bucket}/${
        sha256(object.path).slice(0, 12)
      }`,
    );
  });

  for (const bucket of buckets) {
    const expected = sourceReceipt.storage.objects.find((row) =>
      row.bucket === bucket
    ) ?? {
      objectCount: 0,
      totalBytes: 0,
      pathManifestSha256: sha256(""),
    };
    const listed = sourceObjects.filter((object) => object.bucket === bucket);
    if (
      listed.length !== expected.objectCount ||
      sourcePathDigest(listed) !== expected.pathManifestSha256
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
  const extras = targetObjects.filter(
    (object) => !sourceIdentities.has(`${object.bucket}\0${object.path}`),
  );
  if (extras.length > 0) {
    throw new Error("target storage contains paths absent from source");
  }

  const objectReceipts = [];
  const pendingCopies = [];
  for (const sourceObject of mappedSourceObjects) {
    const targetObject = { ...sourceObject, path: sourceObject.targetPath };
    const identity = `${sourceObject.bucket}\0${sourceObject.targetPath}`;
    const sourceContents = await downloadObject(
      sourceUrl,
      sourceKey,
      sourceObject,
    );
    const sourceContentSha256 = sha256(sourceContents);
    const existingTarget = targetByIdentity.get(identity);
    let targetContents = null;
    if (existingTarget) {
      targetContents = await downloadObject(
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
      ? await verifySignedUrl(targetUrl, targetKey, targetObject)
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
    console.log(
      `storage ${receipt.status}: ${receipt.objectCount} object(s), ${receipt.totalBytes} bytes`,
    );
    console.log(`receipt sha256: ${receiptSha256}`);
    console.log(
      `execute confirmation: COPY_STORAGE:${targetRef}:${receiptSha256.slice(0, 12)}`,
    );
    return;
  }

  const comparisonReceipt = args.execute
    ? planReceipt
    : comparedStorageReceipt;
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
        targetUrl,
        targetKey,
        pending.targetObject,
        pending.sourceContents,
      );
      const targetContents = await downloadObject(
        targetUrl,
        targetKey,
        pending.targetObject,
      );
      const targetContentSha256 = sha256(targetContents);
      const signedUrlVerified = await verifySignedUrl(
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
  console.log(
    `storage ${receipt.status}: ${receipt.objectCount} object(s), ${receipt.totalBytes} bytes`,
  );
  console.log(`receipt sha256: ${sha256File(outputReceiptPath)}`);
  sourceKey = undefined;
  targetKey = undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
