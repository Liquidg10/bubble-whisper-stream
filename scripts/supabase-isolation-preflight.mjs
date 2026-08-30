#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { privateSnapshot } from "./lib/import-subject-package.mjs";
import {
  assertScopeBinding,
  classifyStorageObject,
  loadSubjectScope,
  scopeSqlPredicate,
  subjectScopeBinding,
  validateSubjectScopeBinding,
} from "./lib/migration-subject-scope.mjs";
import {
  assertAbsolutePath,
  assertIdentifier,
  assertProjectRef,
  canonicalJson,
  getLinkedDatabaseConfig,
  parseArgs,
  quoteIdentifier,
  quoteLiteral,
  readManifestLines,
  readTsvManifest,
  repoRoot,
  runPsqlJson as runPsqlJsonRaw,
  runSupabaseJson,
  sha256,
  sha256File,
  writePrivateJson,
} from "./lib/supabase-isolation.mjs";

const SOURCE_PROJECT_REF = "ekekeywoxvdbfbmqyhjy";
const FORBIDDEN_COMMERCE_RELATIONS = [
  "bookings",
  "financial_audit_log",
  "gift_card_transactions",
  "gift_cards",
  "orders",
  "tenants",
  "user_tenants",
];
const PLATFORM_MANAGED_SECRETS = new Set([
  "SUPABASE_ANON_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_JWKS",
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
]);

function runPsqlJson(database, statement) {
  try {
    return runPsqlJsonRaw(database, statement);
  } catch {
    throw new Error(
      "read-only isolation inventory failed; raw database output suppressed",
    );
  }
}

function usage() {
  console.log(
    "usage: node scripts/supabase-isolation-preflight.mjs " +
      "--kind source|target --project-ref <ref> --subject-scope /absolute/private/scope.json --receipt /absolute/path.json " +
      "[--compare-receipt /absolute/source-receipt.json] [--overwrite]",
  );
}

function sqlArray(values) {
  return `ARRAY[${values.map(quoteLiteral).join(",")}]::text[]`;
}

function loadManifests() {
  const relationNames = readManifestLines(
    "supabase/isolation/mind-manual-tables.txt",
  );
  const functionNames = readManifestLines(
    "supabase/isolation/mind-manual-functions.txt",
  );
  const buckets = readManifestLines(
    "supabase/isolation/mind-manual-buckets.txt",
  );
  const secretNames = readManifestLines(
    "supabase/isolation/mind-manual-secrets.txt",
  );
  const scopes = readTsvManifest(
    "supabase/isolation/mind-manual-data-scopes.tsv",
    3,
  ).map(([relation, ownerColumn, copyMode]) => {
    assertIdentifier(relation, "data-scope relation");
    assertIdentifier(ownerColumn, "data-scope owner column");
    if (!new Set(["copy", "skip_transient"]).has(copyMode)) {
      throw new Error(`invalid data-scope mode for ${relation}: ${copyMode}`);
    }
    return { relation, ownerColumn, copyMode };
  });
  const edgeFunctions = readTsvManifest(
    "supabase/isolation/mind-manual-edge-functions.tsv",
    2,
  ).map(([name, verifyJwt]) => {
    if (!/^[a-z][a-z0-9-]*$/u.test(name)) {
      throw new Error(`invalid Edge Function name: ${name}`);
    }
    if (!new Set(["true", "false"]).has(verifyJwt)) {
      throw new Error(`invalid verify_jwt value for ${name}: ${verifyJwt}`);
    }
    return { name, verifyJwt: verifyJwt === "true" };
  });
  const externalBindings = readTsvManifest(
    "supabase/isolation/mind-manual-external-bindings.tsv",
    4,
  ).map(([name, owner, targetTemplate, requiredAction]) => ({
    name,
    owner,
    targetTemplate,
    requiredAction,
  }));

  for (const name of relationNames) {
    assertIdentifier(name, "relation manifest entry");
  }
  for (const name of functionNames) {
    assertIdentifier(name, "function manifest entry");
  }
  for (const name of secretNames) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
      throw new Error(`invalid secret manifest entry: ${name}`);
    }
  }

  const physicalRelations = relationNames.filter((name) =>
    name !== "plaid_items_safe"
  );
  const scopedRelations = scopes.map(({ relation }) => relation);
  if (
    canonicalJson([...physicalRelations].sort()) !==
      canonicalJson([...scopedRelations].sort())
  ) {
    throw new Error(
      "data-scope manifest must contain every physical relation exactly once and no view",
    );
  }

  const functionDirectories = readdirSync(
    resolve(repoRoot, "supabase/functions"),
    {
      withFileTypes: true,
    },
  )
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
  const declaredFunctions = edgeFunctions.map(({ name }) => name).sort();
  if (canonicalJson(functionDirectories) !== canonicalJson(declaredFunctions)) {
    throw new Error(
      "Edge Function manifest must contain every source function directory exactly once",
    );
  }

  return {
    relationNames,
    functionNames,
    buckets,
    secretNames,
    scopes,
    edgeFunctions,
    externalBindings,
  };
}

