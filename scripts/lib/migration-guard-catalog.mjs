import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalJson, repoRoot, sha256, sha256File } from "./supabase-isolation.mjs";

// This is a reviewed repository reference, never a caller-supplied golden file.
// Regeneration requires installing the exact artifacts into a disposable local
// PostgreSQL fixture and reviewing the resulting reference change alongside SQL.
const REFERENCE = "supabase/isolation/migration-guard-catalog.reference.json";
const PINNED_INPUTS = [
  "supabase/isolation/source-write-fence.sql",
  "supabase/isolation/storage-write-gateway.sql",
  "supabase/isolation/mind-manual-data-scopes.tsv",
  "supabase/isolation/mind-manual-edge-functions.tsv",
];
const COMPONENTS = [
  "schema", "objects", "relations", "types", "functions", "triggers",
  "defaultPrivileges", "relationScopes", "edgeFunctions", "storageGuard",
];

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    throw new Error(`Invalid ${label} fields`);
  }
}

// Effective ACLs avoid unstable ACL array order, while preserving grantor,
// grantee, privilege and grant option. PUBLIC is not a role OID.
function aclSql(expression, owner, kind) {
  return `COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'grantor', pg_get_userbyid(a.grantor),
    'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'privilege', a.privilege_type, 'grantable', a.is_grantable
  ) ORDER BY pg_get_userbyid(a.grantor), a.grantee = 0 DESC,
    CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    a.privilege_type, a.is_grantable)
  FROM aclexplode(COALESCE(${expression}, acldefault('${kind}', ${owner}))) a), '[]'::jsonb)`;
}

