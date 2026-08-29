#!/usr/bin/env node

import { readFileSync } from "node:fs";
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
      "[--execute --confirmation COPY_STORAGE:<target-ref>:<receipt-sha-prefix>]",
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
        .map(({ targetPathSha256, bytes, contentSha256 }) => ({
          targetPathSha256,
          bytes,
          contentSha256,
        }))
        .sort((left, right) =>
          left.targetPathSha256.localeCompare(right.targetPathSha256)
        ),
    ),
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
    execute: { type: "boolean" },
    confirmation: {},
    overwrite: { type: "boolean" },
  });
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

  const sourceKey = process.env.MIND_MANUAL_SOURCE_SERVICE_ROLE_KEY;
  const targetKey = process.env.MIND_MANUAL_TARGET_SERVICE_ROLE_KEY;
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

  const confirmation = `COPY_STORAGE:${targetRef}:${
    sha256File(sourceReceiptPath).slice(0, 12)
  }`;
  if (args.execute && args.confirmation !== confirmation) {
    throw new Error(`--execute requires exact --confirmation ${confirmation}`);
  }

  const objectReceipts = [];
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
    let copied = false;
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
    } else if (args.execute) {
      await uploadObject(targetUrl, targetKey, targetObject, sourceContents);
      targetContents = await downloadObject(targetUrl, targetKey, targetObject);
      copied = true;
    }
    const targetContentSha256 = targetContents ? sha256(targetContents) : null;
    const signedUrlVerified = targetContents
      ? await verifySignedUrl(targetUrl, targetKey, targetObject)
      : false;
    if (
      args.execute &&
      (targetContentSha256 !== sourceContentSha256 || !signedUrlVerified)
    ) {
      throw new Error(
        `target object verification failed at path ${
          sha256(sourceObject.path).slice(0, 12)
        }`,
      );
    }
    objectReceipts.push({
      bucket: sourceObject.bucket,
      sourcePathSha256: sha256(sourceObject.path),
      targetPathSha256: sha256(sourceObject.targetPath),
      pathRemapped: sourceObject.path !== sourceObject.targetPath,
      bytes: sourceContents.length,
      contentSha256: sourceContentSha256,
      targetContentSha256,
      copied,
      signedUrlVerified,
    });
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
  const targetComplete = objectReceipts.every(
    (row) =>
      row.targetContentSha256 === row.contentSha256 && row.signedUrlVerified,
  );
  const receipt = {
    version: 1,
    status: targetComplete ? "verified" : "planned_not_copied",
    capturedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: targetRef,
    sourceReceiptSha256: sha256File(sourceReceiptPath),
    objectCount: objectReceipts.length,
    totalBytes: actualTotalBytes,
    remappedPathCount:
      objectReceipts.filter(({ pathRemapped }) => pathRemapped).length,
    contentManifestSha256: contentManifestDigest(objectReceipts),
    objects: objectReceipts,
    sourceSecretValueIncluded: false,
    targetSecretValueIncluded: false,
    rawObjectPathsIncluded: false,
  };
  writePrivateJson(args.receipt, receipt, { overwrite: args.overwrite });
  console.log(
    `storage ${receipt.status}: ${receipt.objectCount} object(s), ${receipt.totalBytes} bytes`,
  );
  console.log(`receipt sha256: ${sha256File(args.receipt)}`);
  if (!args.execute) console.log(`execute confirmation: ${confirmation}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