function catalogSql(manifests) {
  const relationArray = sqlArray(manifests.relationNames);
  const functionArray = sqlArray(manifests.functionNames);
  return `
BEGIN READ ONLY;
SET ROLE postgres;
SELECT json_build_object(
  'relations', COALESCE((
    SELECT json_agg(relation_row ORDER BY relation_row->>'name')
    FROM (
      SELECT json_build_object(
        'name', c.relname,
        'kind', c.relkind,
        'rowLevelSecurity', c.relrowsecurity,
        'forceRowLevelSecurity', c.relforcerowsecurity,
        'acl', COALESCE(c.relacl::text, ''),
        'columns', COALESCE((
          SELECT json_agg(json_build_object(
            'position', a.attnum,
            'name', a.attname,
            'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
            'notNull', a.attnotnull,
            'identity', a.attidentity,
            'generated', a.attgenerated,
            'default', COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), ''),
            'acl', COALESCE(a.attacl::text, '')
          ) ORDER BY a.attnum)
          FROM pg_catalog.pg_attribute a
          LEFT JOIN pg_catalog.pg_attrdef d
            ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        ), '[]'::json),
        'constraints', COALESCE((
          SELECT json_agg(json_build_object(
            'name', con.conname,
            'type', con.contype,
            'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
          ) ORDER BY con.conname)
          FROM pg_catalog.pg_constraint con
          WHERE con.conrelid = c.oid
        ), '[]'::json),
        'indexes', COALESCE((
          SELECT json_agg(pg_catalog.pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text)
          FROM pg_catalog.pg_index i
          WHERE i.indrelid = c.oid
        ), '[]'::json),
        'policies', COALESCE((
          SELECT json_agg(json_build_object(
            'name', pol.polname,
            'command', pol.polcmd,
            'permissive', pol.polpermissive,
            'roles', ARRAY(
              SELECT pg_catalog.pg_get_userbyid(role_oid)
              FROM unnest(pol.polroles) AS role_oid
              ORDER BY pg_catalog.pg_get_userbyid(role_oid)
            ),
            'using', COALESCE(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), ''),
            'check', COALESCE(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')
          ) ORDER BY pol.polname)
          FROM pg_catalog.pg_policy pol
          WHERE pol.polrelid = c.oid
        ), '[]'::json),
        'triggers', COALESCE((
          SELECT json_agg(pg_catalog.pg_get_triggerdef(t.oid, true) ORDER BY t.tgname)
          FROM pg_catalog.pg_trigger t
          WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
        ), '[]'::json),
        'viewDefinition', CASE
          WHEN c.relkind IN ('v', 'm') THEN pg_catalog.pg_get_viewdef(c.oid, true)
          ELSE ''
        END
      ) AS relation_row
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY(${relationArray})
        AND c.relkind IN ('r', 'p', 'v', 'm')
    ) expected_relation_rows
  ), '[]'::json),
  'allPublicRelations', COALESCE((
    SELECT json_agg(c.relname ORDER BY c.relname)
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  ), '[]'::json),
  'functions', COALESCE((
    SELECT json_agg(json_build_object(
      'name', p.proname,
      'identityArguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'result', pg_catalog.pg_get_function_result(p.oid),
      'language', l.lanname,
      'securityDefiner', p.prosecdef,
      'configuration', COALESCE(p.proconfig, ARRAY[]::text[]),
      'acl', COALESCE(p.proacl::text, ''),
      'definition', pg_catalog.pg_get_functiondef(p.oid)
    ) ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname = ANY(${functionArray})
  ), '[]'::json),
  'allPublicFunctions', COALESCE((
    SELECT json_agg(json_build_object(
      'name', p.proname,
      'identityArguments', pg_catalog.pg_get_function_identity_arguments(p.oid)
    ) ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ), '[]'::json)
)::text;
COMMIT;
`;
}

function rowDigestExpression(valueExpression, filterExpression = null) {
  const filter = filterExpression ? ` FILTER (WHERE ${filterExpression})` : "";
  return `encode(extensions.digest(convert_to(COALESCE(string_agg(${valueExpression}, E'\\n' ORDER BY ${valueExpression})${filter}, ''), 'UTF8'), 'sha256'), 'hex')`;
}

