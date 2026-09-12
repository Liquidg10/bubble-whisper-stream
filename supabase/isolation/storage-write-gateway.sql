-- MANUAL INSTALL ARTIFACT, NOT AN AUTOMATIC MIGRATION OR A BYTE-FREEZE RECEIPT.
-- Install once during an owner-approved, owner-scoped rollout, after the
-- matching control SQL and before publishing the new photo client/Edge gateway.
-- Selected-owner clients lose direct mutations to their two-bucket object scope.
-- Unrelated users/objects and reads retain their existing policies. Both source
-- and isolated target need this exact artifact and separately verified scope.
--
-- These restrictive policies deny NEW anon/authenticated Storage authorization;
-- a permissive policy cannot override them. They DO NOT revoke already signed
-- upload URLs, stop uploads authorized earlier, or block service-role/S3 keys.
-- The guarded gateway uses a service credential and holds its admission lease
-- through the complete Storage response. Historical and privileged writers
-- still require separate inventory, retirement and byte-level drain evidence.
-- See docs/operations/storage-ingress-and-catalog-contract.md.

BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preconditions$
BEGIN
  IF to_regclass('mind_manual_migration.control') IS NULL
     OR to_regclass('mind_manual_migration.subjects') IS NULL
     OR to_regprocedure('auth.uid()') IS NULL
     OR to_regclass('storage.objects') IS NULL
     OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Storage gateway requires the reviewed control and Storage schema';
  END IF;
  -- Serialize installation with admission and phase transitions. The lock is
  -- held through policy creation/COMMIT; a zero-lease check alone can race.
  PERFORM 1 FROM mind_manual_migration.control WHERE singleton FOR UPDATE;
  IF (SELECT count(*) FROM mind_manual_migration.control WHERE singleton AND phase = 'open') <> 1
     OR EXISTS (SELECT 1 FROM mind_manual_migration.edge_leases) THEN
    RAISE EXCEPTION 'Storage gateway installation requires open control and no admitted work';
  END IF;
  IF (SELECT count(*) FROM storage.buckets WHERE id IN ('photos', 'voice-samples') AND public = false) <> 2 THEN
    RAISE EXCEPTION 'Storage gateway requires both approved private buckets';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'storage.objects'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Storage gateway requires existing Storage RLS';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated') AND NOT rolsuper AND NOT rolbypassrls) <> 2
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'storage' AND c.relname = 'objects'
         AND (pg_has_role('anon', c.relowner, 'MEMBER') OR pg_has_role('authenticated', c.relowner, 'MEMBER'))
     ) THEN
    RAISE EXCEPTION 'Storage gateway API roles must not bypass or own Storage RLS';
  END IF;
END
$preconditions$;