/** Exact structure and static registry only; no subject IDs, phase or leases. */
export function migrationGuardCatalogSql({ transaction = true } = {}) {
  if (typeof transaction !== "boolean") throw new Error("Invalid guard catalog transaction option");
  return `
${transaction ? "BEGIN READ ONLY;" : ""}
SET LOCAL ROLE postgres;
SET LOCAL search_path = pg_catalog;
SELECT jsonb_build_object(
  'schema', COALESCE((SELECT jsonb_build_object(
    'name', n.nspname, 'owner', pg_get_userbyid(n.nspowner),
    'acl', ${aclSql("n.nspacl", "n.nspowner", "n")}
  ) FROM pg_namespace n WHERE n.nspname = 'mind_manual_migration'), 'null'::jsonb),
  'objects', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'catalog', d.classid::regclass::text, 'type', obj.type,
    'schema', obj.schema, 'name', obj.name, 'identity', obj.identity,
    'dependency', d.deptype
  ) ORDER BY d.classid::regclass::text, obj.type, obj.identity, d.deptype)
  FROM pg_depend d JOIN pg_namespace n ON n.oid = d.refobjid
  CROSS JOIN LATERAL pg_identify_object(d.classid, d.objid, d.objsubid) obj
  WHERE d.refclassid = 'pg_namespace'::regclass AND n.nspname = 'mind_manual_migration'), '[]'::jsonb),
  'relations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'name', c.relname, 'kind', c.relkind, 'owner', pg_get_userbyid(c.relowner),
    'persistence', c.relpersistence, 'replicaIdentity', c.relreplident,
    'rowLevelSecurity', c.relrowsecurity, 'forceRowLevelSecurity', c.relforcerowsecurity,
    'options', COALESCE(c.reloptions, ARRAY[]::text[]), 'isPartition', c.relispartition,
    'acl', ${aclSql("c.relacl", "c.relowner", "r")},
    'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'position', a.attnum, 'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull,
      'identity', a.attidentity, 'generated', a.attgenerated,
      'storage', a.attstorage, 'collation', a.attcollation::regcollation::text,
      'default', COALESCE(pg_get_expr(ad.adbin, ad.adrelid, false), ''),
      'acl', ${aclSql("a.attacl", "c.relowner", "c")}
    ) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef ad
      ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name', con.conname, 'type', con.contype,
      'definition', pg_get_constraintdef(con.oid, false),
      'validated', con.convalidated, 'deferrable', con.condeferrable,
      'deferred', con.condeferred, 'noInherit', con.connoinherit
    ) ORDER BY con.conname) FROM pg_constraint con WHERE con.conrelid = c.oid), '[]'::jsonb),
    'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'definition', pg_get_indexdef(i.indexrelid), 'valid', i.indisvalid,
      'ready', i.indisready, 'live', i.indislive, 'clustered', i.indisclustered,
      'replicaIdentity', i.indisreplident
    ) ORDER BY ci.relname) FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
      WHERE i.indrelid = c.oid), '[]'::jsonb),
    'policies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
      'roles', ARRAY(SELECT CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END
        FROM unnest(p.polroles) r ORDER BY CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END),
      'using', COALESCE(pg_get_expr(p.polqual, p.polrelid, false), ''),
      'check', COALESCE(pg_get_expr(p.polwithcheck, p.polrelid, false), '')
    ) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid = c.oid), '[]'::jsonb),
    'rules', COALESCE((SELECT jsonb_agg(pg_get_ruledef(r.oid, false) ORDER BY r.rulename)
      FROM pg_rewrite r WHERE r.ev_class = c.oid), '[]'::jsonb),
    'parents', ARRAY(SELECT pn.nspname || '.' || pc.relname FROM pg_inherits i
      JOIN pg_class pc ON pc.oid = i.inhparent JOIN pg_namespace pn ON pn.oid = pc.relnamespace
      WHERE i.inhrelid = c.oid ORDER BY pn.nspname, pc.relname)
  ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'mind_manual_migration'), '[]'::jsonb),
  'types', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'name', t.typname, 'kind', t.typtype, 'category', t.typcategory,
    'owner', pg_get_userbyid(t.typowner), 'notNull', t.typnotnull,
    'base', format_type(t.typbasetype, t.typtypmod),
    'default', COALESCE(t.typdefault, ''),
    'acl', ${aclSql("t.typacl", "t.typowner", "T")},
    'labels', ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid = t.oid ORDER BY e.enumsortorder)
  ) ORDER BY t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mind_manual_migration'), '[]'::jsonb),
  'functions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'name', p.proname,
    'arguments', pg_get_function_identity_arguments(p.oid),
    'result', pg_get_function_result(p.oid), 'owner', pg_get_userbyid(p.proowner),
    'language', l.lanname, 'kind', p.prokind, 'securityDefiner', p.prosecdef,
    'strict', p.proisstrict, 'leakproof', p.proleakproof,
    'volatility', p.provolatile, 'parallel', p.proparallel,
    'cost', p.procost, 'rows', p.prorows,
    'configuration', COALESCE(p.proconfig, ARRAY[]::text[]),
    'acl', ${aclSql("p.proacl", "p.proowner", "f")},
    'definition', CASE WHEN p.prokind = 'a' THEN NULL ELSE pg_get_functiondef(p.oid) END
  ) ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang WHERE n.nspname = 'mind_manual_migration'
    OR (n.nspname = 'public' AND p.proname LIKE 'mind\\_manual\\_%' ESCAPE '\\')), '[]'::jsonb),
  'triggers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'relation', c.relname,
    'name', CASE WHEN t.tgisinternal AND t.tgconstraint <> 0
      THEN (SELECT conname FROM pg_constraint WHERE oid = t.tgconstraint) || ':' || p.proname
      ELSE t.tgname END,
    'functionSchema', pn.nspname, 'function', p.proname,
    'functionArguments', pg_get_function_identity_arguments(p.oid),
    'enabled', t.tgenabled, 'type', t.tgtype, 'internal', t.tgisinternal,
    'deferrable', t.tgdeferrable, 'deferred', t.tginitdeferred,
    'argumentsHex', encode(t.tgargs, 'hex'),
    'definition', CASE WHEN t.tgisinternal AND t.tgconstraint <> 0
      THEN regexp_replace(pg_get_triggerdef(t.oid, false), 'RI_ConstraintTrigger_[ac]_[0-9]+', 'RI_ConstraintTrigger_catalog_identity', 'g')
      ELSE pg_get_triggerdef(t.oid, false) END
  ) ORDER BY n.nspname, c.relname, CASE WHEN t.tgisinternal AND t.tgconstraint <> 0
      THEN (SELECT conname FROM pg_constraint WHERE oid = t.tgconstraint) || ':' || p.proname
      ELSE t.tgname END) FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE t.tgname LIKE 'mind\\_manual\\_%' ESCAPE '\\'
      OR pn.nspname = 'mind_manual_migration' OR n.nspname = 'mind_manual_migration'), '[]'::jsonb),
  'defaultPrivileges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'owner', pg_get_userbyid(d.defaclrole), 'schema', COALESCE(n.nspname, '*'),
    'type', d.defaclobjtype,
    'acl', ${aclSql("d.defaclacl", "d.defaclrole", "f")}
  ) ORDER BY pg_get_userbyid(d.defaclrole), n.nspname, d.defaclobjtype)
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'mind_manual_migration'
      OR (d.defaclnamespace = 0 AND pg_get_userbyid(d.defaclrole) = 'postgres')), '[]'::jsonb),
  'relationScopes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'schema', schema_name, 'relation', relation_name, 'ownerColumn', owner_column
  ) ORDER BY schema_name, relation_name) FROM mind_manual_migration.relation_scopes), '[]'::jsonb),
  'edgeFunctions', COALESCE((SELECT jsonb_agg(function_name ORDER BY function_name)
    FROM mind_manual_migration.edge_functions), '[]'::jsonb),
  'storageGuard', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'relation', c.relname, 'owner', pg_get_userbyid(c.relowner),
    'kind', c.relkind, 'rowLevelSecurity', c.relrowsecurity,
    'forceRowLevelSecurity', c.relforcerowsecurity,
    'clientRoles', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name', r.rolname, 'superuser', r.rolsuper, 'bypassRls', r.rolbypassrls,
      'memberOfOwner', pg_has_role(r.oid, c.relowner, 'MEMBER'),
      'bypassRoleMemberships', ARRAY(SELECT br.rolname FROM pg_roles br
        WHERE (br.rolbypassrls OR br.rolsuper) AND pg_has_role(r.oid, br.oid, 'MEMBER')
        ORDER BY br.rolname)
    ) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')), '[]'::jsonb),
    'policies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
      'roles', ARRAY(SELECT CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END
        FROM unnest(p.polroles) r ORDER BY CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END),
      'using', COALESCE(pg_get_expr(p.polqual, p.polrelid, false), ''),
      'check', COALESCE(pg_get_expr(p.polwithcheck, p.polrelid, false), '')
    ) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid = c.oid
      AND p.polname LIKE 'mind\\_manual\\_gateway\\_%' ESCAPE '\\'), '[]'::jsonb)
  ) ORDER BY n.nspname, c.relname) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'), '[]'::jsonb)
)::text;
${transaction ? "COMMIT;" : ""}
`;
}