export function dataInventorySql(
  scopes,
  relationMap,
  subjectScope,
  kind = "source",
) {
  const selects = [];
  for (const scope of scopes) {
    const relation = relationMap.get(scope.relation);
    if (!relation || !new Set(["r", "p"]).has(relation.kind)) continue;
    const columns = new Set(relation.columns.map(({ name }) => name));
    if (!columns.has(scope.ownerColumn)) continue;
    const relationName = quoteIdentifier(scope.relation);
    const ownerColumn = quoteIdentifier(scope.ownerColumn);
    const approved = scopeSqlPredicate(
      subjectScope,
      `rows.${scope.ownerColumn}`,
    );
    const inventoried = kind === "source" ? approved : "true";
    const owned = `(${ownerColumn} IN (SELECT id FROM auth.users))`;
    const selected = scope.copyMode === "copy"
      ? `(${inventoried} AND ${owned})`
      : "false";
    selects.push(`
      SELECT
        ${quoteLiteral(scope.relation)}::text AS relation,
        ${quoteLiteral(scope.copyMode)}::text AS copy_mode,
        count(*) FILTER (WHERE ${inventoried})::bigint AS total_count,
        count(*) FILTER (WHERE ${selected})::bigint AS copy_count,
        ${rowDigestExpression("row_json", inventoried)} AS total_sha256,
        ${rowDigestExpression("row_json", selected)} AS copy_sha256,
        count(*) FILTER (WHERE NOT ${approved} AND ${owned})::bigint AS excluded_owned_count,
        count(*) FILTER (WHERE ${ownerColumn} IS NULL OR NOT ${owned})::bigint AS unowned_count,
        count(*) FILTER (WHERE ${ownerColumn} IS NULL OR NOT ${approved})::bigint AS unapproved_count
      FROM (
        SELECT to_jsonb(source_row)::text AS row_json, source_row.*
        FROM public.${relationName} AS source_row
      ) AS rows
    `);
  }
  if (selects.length === 0) return "SELECT '[]'::json::text;";
  return `
BEGIN READ ONLY;
SET ROLE postgres;
SELECT COALESCE(json_agg(json_build_object(
  'relation', relation,
  'copyMode', copy_mode,
  'totalRowCount', total_count,
  'copyRowCount', copy_count,
  'totalRowsSha256', total_sha256,
  'copyRowsSha256', copy_sha256,
  'excludedOwnedRowCount', excluded_owned_count,
  'unownedRowCount', unowned_count,
  'unapprovedRowCount', unapproved_count
) ORDER BY relation), '[]'::json)::text
FROM (${selects.join("\nUNION ALL\n")}) inventory;
COMMIT;
`;
}

export function authInventorySql(subjectScope, kind = "source") {
  const selected = (column) =>
    kind === "source" ? scopeSqlPredicate(subjectScope, column) : "true";
  const refreshPredicate = kind === "source"
    ? `user_id IN (SELECT id::text FROM auth.users WHERE ${selected("id")})`
    : "true";
  return `
BEGIN READ ONLY;
SET ROLE postgres;
SELECT json_build_object(
  'userCount', (SELECT count(*) FROM auth.users WHERE ${selected("id")}),
  'identityCount', (SELECT count(*) FROM auth.identities WHERE ${
    selected("user_id")
  }),
  'subjectIdsSha256', (
    SELECT ${rowDigestExpression("id::text")}
    FROM auth.users WHERE ${selected("id")}
  ),
  'usersSha256', (
    SELECT ${rowDigestExpression("to_jsonb(auth_user)::text")}
    FROM auth.users auth_user WHERE ${selected("auth_user.id")}
  ),
  'identitiesSha256', (
    SELECT ${rowDigestExpression("to_jsonb(auth_identity)::text")}
    FROM auth.identities auth_identity WHERE ${
    selected("auth_identity.user_id")
  }
  ),
  'providerCounts', COALESCE((
    SELECT json_object_agg(provider, provider_count ORDER BY provider)
    FROM (
      SELECT provider, count(*) AS provider_count
      FROM auth.identities
      WHERE ${selected("user_id")}
      GROUP BY provider
    ) providers
  ), '{}'::json),
  'sessionCountExcluded', (SELECT count(*) FROM auth.sessions WHERE ${
    selected("user_id")
  }),
  'refreshTokenCountExcluded', (SELECT count(*) FROM auth.refresh_tokens WHERE ${refreshPredicate}),
  'mfaFactorCount', (SELECT count(*) FROM auth.mfa_factors WHERE ${
    selected("user_id")
  }),
  'ssoProviderCount', (${
    kind === "source"
      ? `SELECT count(DISTINCT provider) FROM auth.identities WHERE ${
        selected("user_id")
      } AND (provider = 'sso' OR provider LIKE 'sso:%')`
      : "SELECT count(*) FROM auth.sso_providers"
  }),
  'excludedUserCount', (SELECT count(*) FROM auth.users WHERE NOT ${
    scopeSqlPredicate(subjectScope, "id")
  }),
  'unapprovedIdentityCount', (SELECT count(*) FROM auth.identities WHERE user_id IS NULL OR NOT ${
    scopeSqlPredicate(subjectScope, "user_id")
  }),
  'unapprovedSessionCount', (SELECT count(*) FROM auth.sessions WHERE user_id IS NULL OR NOT ${
    scopeSqlPredicate(subjectScope, "user_id")
  }),
  'unapprovedRefreshTokenCount', (SELECT count(*) FROM auth.refresh_tokens WHERE user_id IS NULL OR user_id NOT IN (SELECT id::text FROM auth.users WHERE ${
    scopeSqlPredicate(subjectScope, "id")
  })),
  'nonDefaultInstanceCount', (
    SELECT count(*) FROM auth.users
    WHERE ${
    selected("id")
  } AND instance_id <> '00000000-0000-0000-0000-000000000000'::uuid
  ),
  'userColumns', (
    SELECT json_agg(json_build_object(
      'position', a.attnum,
      'name', a.attname,
      'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull,
      'identity', a.attidentity,
      'generated', a.attgenerated,
      'default', COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
    ) ORDER BY a.attnum)
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'auth.users'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  ),
  'identityColumns', (
    SELECT json_agg(json_build_object(
      'position', a.attnum,
      'name', a.attname,
      'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull,
      'identity', a.attidentity,
      'generated', a.attgenerated,
      'default', COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
    ) ORDER BY a.attnum)
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'auth.identities'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  )
)::text;
COMMIT;
`;
}

