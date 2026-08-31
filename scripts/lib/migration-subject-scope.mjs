import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import {
  assertAbsolutePath,
  assertIdentifier,
  assertProjectRef,
  canonicalJson,
  quoteIdentifier,
  quoteLiteral,
  sha256,
} from "./supabase-isolation.mjs";

export const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const BUCKETS = new Set(["photos", "voice-samples"]);
const SCOPE_KEYS = [
  "version",
  "kind",
  "sourceProjectRef",
  "targetProjectRef",
  "subjectIds",
  "legacyStorageAssignments",
];
const BINDING_KEYS = [
  "version",
  "sourceProjectRef",
  "targetProjectRef",
  "scopeSha256",
  "subjectIdsSha256",
  "subjectCount",
  "legacyAssignmentsSha256",
  "rawSubjectIdsIncluded",
];

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) ===
      canonicalJson([...keys].sort());
}

function validUuid(value) {
  return typeof value === "string" && UUID.test(value) &&
    value !== "00000000-0000-0000-0000-000000000000";
}

function validProjects(value, targetProjectRef) {
  if (
    value.sourceProjectRef !== SOURCE_PROJECT_REF ||
    typeof value.targetProjectRef !== "string" ||
    !/^[a-z]{20}$/u.test(value.targetProjectRef) ||
    value.targetProjectRef === SOURCE_PROJECT_REF ||
    (targetProjectRef !== undefined &&
      value.targetProjectRef !== targetProjectRef)
  ) {
    throw new Error("Subject scope source/target project mismatch");
  }
}

/** Private input only. No approval, timestamp, credential or arbitrary metadata fields. */
export function validateSubjectScope(input, { targetProjectRef } = {}) {
  if (
    !exactKeys(input, SCOPE_KEYS) || input.version !== 1 ||
    input.kind !== "mind_manual_subject_scope"
  ) {
    throw new Error("Invalid subject scope envelope");
  }
  validProjects(input, targetProjectRef);
  // Owner's policy is one account, not a configurable batch-size limit. Keep
  // this in the shared validator so private files, embedded packages, SQL
  // helpers and future callers cannot opt into the old multi-user migration.
  if (Array.isArray(input.subjectIds) && input.subjectIds.length !== 1) {
    throw new Error("Owner-only migration requires exactly one selected subject");
  }
  if (
    !Array.isArray(input.subjectIds) ||
    input.subjectIds.some((id) => !validUuid(id)) ||
    new Set(input.subjectIds).size !== input.subjectIds.length
  ) {
    throw new Error("Subject scope requires explicit unique canonical UUIDs");
  }
  if (
    !Array.isArray(input.legacyStorageAssignments) ||
    input.legacyStorageAssignments.length > 10000
  ) {
    throw new Error("Invalid legacy storage assignments");
  }
  const paths = new Set();
  const assignments = input.legacyStorageAssignments.map((assignment) => {
    if (
      !exactKeys(assignment, ["bucket", "pathSha256", "ownerSubjectId"]) ||
      !BUCKETS.has(assignment.bucket) ||
      typeof assignment.pathSha256 !== "string" ||
      !HASH.test(assignment.pathSha256) ||
      !validUuid(assignment.ownerSubjectId)
    ) throw new Error("Invalid legacy storage assignment");
    const key = `${assignment.bucket}/${assignment.pathSha256}`;
    if (paths.has(key)) {
      throw new Error("Duplicate or conflicting legacy storage assignment");
    }
    paths.add(key);
    return { ...assignment };
  }).sort((a, b) =>
    `${a.bucket}/${a.pathSha256}`.localeCompare(`${b.bucket}/${b.pathSha256}`)
  );
  return {
    version: 1,
    kind: "mind_manual_subject_scope",
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: input.targetProjectRef,
    subjectIds: [...input.subjectIds].sort(),
    legacyStorageAssignments: assignments,
  };
}