/** Hash-only description used by local fixture tests and the fixed validator. */
export function describeMigrationGuardCatalog(catalog) {
  exactKeys(catalog, COMPONENTS, "migration guard catalog");
  for (const key of COMPONENTS.filter((name) => name !== "schema")) {
    if (!Array.isArray(catalog[key])) throw new Error(`Invalid migration guard catalog ${key}`);
  }
  if (!catalog.schema || typeof catalog.schema !== "object" || Array.isArray(catalog.schema)) {
    throw new Error("Missing migration guard control schema");
  }
  const components = Object.fromEntries(COMPONENTS.map((name) => [name, sha256(canonicalJson(catalog[name]))]));
  return {
    version: 1,
    kind: "mind_manual_migration_guard_catalog",
    pinnedInputs: Object.fromEntries(PINNED_INPUTS.map((path) => [path, sha256File(resolve(repoRoot, path))])),
    querySha256: sha256(migrationGuardCatalogSql()),
    components,
    catalogSha256: sha256(canonicalJson(components)),
    operationalRowsIncluded: false,
  };
}

export function validateMigrationGuardCatalog(catalog) {
  const actual = describeMigrationGuardCatalog(catalog);
  const reference = expectedMigrationGuardContract();
  for (const name of COMPONENTS) {
    if (actual.components[name] !== reference.components?.[name]) {
      throw new Error(`Migration guard catalog differs from reviewed reference: ${name}`);
    }
  }
  if (canonicalJson(actual) !== canonicalJson(reference)) {
    throw new Error("Migration guard catalog reference contract mismatch");
  }
  return actual;
}

/** Current reviewed, hash-only contract. This is not evidence of installation. */
export function expectedMigrationGuardContract() {
  const reference = JSON.parse(readFileSync(resolve(repoRoot, REFERENCE), "utf8"));
  exactKeys(reference, ["version", "kind", "pinnedInputs", "querySha256", "components",
    "catalogSha256", "operationalRowsIncluded"], "reviewed migration guard reference");
  exactKeys(reference.components, COMPONENTS, "reviewed migration guard components");
  exactKeys(reference.pinnedInputs, PINNED_INPUTS, "reviewed migration guard input pins");
  const digest = /^[a-f0-9]{64}$/u;
  if (reference.version !== 1 || reference.kind !== "mind_manual_migration_guard_catalog" ||
    reference.operationalRowsIncluded !== false ||
    ![reference.querySha256, reference.catalogSha256,
      ...Object.values(reference.components), ...Object.values(reference.pinnedInputs)]
      .every((value) => typeof value === "string" && digest.test(value)) ||
    reference.catalogSha256 !== sha256(canonicalJson(reference.components))) {
    throw new Error("Invalid reviewed migration guard reference contract");
  }
  const currentPins = Object.fromEntries(PINNED_INPUTS.map((path) => [path, sha256File(resolve(repoRoot, path))]));
  if (canonicalJson(reference.pinnedInputs) !== canonicalJson(currentPins) ||
    reference.querySha256 !== sha256(migrationGuardCatalogSql())) {
    throw new Error("Migration guard SQL, manifest or query changed without reviewed catalog reference regeneration");
  }
  return reference;
}

/** Receipt consumers must reject forged/obsolete bindings, not just compare two. */
export function validateMigrationGuardCatalogBinding(binding) {
  const reference = expectedMigrationGuardContract();
  if (canonicalJson(binding) !== canonicalJson(reference)) {
    throw new Error("Migration guard catalog binding is missing, stale or unreviewed");
  }
  return binding;
}
