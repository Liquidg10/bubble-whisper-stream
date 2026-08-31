-- MANUAL INSTALL ARTIFACT, NOT AN AUTOMATIC MIGRATION OR A BYTE-FREEZE RECEIPT.
-- Install once during an owner-approved, bucket-exclusive rollout, after the
-- matching control SQL and before publishing the new photo client/Edge gateway.
-- Legacy clients lose direct mutations to these two buckets. Reads and other
-- buckets are unchanged. Both source and isolated target need this exact policy.
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

CREATE POLICY mind_manual_gateway_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id NOT IN ('photos', 'voice-samples'));

CREATE POLICY mind_manual_gateway_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (bucket_id NOT IN ('photos', 'voice-samples'))
  WITH CHECK (bucket_id NOT IN ('photos', 'voice-samples'));

CREATE POLICY mind_manual_gateway_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (bucket_id NOT IN ('photos', 'voice-samples'));

COMMIT;
