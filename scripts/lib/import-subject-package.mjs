import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import {
  assertAbsolutePath,
  canonicalJson,
  quoteIdentifier,
  quoteLiteral,
  readTsvManifest,
  sha256,
  writePrivateFile,
} from "./supabase-isolation.mjs";
import { resolve } from "node:path";
import {
  assertScopeBinding,
  subjectScopeBinding,
  targetSubjectAssertionSql,
  validateSubjectScope,
  validateSubjectScopeBinding,
} from "./migration-subject-scope.mjs";

/** Read one private regular file through one descriptor; do not follow a swapped symlink. */
export function privateSnapshot(path, label, { json = false } = {}) {
  assertAbsolutePath(path, label);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = fstatSync(descriptor);
    if (
      !stats.isFile() || (stats.mode & 0o077) !== 0 ||
      (json && stats.size > 4 * 1024 * 1024)
    ) {
      throw new Error("Invalid private file");
    }
    const bytes = readFileSync(descriptor);
    if (json && bytes.length > 4 * 1024 * 1024) {
      throw new Error("Invalid private file");
    }
    return {
      bytes,
      sha256: sha256(bytes),
      ...(json ? { value: JSON.parse(bytes.toString("utf8")) } : {}),
    };
  } catch {
    // JSON/OS/DB errors can include sensitive source content. Keep diagnostics fixed.
    throw new Error(
      `${label} must be a readable private regular ${json ? "JSON " : ""}file`,
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function validateImportScope(
  { scope, scopeFileSha256, manifest, source, decision, targetRef },
) {
  const normalized = validateSubjectScope(scope, {
    targetProjectRef: targetRef,
  });
  const binding = subjectScopeBinding(normalized);
  for (
    const [label, receipt] of [["package", manifest], [
      "source receipt",
      source,
    ], ["Auth decision", decision]]
  ) {
    assertScopeBinding(
      receipt?.subjectScope,
      binding,
      `${label} subject scope`,
    );
  }
  const file = manifest.subjectScopeFile;
  if (
    canonicalJson(Object.keys(file ?? {}).sort()) !==
      canonicalJson(["relativePath", "sha256"]) ||
    file.relativePath !== "subject-scope.json" ||
    file.sha256 !== scopeFileSha256
  ) {
    throw new Error("Package subject scope file does not match its manifest");
  }
  if (
    source.auth?.subjectIdsSha256 !== binding.subjectIdsSha256 ||
    source.auth?.userCount !== binding.subjectCount
  ) {
    throw new Error(
      "Source Auth inventory does not match the approved subject scope",
    );
  }
  return binding;
}

export function snapshotPackageBinaryFiles(manifest, packageDir, stagingDir) {
  const paths = new Set();
  for (const file of manifest.files) {
    if (
      !/^(auth|public)\.[a-z][a-z0-9_]*$/u.test(file.logicalName) ||
      file.relativePath !== `data/${file.logicalName}.bin` ||
      paths.has(file.relativePath)
    ) {
      throw new Error("Unexpected or duplicate binary package path");
    }
    paths.add(file.relativePath);
    const snapshot = privateSnapshot(
      resolve(packageDir, file.relativePath),
      "binary package input",
    );
    if (
      snapshot.bytes.length !== file.bytes ||
      snapshot.sha256 !== file.fileSha256
    ) {
      throw new Error(
        "Binary package input changed or does not match its manifest",
      );
    }
    writePrivateFile(resolve(stagingDir, file.relativePath), snapshot.bytes);
  }
}

function digest(expression) {
  return `encode(extensions.digest(convert_to(COALESCE(string_agg(${expression}, E'\\n' ORDER BY ${expression}), ''), 'UTF8'), 'sha256'), 'hex')`;
}

/** SQL guards belong in the SAME transaction as COPY, not only in preflight. */
export function importTransactionGuards(source) {
  const publicScopes = readTsvManifest(
    "supabase/isolation/mind-manual-data-scopes.tsv",
    3,
  );
  const binding = validateSubjectScopeBinding(source.subjectScope);
  if (
    source.auth?.userCount !== binding.subjectCount ||
    source.auth?.subjectIdsSha256 !== binding.subjectIdsSha256
  ) {
    throw new Error(
      "Source Auth parity inventory is outside the approved scope",
    );
  }
  const relations = (source.publicData ?? []).map((row) => row?.relation);
  if (
    new Set(relations).size !== relations.length ||
    canonicalJson([...relations].sort()) !==
      canonicalJson(publicScopes.map(([name]) => name).sort())
  ) {
    throw new Error("Source row parity inventory is incomplete or duplicated");
  }
  const tables = [
    ["auth", "users"],
    ["auth", "identities"],
    ...publicScopes.map(([name]) => ["public", name]),
  ];
  const names = tables.map(([schema, name]) =>
    `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
  );
  const counts = new Map(
    (source.publicData ?? []).map((row) => [row.relation, row]),
  );
  const expected = [
    ["auth", "users", source.auth.userCount, source.auth.usersSha256],
    [
      "auth",
      "identities",
      source.auth.identityCount,
      source.auth.identitiesSha256,
    ],
    ...publicScopes.map((
      [name],
    ) => [
      "public",
      name,
      counts.get(name)?.copyRowCount,
      counts.get(name)?.copyRowsSha256,
    ]),
  ];
  for (const [, , count, hash] of expected) {
    if (
      !Number.isSafeInteger(count) || count < 0 || typeof hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(hash)
    ) {
      throw new Error("Source row parity inventory is incomplete");
    }
  }
  return {
    beforeCopy: `SET LOCAL lock_timeout = '10s';\nLOCK TABLE ${
      names.join(", ")
    } IN ACCESS EXCLUSIVE MODE;
DO $import_empty$ BEGIN
  IF ${names.map((name) => `EXISTS (SELECT 1 FROM ${name})`).join(" OR ")} THEN
    RAISE EXCEPTION 'Target changed after preflight; import refused' USING ERRCODE='55000';
  END IF;
END $import_empty$;`,
    afterCopy: `DO $import_parity$ BEGIN
IF ${
      publicScopes.map(([name, owner]) =>
        `EXISTS (SELECT 1 FROM public.${
          quoteIdentifier(name)
        } r WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.${
          quoteIdentifier(owner)
        }))`
      ).join(" OR ")
    } THEN
  RAISE EXCEPTION 'Target public rows are outside approved subject scope' USING ERRCODE='55000';
END IF;
${
      expected.map(([schema, name, count, hash]) => {
        const table = `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
        return `IF (SELECT count(*) FROM ${table}) <> ${count} OR (SELECT ${
          digest("to_jsonb(r)::text")
        } FROM ${table} r) <> ${quoteLiteral(hash)} THEN
  RAISE EXCEPTION 'Target transactional copy parity failed' USING ERRCODE='55000';
END IF;`;
      }).join("\n")
    }\nEND $import_parity$;\n${targetSubjectAssertionSql(binding)}`,
  };
}