export function storageInventorySql(buckets, kind = "source") {
  const bucketArray = sqlArray(buckets);
  return `
BEGIN READ ONLY;
SET ROLE postgres;
SELECT json_build_object(
  'buckets', COALESCE((
    SELECT json_agg(json_build_object(
      'name', b.id,
      'public', b.public,
      'fileSizeLimit', b.file_size_limit,
      'allowedMimeTypes', b.allowed_mime_types
    ) ORDER BY b.id)
    FROM storage.buckets b
    WHERE ${kind === "target" ? "true" : `b.id = ANY(${bucketArray})`}
  ), '[]'::json),
  'objects', COALESCE((
    SELECT json_agg(json_build_object(
      'bucket', o.bucket_id,
      'path', o.name,
      'ownerId', o.owner_id,
      'metadataText', COALESCE(o.metadata::text, ''),
      'bytes', COALESCE((o.metadata->>'size')::bigint, 0)
    ) ORDER BY o.bucket_id, o.name)
    FROM storage.objects o
    WHERE o.bucket_id = ANY(${bucketArray})
  ), '[]'::json)
)::text;
COMMIT;
`;
}

// Raw object paths/owners stay in memory. Receipts expose selected aggregates only.
export function summarizeStorageInventory(raw, subjectScope, kind = "source") {
  const assignments = new Map(
    subjectScope.legacyStorageAssignments.map((
      entry,
    ) => [`${entry.bucket}:${entry.pathSha256}`, entry]),
  );
  const usedAssignments = new Set();
  const selectedByBucket = new Map();
  const excludedByBucket = new Map();
  const blockers = [];
  if (kind === "target") {
    const expected = new Set(["photos", "voice-samples"]);
    const present = new Set(raw.buckets.map((bucket) => bucket.name));
    if ([...present].some((name) => !expected.has(name))) {
      blockers.push("target has storage buckets outside the allowlist");
    }
    for (const bucket of expected) {
      if (!present.has(bucket)) {
        blockers.push(`missing private storage bucket: ${bucket}`);
      }
    }
  }
  const targets = new Set();
  for (const object of raw.objects) {
    if (!Number.isSafeInteger(object.bytes) || object.bytes < 0) {
      throw new Error("invalid storage object size inventory");
    }
    const assignmentKey = `${object.bucket}:${sha256(object.path)}`;
    if (assignments.has(assignmentKey)) {
      if (usedAssignments.has(assignmentKey)) {
        throw new Error("duplicate storage object for legacy assignment");
      }
      usedAssignments.add(assignmentKey);
    }
    const classification = classifyStorageObject(subjectScope, object);
    if (!classification.selected) {
      excludedByBucket.set(
        object.bucket,
        (excludedByBucket.get(object.bucket) ?? 0) + 1,
      );
      if (kind === "target") {
        blockers.push(
          `target storage contains unapproved objects: ${object.bucket}`,
        );
      }
      if (kind === "source") continue;
    }
    const targetPath = classification.targetPath ?? object.path;
    if (kind === "target" && targetPath !== object.path) {
      blockers.push(
        `target storage still requires legacy remapping: ${object.bucket}`,
      );
    }
    const targetKey = `${object.bucket}:${targetPath}`;
    if (targets.has(targetKey)) {
      throw new Error("scoped storage objects collide at the target path");
    }
    targets.add(targetKey);
    const entries = selectedByBucket.get(object.bucket) ?? [];
    entries.push({ ...object, targetPath });
    selectedByBucket.set(object.bucket, entries);
  }
  // Target paths are remapped. Selected legacy assignments must still resolve on
  // source; exclusion tombstones stay valid when an unrelated owner deletes a file.
  const subjects = new Set(subjectScope.subjectIds);
  if (
    kind === "source" &&
    [...assignments.entries()].some(([key, assignment]) =>
      subjects.has(assignment.ownerSubjectId) && !usedAssignments.has(key)
    )
  ) {
    throw new Error("subject scope contains unused legacy storage assignments");
  }
  const digest = (values) => sha256(values.sort().join("\n"));
  return {
    buckets: raw.buckets,
    objects: [...selectedByBucket.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    ).map(([bucket, objects]) => ({
      bucket,
      objectCount: objects.length,
      totalBytes: objects.reduce(
        (total, object) => total + Number(object.bytes),
        0,
      ),
      pathManifestSha256: digest(objects.map((object) => object.path)),
      targetPathManifestSha256: digest(
        objects.map((object) => object.targetPath),
      ),
      metadataManifestSha256: digest(
        objects.map((object) =>
          [object.path, object.metadataText, object.ownerId ?? ""].join("\t")
        ),
      ),
      missingOwnerCount: objects.filter((object) => !object.ownerId).length,
      ownerFolderMismatchCount: 0,
      authFolderMismatchCount: 0,
      flatPathCount:
        objects.filter((object) => !object.path.includes("/")).length,
      pathPolicy: objects.some((object) => object.path !== object.targetPath)
        ? "explicit_legacy_remap_required"
        : "owner_prefixed",
    })),
    excludedObjects: [...excludedByBucket.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )
      .map(([bucket, objectCount]) => ({ bucket, objectCount })),
    blockers: [...new Set(blockers)],
  };
}