export function loadSubjectScope(path, options = {}) {
  let contents;
  let descriptor;
  try {
    assertAbsolutePath(path, "subject scope");
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = fstatSync(descriptor);
    if (
      !stats.isFile() || (stats.mode & 0o077) !== 0 ||
      stats.size > 4 * 1024 * 1024
    ) throw new Error("Invalid scope file");
    contents = readFileSync(descriptor, "utf8");
    if (Buffer.byteLength(contents) > 4 * 1024 * 1024) {
      throw new Error("Invalid scope file");
    }
  } catch {
    throw new Error("Subject scope must be an absolute private regular file");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  let input;
  try {
    input = JSON.parse(contents);
  } catch {
    throw new Error("Subject scope is not valid JSON");
  }
  return validateSubjectScope(input, options);
}

/** Public operational evidence: hashes/counts only, never subject UUIDs or paths. */
export function subjectScopeBinding(input) {
  const scope = validateSubjectScope(input);
  return {
    version: 1,
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: scope.targetProjectRef,
    scopeSha256: sha256(canonicalJson(scope)),
    subjectIdsSha256: sha256(scope.subjectIds.join("\n")),
    subjectCount: scope.subjectIds.length,
    legacyAssignmentsSha256: sha256(
      canonicalJson(scope.legacyStorageAssignments),
    ),
    rawSubjectIdsIncluded: false,
  };
}

export function validateSubjectScopeBinding(
  binding,
  label = "subject scope binding",
) {
  if (
    !exactKeys(binding, BINDING_KEYS) || binding.version !== 1 ||
    binding.rawSubjectIdsIncluded !== false ||
    !Number.isSafeInteger(binding.subjectCount) ||
    typeof binding.scopeSha256 !== "string" ||
    !HASH.test(binding.scopeSha256) ||
    typeof binding.subjectIdsSha256 !== "string" ||
    !HASH.test(binding.subjectIdsSha256) ||
    typeof binding.legacyAssignmentsSha256 !== "string" ||
    !HASH.test(binding.legacyAssignmentsSha256)
  ) throw new Error(`Invalid ${label}`);
  validProjects(binding);
  // Old READY/imported/verified receipts are not an override of today's
  // owner-only scope. Validate cardinality before any downstream use.
  if (binding.subjectCount !== 1) {
    throw new Error("Owner-only migration requires exactly one selected subject");
  }
  return binding;
}

export function assertScopeBinding(
  actual,
  expected,
  label = "subject scope binding",
) {
  validateSubjectScopeBinding(actual, label);
  validateSubjectScopeBinding(expected, "expected subject scope binding");
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the approved scope`);
  }
  return actual;
}

export function scopeSqlPredicate(input, qualifiedColumn) {
  const scope = validateSubjectScope(input);
  if (typeof qualifiedColumn !== "string") {
    throw new Error("Invalid scope SQL column");
  }
  const segments = qualifiedColumn.split(".");
  if (segments.length < 1 || segments.length > 3) {
    throw new Error("Invalid scope SQL column");
  }
  const column = segments.map((segment) =>
    quoteIdentifier(assertIdentifier(segment))
  ).join(".");
  return `${column} = ANY(ARRAY[${
    scope.subjectIds.map(quoteLiteral).join(",")
  }]::uuid[])`;
}

/** Classify metadata before any object bytes are downloaded. */
export function classifyStorageObject(input, object) {
  const scope = validateSubjectScope(input);
  if (
    !object || !BUCKETS.has(object.bucket) || typeof object.path !== "string" ||
    !object.path ||
    /[\u0000-\u001f\u007f]/u.test(object.path) ||
    object.path.split("/").some((segment) =>
      !segment || segment === "." || segment === ".."
    )
  ) {
    throw new Error("Invalid scoped storage object path");
  }
  const owner = object.ownerId === undefined || object.ownerId === null ||
      object.ownerId === ""
    ? null
    : object.ownerId;
  if (owner !== null && !validUuid(owner)) {
    throw new Error("Invalid storage owner metadata");
  }
  const subjects = new Set(scope.subjectIds);
  const segments = object.path.split("/");
  const prefix = segments[0];
  const assignment = scope.legacyStorageAssignments.find((entry) =>
    entry.bucket === object.bucket && entry.pathSha256 === sha256(object.path)
  );
  if (segments.length > 1 && UUID.test(prefix)) {
    if (assignment) {
      throw new Error(
        "Legacy assignment cannot override a canonical user folder",
      );
    }
    if (owner !== null && owner !== prefix) {
      throw new Error("Storage folder and owner metadata conflict");
    }
    return {
      selected: subjects.has(prefix),
      targetPath: subjects.has(prefix) ? object.path : null,
    };
  }
  if (assignment) {
    if (owner !== null && owner !== assignment.ownerSubjectId) {
      throw new Error("Legacy storage assignment and owner metadata conflict");
    }
    const selected = subjects.has(assignment.ownerSubjectId);
    return {
      selected,
      targetPath: selected
        ? `${assignment.ownerSubjectId}/${object.path}`
        : null,
    };
  }
  if (owner !== null && !subjects.has(owner)) {
    return { selected: false, targetPath: null };
  }
  throw new Error(
    "Ambiguous legacy storage ownership requires an explicit path assignment",
  );
}

/** Safe post-import guard using hash-only evidence, intended inside a locked transaction. */
export function targetSubjectAssertionSql(binding) {
  validateSubjectScopeBinding(binding);
  assertProjectRef(binding.targetProjectRef);
  return `DO $subject_scope$ BEGIN
    IF (SELECT count(*) FROM auth.users) <> ${binding.subjectCount}
       OR (SELECT encode(extensions.digest(convert_to(COALESCE(string_agg(id::text, E'\\n' ORDER BY id::text), ''), 'UTF8'), 'sha256'), 'hex') FROM auth.users) <> ${
    quoteLiteral(binding.subjectIdsSha256)
  }
       OR EXISTS (SELECT 1 FROM auth.identities i WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=i.user_id)) THEN
      RAISE EXCEPTION 'Target Auth does not match approved subject scope' USING ERRCODE='55000';
    END IF;
  END $subject_scope$;`;
}
