-- Cross-device replication is intentionally deferred.
--
-- The legacy browser services generated unrelated device-local AES keys and
-- could write ciphertext that no second device was able to decrypt or apply.
-- Freeze the unused prototype tables without deleting historical rows. A
-- future release must explicitly restore narrowly scoped policies/privileges
-- after the pairing, recovery, apply, and receipt contracts are implemented.

BEGIN;

DO $block$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sync_data', 'sync_devices', 'sync_conflicts']
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
      table_name
    );

    FOR policy_name IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;
  END LOOP;
END
$block$;

DO $block$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['sync_data', 'sync_devices', 'sync_conflicts']
    LOOP
      IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
          table_name
        );
      END IF;
    END LOOP;
  END IF;
END
$block$;

COMMENT ON TABLE public.sync_data IS
  'Dormant cross-device ciphertext outbox. Browser access and realtime are disabled until owner-approved key pairing, remote apply, and durable receipt contracts ship.';
COMMENT ON TABLE public.sync_devices IS
  'Dormant cross-device registry. Browser access and realtime are disabled until owner-approved pairing, recovery, revocation, and key-rotation contracts ship.';
COMMENT ON TABLE public.sync_conflicts IS
  'Dormant cross-device conflict prototype. Browser access and realtime are disabled until real remote apply and durable conflict receipts ship.';

DO $assertions$
DECLARE
  table_name text;
  browser_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sync_data', 'sync_devices', 'sync_conflicts']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
    ) THEN
      RAISE EXCEPTION 'cross-device prototype policy remains on public.%', table_name;
    END IF;

    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF has_table_privilege(
        browser_role,
        format('public.%I', table_name),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) THEN
        RAISE EXCEPTION '% retains cross-device table privileges on public.%',
          browser_role,
          table_name;
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      RAISE EXCEPTION 'public.% remains in supabase_realtime', table_name;
    END IF;
  END LOOP;
END
$assertions$;

COMMIT;