export function scopeInventoryBlockers(kind, binding, auth, publicData) {
  validateSubjectScopeBinding(binding, "preflight subject scope");
  const blockers = [];
  if (
    kind === "source" &&
    (auth.userCount !== binding.subjectCount ||
      auth.subjectIdsSha256 !== binding.subjectIdsSha256)
  ) {
    blockers.push(
      "approved Auth subjects are missing or differ from the private subject scope",
    );
  }
  if (
    kind === "target" &&
    (auth.excludedUserCount > 0 || auth.unapprovedIdentityCount > 0 ||
      auth.unapprovedSessionCount > 0 || auth.unapprovedRefreshTokenCount > 0)
  ) {
    blockers.push(
      "target Auth contains users, identities, or sessions outside the approved subject scope",
    );
  }
  if (
    auth.mfaFactorCount > 0 || auth.ssoProviderCount > 0 ||
    auth.nonDefaultInstanceCount > 0
  ) {
    blockers.push(
      "inventoried Auth includes unsupported MFA, SSO, or non-default instance state",
    );
  }
  for (const row of publicData) {
    if (row.copyMode === "copy" && row.unownedRowCount > 0) {
      blockers.push(
        `${row.relation} has ${row.unownedRowCount} non-owned rows without a disposition`,
      );
    }
    if (kind === "target" && row.unapprovedRowCount > 0) {
      blockers.push(
        `${row.relation} has rows outside the approved target subject scope`,
      );
    }
  }
  return blockers;
}

function fingerprintCatalog(rawCatalog) {
  const relations = rawCatalog.relations.map((relation) => ({
    name: relation.name,
    kind: relation.kind,
    rowLevelSecurity: relation.rowLevelSecurity,
    forceRowLevelSecurity: relation.forceRowLevelSecurity,
    columnNames: relation.columns.map(({ name }) => name),
    columnFingerprintSha256: sha256(canonicalJson(relation.columns)),
    constraintFingerprintSha256: sha256(canonicalJson(relation.constraints)),
    indexFingerprintSha256: sha256(canonicalJson(relation.indexes)),
    policyFingerprintSha256: sha256(canonicalJson(relation.policies)),
    triggerFingerprintSha256: sha256(canonicalJson(relation.triggers)),
    grantFingerprintSha256: sha256(
      canonicalJson({
        relationAcl: relation.acl,
        columnAcls: relation.columns.map(({ name, acl }) => ({ name, acl })),
      }),
    ),
    definitionFingerprintSha256: sha256(relation.viewDefinition || ""),
    fullFingerprintSha256: sha256(canonicalJson(relation)),
  }));
  const functions = rawCatalog.functions.map((functionRow) => {
    const { definition, ...metadata } = functionRow;
    return {
      ...metadata,
      definitionSha256: sha256(definition),
      fullFingerprintSha256: sha256(canonicalJson(functionRow)),
    };
  });
  return {
    relations,
    functions,
    allPublicRelations: rawCatalog.allPublicRelations,
    allPublicFunctions: rawCatalog.allPublicFunctions,
  };
}