-- Operator-configured, immutable owner/legacy scope. Raw paths are not stored.
-- Installation is dormant; selecting an owner and proving this exact mapping
-- are separate approved actions. An empty mapping must still be configured.
CREATE TABLE mind_manual_migration.storage_scope (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_subject_id uuid NOT NULL
);
CREATE TABLE mind_manual_migration.storage_legacy_assignments (
  bucket_id text NOT NULL CHECK (bucket_id IN ('photos', 'voice-samples')),
  path_sha256 text NOT NULL CHECK (path_sha256 ~ '^[0-9a-f]{64}$'),
  owner_subject_id uuid NOT NULL,
  PRIMARY KEY (bucket_id, path_sha256)
);
REVOKE ALL ON mind_manual_migration.storage_scope,
  mind_manual_migration.storage_legacy_assignments FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION mind_manual_migration.configure_storage_scope(p_owner uuid, p_assignments jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_phase text; v_normalized jsonb; v_existing jsonb;
BEGIN
  SELECT phase INTO STRICT v_phase FROM mind_manual_migration.control WHERE singleton FOR UPDATE;
  IF v_phase <> 'open' OR EXISTS (SELECT 1 FROM mind_manual_migration.edge_leases) THEN
    RAISE EXCEPTION 'Storage scope requires open control and no admitted work' USING ERRCODE = '55000';
  END IF;
  IF p_owner IS NULL OR (SELECT count(*) FROM mind_manual_migration.subjects) <> 1
     OR NOT EXISTS (SELECT 1 FROM mind_manual_migration.subjects WHERE user_id = p_owner) THEN
    RAISE EXCEPTION 'Storage scope requires the exact selected owner' USING ERRCODE = '22023';
  END IF;
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array'
     OR jsonb_array_length(p_assignments) > 10000 THEN
    RAISE EXCEPTION 'Invalid Storage legacy assignments' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_assignments) a WHERE jsonb_typeof(a) <> 'object') THEN
    RAISE EXCEPTION 'Invalid Storage legacy assignment object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_assignments) a WHERE
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(a) k)
      IS DISTINCT FROM ARRAY['bucket','ownerSubjectId','pathSha256']::text[]
    OR jsonb_typeof(a->'bucket') IS DISTINCT FROM 'string'
    OR a->>'bucket' NOT IN ('photos', 'voice-samples')
    OR jsonb_typeof(a->'pathSha256') IS DISTINCT FROM 'string'
    OR (a->>'pathSha256' ~ '^[0-9a-f]{64}$') IS NOT TRUE
    OR jsonb_typeof(a->'ownerSubjectId') IS DISTINCT FROM 'string'
    OR (a->>'ownerSubjectId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') IS NOT TRUE
  ) OR (SELECT count(*) FROM jsonb_array_elements(p_assignments)) <>
       (SELECT count(DISTINCT (a->>'bucket', a->>'pathSha256')) FROM jsonb_array_elements(p_assignments) a) THEN
    RAISE EXCEPTION 'Invalid or duplicate Storage legacy assignment' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(a ORDER BY a->>'bucket', a->>'pathSha256'), '[]'::jsonb)
    INTO v_normalized FROM jsonb_array_elements(p_assignments) a;
  IF EXISTS (SELECT 1 FROM mind_manual_migration.storage_scope) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'pathSha256', path_sha256,
      'ownerSubjectId', owner_subject_id::text) ORDER BY bucket_id, path_sha256), '[]'::jsonb)
      INTO v_existing FROM mind_manual_migration.storage_legacy_assignments;
    IF EXISTS (SELECT 1 FROM mind_manual_migration.storage_scope WHERE singleton AND owner_subject_id = p_owner)
       AND v_existing = v_normalized THEN RETURN; END IF;
    RAISE EXCEPTION 'Storage scope is immutable once configured' USING ERRCODE = '55000';
  END IF;
  INSERT INTO mind_manual_migration.storage_scope VALUES (true, p_owner);
  INSERT INTO mind_manual_migration.storage_legacy_assignments
    SELECT a->>'bucket', a->>'pathSha256', (a->>'ownerSubjectId')::uuid
    FROM jsonb_array_elements(v_normalized) a;
END
$function$;
REVOKE ALL ON FUNCTION mind_manual_migration.configure_storage_scope(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION mind_manual_migration.storage_write_allowed(p_object jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_bucket text := p_object->>'bucket_id'; v_name text := p_object->>'name';
BEGIN
  IF v_bucket NOT IN ('photos', 'voice-samples') THEN RETURN true; END IF;
  -- Serialize every affected authorization with owner/legacy configuration and
  -- phase transitions, just as the admission control does. No lease is created.
  PERFORM singleton FROM mind_manual_migration.control WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Storage control is missing' USING ERRCODE = '55000'; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM mind_manual_migration.subjects s WHERE
      s.user_id = auth.uid()
      OR (strpos(v_name, '/') > 0 AND split_part(v_name, '/', 1) = s.user_id::text)
      OR p_object->>'owner_id' = s.user_id::text
      OR p_object->>'owner' = s.user_id::text
      OR EXISTS (SELECT 1 FROM mind_manual_migration.storage_legacy_assignments a
        WHERE a.owner_subject_id = s.user_id AND a.bucket_id = v_bucket
          AND a.path_sha256 = encode(sha256(convert_to(v_name, 'UTF8')), 'hex'))
  );
END
$function$;
REVOKE ALL ON FUNCTION mind_manual_migration.storage_write_allowed(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
-- Policies resolve the function at installation, so API roles need EXECUTE but
-- no USAGE/read access to the private schema or its owner/assignment registries.
GRANT EXECUTE ON FUNCTION mind_manual_migration.storage_write_allowed(jsonb) TO anon, authenticated;

CREATE POLICY mind_manual_gateway_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (mind_manual_migration.storage_write_allowed(to_jsonb(objects)));

CREATE POLICY mind_manual_gateway_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (mind_manual_migration.storage_write_allowed(to_jsonb(objects)))
  WITH CHECK (mind_manual_migration.storage_write_allowed(to_jsonb(objects)));

CREATE POLICY mind_manual_gateway_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (mind_manual_migration.storage_write_allowed(to_jsonb(objects)));

COMMIT;