export function compareReceipts(receipt, source, blockers) {
  if (source.version !== 1 || source.kind !== "source") {
    blockers.push(
      "comparison receipt is not a version-1 source preflight receipt",
    );
    return;
  }
  if (source.status !== "ready") {
    blockers.push("comparison source receipt is not ready");
  }
  try {
    assertScopeBinding(
      receipt.subjectScope,
      source.subjectScope,
      "comparison subject scope",
    );
  } catch (error) {
    blockers.push(error.message);
    return;
  }

  const compareNamed = (label, targetRows, sourceRows, fields) => {
    const targetMap = new Map(
      targetRows.map((row) => [row.name ?? row.relation ?? row.bucket, row]),
    );
    for (const sourceRow of sourceRows) {
      const key = sourceRow.name ?? sourceRow.relation ?? sourceRow.bucket;
      const targetRow = targetMap.get(key);
      if (!targetRow) {
        blockers.push(`${label} missing from target: ${key}`);
        continue;
      }
      for (const field of fields) {
        if (
          canonicalJson(targetRow[field]) !== canonicalJson(sourceRow[field])
        ) {
          blockers.push(`${label} mismatch for ${key}: ${field}`);
        }
      }
    }
  };

  compareNamed(
    "relation",
    receipt.catalog.relations,
    source.catalog.relations,
    ["fullFingerprintSha256"],
  );
  compareNamed(
    "function",
    receipt.catalog.functions,
    source.catalog.functions,
    ["fullFingerprintSha256"],
  );
  compareNamed(
    "public data",
    receipt.publicData,
    source.publicData,
    ["copyRowCount", "copyRowsSha256"],
  );
  const targetStorageMap = new Map(
    receipt.storage.objects.map((row) => [row.bucket, row]),
  );
  for (const sourceStorage of source.storage.objects) {
    const targetStorage = targetStorageMap.get(sourceStorage.bucket);
    if (!targetStorage) {
      blockers.push(`storage missing from target: ${sourceStorage.bucket}`);
      continue;
    }
    for (const field of ["objectCount", "totalBytes"]) {
      if (targetStorage[field] !== sourceStorage[field]) {
        blockers.push(`storage mismatch for ${sourceStorage.bucket}: ${field}`);
      }
    }
    if (
      targetStorage.pathManifestSha256 !==
        sourceStorage.targetPathManifestSha256
    ) {
      blockers.push(
        `storage mismatch for ${sourceStorage.bucket}: pathManifestSha256`,
      );
    }
  }
  for (
    const field of [
      "userCount",
      "identityCount",
      "subjectIdsSha256",
      "usersSha256",
      "identitiesSha256",
      "usersColumnFingerprintSha256",
      "identitiesColumnFingerprintSha256",
    ]
  ) {
    if (
      canonicalJson(receipt.auth[field]) !== canonicalJson(source.auth[field])
    ) {
      blockers.push(`Auth identity mismatch: ${field}`);
    }
  }
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    usage();
    return;
  }
  const args = parseArgs(process.argv.slice(2), {
    kind: { required: true },
    "project-ref": { required: true },
    "subject-scope": { required: true },
    receipt: { required: true },
    "compare-receipt": {},
    overwrite: { type: "boolean" },
    "exit-zero": { type: "boolean" },
  });
  if (!new Set(["source", "target"]).has(args.kind)) {
    throw new Error("--kind must be source or target");
  }
  const projectRef = assertProjectRef(args["project-ref"]);
  if (args.kind === "source" && projectRef !== SOURCE_PROJECT_REF) {
    throw new Error(`source project must be ${SOURCE_PROJECT_REF}`);
  }
  if (args.kind === "target" && projectRef === SOURCE_PROJECT_REF) {
    throw new Error(
      "target project ref must differ from the source project ref",
    );
  }
  const subjectScope = loadSubjectScope(args["subject-scope"], {
    ...(args.kind === "target" ? { targetProjectRef: projectRef } : {}),
  });
  const scopeBinding = subjectScopeBinding(subjectScope);
  validateSubjectScopeBinding(scopeBinding, "preflight subject scope");

  const manifests = loadManifests();
  const database = getLinkedDatabaseConfig(projectRef);
  const rawCatalog = runPsqlJson(database, catalogSql(manifests));
  const catalog = fingerprintCatalog(rawCatalog);
  const relationMap = new Map(
    rawCatalog.relations.map((row) => [row.name, row]),
  );
  const rawPublicData = runPsqlJson(
    database,
    dataInventorySql(manifests.scopes, relationMap, subjectScope, args.kind),
  );
  const publicData = rawPublicData.map((
    { excludedOwnedRowCount, unapprovedRowCount, ...scoped },
  ) => scoped);
  const rawAuth = runPsqlJson(
    database,
    authInventorySql(subjectScope, args.kind),
  );
  const auth = {
    ...rawAuth,
    userColumnNames: rawAuth.userColumns.map(({ name }) => name),
    identityColumnNames: rawAuth.identityColumns.map(({ name }) => name),
    usersColumnFingerprintSha256: sha256(canonicalJson(rawAuth.userColumns)),
    identitiesColumnFingerprintSha256: sha256(
      canonicalJson(rawAuth.identityColumns),
    ),
  };
  delete auth.userColumns;
  delete auth.identityColumns;
  delete auth.excludedUserCount;
  delete auth.unapprovedIdentityCount;
  delete auth.unapprovedSessionCount;
  delete auth.unapprovedRefreshTokenCount;
  const storage = summarizeStorageInventory(
    runPsqlJson(database, storageInventorySql(manifests.buckets, args.kind)),
    subjectScope,
    args.kind,
  );

  const liveSecrets = runSupabaseJson(
    ["secrets", "list", "--project-ref", projectRef],
    "Supabase secret-name inventory",
  );
  const liveSecretNames = new Set(liveSecrets.map(({ name }) => name));
  const secrets = manifests.secretNames.map((name) => ({
    name,
    present: liveSecretNames.has(name),
  }));
  const extraUserManagedSecretNames = [...liveSecretNames]
    .filter(
      (name) =>
        !PLATFORM_MANAGED_SECRETS.has(name) &&
        !manifests.secretNames.includes(name),
    )
    .sort();

  const liveFunctions = runSupabaseJson(
    ["functions", "list", "--project-ref", projectRef],
    "Supabase Edge Function inventory",
  );
  const liveFunctionMap = new Map(liveFunctions.map((row) => [row.name, row]));
  const edgeFunctions = manifests.edgeFunctions.map((expected) => {
    const actual = liveFunctionMap.get(expected.name);
    return {
      name: expected.name,
      expectedVerifyJwt: expected.verifyJwt,
      present: Boolean(actual),
      active: actual?.status === "ACTIVE",
      actualVerifyJwt: actual ? Boolean(actual.verify_jwt) : null,
      deployedVersion: actual?.version ?? null,
    };
  });

  const blockers = [
    ...storage.blockers,
    ...scopeInventoryBlockers(args.kind, scopeBinding, rawAuth, rawPublicData),
  ];
  delete storage.blockers;
  const excludedDataInventory = {
    authUserCount: rawAuth.excludedUserCount,
    authIdentityCount: rawAuth.unapprovedIdentityCount,
    authSessionCount: rawAuth.unapprovedSessionCount,
    authRefreshTokenCount: rawAuth.unapprovedRefreshTokenCount,
    publicData: rawPublicData.map((
      { relation, excludedOwnedRowCount, unapprovedRowCount },
    ) => ({ relation, excludedOwnedRowCount, unapprovedRowCount })),
    storageObjects: storage.excludedObjects,
  };
  delete storage.excludedObjects;
  const expectedRelationSet = new Set(manifests.relationNames);
  const actualRelationSet = new Set(catalog.relations.map(({ name }) => name));
  for (const name of manifests.relationNames) {
    if (!actualRelationSet.has(name)) {
      blockers.push(`missing public relation: ${name}`);
    }
  }
  for (const scope of manifests.scopes) {
    const relation = relationMap.get(scope.relation);
    if (!relation) continue;
    if (!new Set(["r", "p"]).has(relation.kind)) {
      blockers.push(
        `data-scoped relation is not a physical table: ${scope.relation}`,
      );
    } else if (
      !relation.columns.some(({ name }) => name === scope.ownerColumn)
    ) {
      blockers.push(
        `owner column ${scope.ownerColumn} is missing from ${scope.relation}`,
      );
    }
  }
  const functionCounts = new Map();
  for (const functionRow of catalog.functions) {
    functionCounts.set(
      functionRow.name,
      (functionCounts.get(functionRow.name) ?? 0) + 1,
    );
  }
  for (const name of manifests.functionNames) {
    const count = functionCounts.get(name) ?? 0;
    if (count !== 1) {
      blockers.push(`reviewed function ${name} resolves ${count} times`);
    }
  }
  const expectedFunctionSet = new Set(manifests.functionNames);
  const excludedPublicFunctions = catalog.allPublicFunctions
    .filter(({ name }) => !expectedFunctionSet.has(name))
    .map(({ name, identityArguments }) => `${name}(${identityArguments})`)
    .sort();
  for (const relation of catalog.relations) {
    if (relation.kind !== (relation.name === "plaid_items_safe" ? "v" : "r")) {
      blockers.push(
        `unexpected relation kind for ${relation.name}: ${relation.kind}`,
      );
    }
    if (relation.kind === "r" && !relation.rowLevelSecurity) {
      blockers.push(`row-level security is disabled: ${relation.name}`);
    }
  }
  if (
    (publicData.find(({ relation }) => relation === "plaid_items")
      ?.copyRowCount ?? 0) > 0
  ) {
    blockers.push(
      "Plaid items exist; record a target reauthorization or Vault-secret migration decision before export",
    );
  }
  for (const bucketName of manifests.buckets) {
    const bucket = storage.buckets.find(({ name }) => name === bucketName);
    if (!bucket) blockers.push(`missing private storage bucket: ${bucketName}`);
    else if (bucket.public) {
      blockers.push(`storage bucket must be private: ${bucketName}`);
    }
  }
  for (const objectInventory of storage.objects) {
    if (objectInventory.ownerFolderMismatchCount > 0) {
      blockers.push(`storage owner-folder mismatch: ${objectInventory.bucket}`);
    }
    if (objectInventory.authFolderMismatchCount > 0) {
      if (objectInventory.pathPolicy !== "explicit_legacy_remap_required") {
        blockers.push(
          `storage path is not scoped to a migrated Auth subject: ${objectInventory.bucket}`,
        );
      }
    }
  }
  for (const secret of secrets) {
    if (!secret.present) {
      blockers.push(`missing user-managed secret: ${secret.name}`);
    }
  }
  for (const edgeFunction of edgeFunctions) {
    if (!edgeFunction.present) {
      blockers.push(`missing Edge Function: ${edgeFunction.name}`);
    } else if (!edgeFunction.active) {
      blockers.push(`Edge Function is not active: ${edgeFunction.name}`);
    } else if (
      edgeFunction.actualVerifyJwt !== edgeFunction.expectedVerifyJwt
    ) {
      blockers.push(`verify_jwt mismatch: ${edgeFunction.name}`);
    }
  }

  const excludedPublicRelations = catalog.allPublicRelations
    .filter((name) => !expectedRelationSet.has(name))
    .sort();
  if (args.kind === "target" && excludedPublicRelations.length > 0) {
    blockers.push(
      `target has public relations outside the allowlist: ${
        excludedPublicRelations.join(", ")
      }`,
    );
  }
  if (args.kind === "target" && excludedPublicFunctions.length > 0) {
    blockers.push(
      `target has public functions outside the allowlist: ${
        excludedPublicFunctions.join(", ")
      }`,
    );
  }
  const expectedEdgeFunctionSet = new Set(
    manifests.edgeFunctions.map(({ name }) => name),
  );
  const extraEdgeFunctions = liveFunctions
    .map(({ name }) => name)
    .filter((name) => !expectedEdgeFunctionSet.has(name))
    .sort();
  if (args.kind === "target" && extraEdgeFunctions.length > 0) {
    blockers.push(
      `target has Edge Functions outside the allowlist: ${
        extraEdgeFunctions.join(", ")
      }`,
    );
  }
  if (args.kind === "target" && extraUserManagedSecretNames.length > 0) {
    blockers.push(
      `target has user-managed secrets outside the allowlist: ${
        extraUserManagedSecretNames.join(", ")
      }`,
    );
  }
  if (args.kind === "target") {
    for (const forbidden of FORBIDDEN_COMMERCE_RELATIONS) {
      if (catalog.allPublicRelations.includes(forbidden)) {
        blockers.push(`commerce relation present on target: ${forbidden}`);
      }
    }
  }

  const receipt = {
    version: 1,
    kind: args.kind,
    projectRef,
    subjectScope: scopeBinding,
    capturedAt: new Date().toISOString(),
    status: "pending",
    sourcePolicy: {
      canonicalSourceProjectRef: SOURCE_PROJECT_REF,
      commerceRelationsForbiddenOnTarget: FORBIDDEN_COMMERCE_RELATIONS,
    },
    manifests: {
      relationsSha256: sha256File(
        resolve(repoRoot, "supabase/isolation/mind-manual-tables.txt"),
      ),
      functionsSha256: sha256File(
        resolve(repoRoot, "supabase/isolation/mind-manual-functions.txt"),
      ),
      dataScopesSha256: sha256File(
        resolve(repoRoot, "supabase/isolation/mind-manual-data-scopes.tsv"),
      ),
      bucketsSha256: sha256File(
        resolve(repoRoot, "supabase/isolation/mind-manual-buckets.txt"),
      ),
      secretsSha256: sha256File(
        resolve(repoRoot, "supabase/isolation/mind-manual-secrets.txt"),
      ),
      edgeFunctionsSha256: sha256File(
        resolve(repoRoot, "supabase/isolation/mind-manual-edge-functions.tsv"),
      ),
      externalBindingsSha256: sha256File(
        resolve(
          repoRoot,
          "supabase/isolation/mind-manual-external-bindings.tsv",
        ),
      ),
    },
    catalog,
    publicData,
    excludedDataInventory,
    auth,
    storage,
    secrets: {
      expected: secrets,
      extraUserManagedNames: extraUserManagedSecretNames,
      valuesIncluded: false,
    },
    edgeFunctions,
    externalBindings: manifests.externalBindings.map(({ name, owner }) => ({
      name,
      owner,
    })),
    excludedPublicRelations,
    excludedPublicFunctions,
    extraEdgeFunctions,
    blockers,
  };

  if (args["compare-receipt"]) {
    const comparisonPath = assertAbsolutePath(
      args["compare-receipt"],
      "comparison receipt",
    );
    const comparison = privateSnapshot(comparisonPath, "comparison receipt", {
      json: true,
    });
    compareReceipts(receipt, comparison.value, blockers);
    receipt.comparedSourceReceiptSha256 = comparison.sha256;
  }
  receipt.status = blockers.length === 0 ? "ready" : "blocked";
  writePrivateJson(args.receipt, receipt, { overwrite: args.overwrite });

  console.log(`preflight ${receipt.status}: ${blockers.length} blocker(s)`);
  console.log(`receipt sha256: ${sha256File(args.receipt)}`);
  if (blockers.length > 0 && !args["exit-zero"]) process.exitCode = 2;
}

if (
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
