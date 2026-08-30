-- MANUAL INSTALL ARTIFACT, NOT AN AUTOMATIC MIGRATION.
-- Do not execute remotely without the release owner's exact source-project,
-- subject, shared-identity disposition, maintenance-window and rollback approval.
-- Install once as postgres; any missing/wrong-shaped table aborts the transaction.
-- Installation is dormant (open, no subjects); it is NOT a freeze receipt.
--
-- This guards the 32 base-table owner scopes (plaid_items_safe is a view), plus
-- selected auth.users/identities. It does NOT freeze Storage bytes/metadata,
-- provider-side work outside admitted Edge invocations, auth sessions/tokens,
-- arbitrary privileged DDL, or unrelated product data. A shared-product identity
-- must not be selected unless its cross-product effects have an owner disposition.
-- Only the operator may configure/drain/fence/resume through the private schema.
-- No lease expires automatically: uncertain provider work requires reconciliation.
-- Resume is the non-destructive rollback; it deliberately retains all leases.
--
-- Locking: every guarded write/admission holds FOR SHARE on the control row until
-- transaction end. Phase/configuration transitions take FOR UPDATE, so a fence
-- cannot pass an in-flight guarded DB transaction or an uncommitted admission.
-- https://www.postgresql.org/docs/16/explicit-locking.html
-- ALWAYS covers session_replication_role=replica as well as RLS-bypassing roles.
-- https://www.postgresql.org/docs/16/sql-altertable.html

BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Intentionally no IF NOT EXISTS / OR REPLACE: reinstallation must not silently
-- overwrite an active fence or an existing schema with unexpected ownership.
CREATE SCHEMA mind_manual_migration AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA mind_manual_migration FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE mind_manual_migration.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  phase text NOT NULL CHECK (phase IN ('open', 'draining', 'fenced')),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO mind_manual_migration.control (singleton, phase) VALUES (true, 'open');

-- No cascading Auth FK: deleting an Auth row must never delete its fence subject.
CREATE TABLE mind_manual_migration.subjects (user_id uuid PRIMARY KEY);
CREATE TABLE mind_manual_migration.edge_functions (function_name text PRIMARY KEY);
INSERT INTO mind_manual_migration.edge_functions (function_name) VALUES
  ('ai-cbt-reframe'), ('ai-conversation'), ('ai-embeddings'),
  ('ai-glimmer-generate'), ('ai-monthly-summary'), ('ai-pattern-analysis'),
  ('ai-photo-analyze'), ('ai-plan-generate'), ('ai-realtime-voice'),
  ('ai-tts-generate'), ('ai-voice-transcribe'), ('calendar-oauth-callback'),
  ('calendar-oauth-start'), ('calendar-sync'), ('calendar-watch'),
  ('document-scan'), ('gmail-compose'), ('gmail-sync'), ('gmail-watch'),
  ('grocery-intelligence'), ('oauth-google'), ('oauth-google-callback'),
  ('oauth-google-refresh'), ('oauth-google-revoke'), ('oauth-google-start'),
  ('oauth-scope-decay'), ('personal-voice-record'), ('plaid-create-link-token'),
  ('plaid-exchange-token'), ('plaid-get-accounts'), ('plaid-get-transactions'),
  ('plaid-webhook-handler'), ('watch-renewal-cron');

CREATE TABLE mind_manual_migration.edge_leases (
  lease_id uuid PRIMARY KEY,
  function_name text NOT NULL REFERENCES mind_manual_migration.edge_functions,
  admitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE mind_manual_migration.relation_scopes (
  schema_name text NOT NULL,
  relation_name text NOT NULL,
  owner_column text NOT NULL,
  PRIMARY KEY (schema_name, relation_name)
);
INSERT INTO mind_manual_migration.relation_scopes VALUES
  ('public', 'ai_conversations', 'user_id'),
  ('public', 'calendar_accounts', 'user_id'),
  ('public', 'calendar_events', 'user_id'),
  ('public', 'conversation_summaries', 'user_id'),
  ('public', 'conversation_threads', 'user_id'),
  ('public', 'email_accounts', 'user_id'),
  ('public', 'email_messages', 'user_id'),
  ('public', 'email_recipients', 'user_id'),
  ('public', 'gmail_actionables', 'user_id'),
  ('public', 'gmail_compose_receipts', 'user_id'),
  ('public', 'gmail_history_events', 'user_id'),
  ('public', 'gmail_pubsub_receipts', 'user_id'),
  ('public', 'gmail_threads', 'user_id'),
  ('public', 'gmail_watch_subscriptions', 'user_id'),
  ('public', 'oauth_accounts', 'user_id'),
  ('public', 'oauth_state', 'user_id'),
  ('public', 'oauth_tokens', 'user_id'),
  ('public', 'plaid_accounts', 'user_id'),
  ('public', 'plaid_items', 'user_id'),
  ('public', 'plaid_sync_status', 'user_id'),
  ('public', 'plaid_transactions', 'user_id'),
  ('public', 'plaid_webhooks', 'user_id'),
  ('public', 'profiles', 'id'),
  ('public', 'recurring_transactions', 'user_id'),
  ('public', 'sync_conflicts', 'user_id'),
  ('public', 'sync_data', 'user_id'),
  ('public', 'sync_devices', 'user_id'),
  ('public', 'sync_logs', 'user_id'),
  ('public', 'user_memory', 'user_id'),
  ('public', 'user_sessions', 'user_id'),
  ('public', 'voice_samples', 'user_id'),
  ('public', 'webhook_subscriptions', 'user_id'),
  ('auth', 'users', 'id'),
  ('auth', 'identities', 'user_id');

CREATE FUNCTION mind_manual_migration.configure_subjects(p_subjects uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_phase text;
BEGIN
  SELECT phase INTO STRICT v_phase FROM mind_manual_migration.control
    WHERE singleton FOR UPDATE;
  IF v_phase <> 'open' THEN
    RAISE EXCEPTION 'Mind Manual subjects may change only while open' USING ERRCODE = '55000';
  END IF;
  IF p_subjects IS NULL OR cardinality(p_subjects) = 0
     OR array_position(p_subjects, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Mind Manual requires explicit nonempty subject UUIDs' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_subjects) <> (SELECT count(DISTINCT subject) FROM unnest(p_subjects) AS subject) THEN
    RAISE EXCEPTION 'Mind Manual subject UUIDs must not contain duplicates' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_subjects) AS selected(user_id)
             WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = selected.user_id)) THEN
    RAISE EXCEPTION 'Every Mind Manual subject must already exist in Auth' USING ERRCODE = '22023';
  END IF;
  DELETE FROM mind_manual_migration.subjects;
  INSERT INTO mind_manual_migration.subjects SELECT unnest(p_subjects);
END
$function$;

CREATE FUNCTION mind_manual_migration.begin_drain()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_phase text;
BEGIN
  SELECT phase INTO STRICT v_phase FROM mind_manual_migration.control
    WHERE singleton FOR UPDATE;
  IF v_phase <> 'open' THEN
    RAISE EXCEPTION 'Mind Manual drain requires open phase' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mind_manual_migration.subjects) THEN
    RAISE EXCEPTION 'Mind Manual drain requires explicit subjects' USING ERRCODE = '55000';
  END IF;
  UPDATE mind_manual_migration.control SET phase = 'draining', changed_at = clock_timestamp()
    WHERE singleton;
END
$function$;

CREATE FUNCTION mind_manual_migration.fence()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_phase text;
BEGIN
  SELECT phase INTO STRICT v_phase FROM mind_manual_migration.control
    WHERE singleton FOR UPDATE;
  IF v_phase <> 'draining' THEN
    RAISE EXCEPTION 'Mind Manual fence requires draining phase' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mind_manual_migration.edge_leases) THEN
    RAISE EXCEPTION 'Mind Manual fence blocked by unresolved Edge leases' USING ERRCODE = '55000';
  END IF;
  UPDATE mind_manual_migration.control SET phase = 'fenced', changed_at = clock_timestamp()
    WHERE singleton;
END
$function$;

CREATE FUNCTION mind_manual_migration.resume()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM singleton FROM mind_manual_migration.control WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mind Manual control row missing' USING ERRCODE = '55000'; END IF;
  UPDATE mind_manual_migration.control SET phase = 'open', changed_at = clock_timestamp()
    WHERE singleton;
  -- Never delete leases here: a lost provider response is not proof of completion.
END
$function$;

CREATE FUNCTION public.mind_manual_admit_edge(p_function_name text, p_lease_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_phase text; v_inserted integer;
BEGIN
  IF p_lease_id IS NULL OR p_function_name IS NULL OR NOT EXISTS (
    SELECT 1 FROM mind_manual_migration.edge_functions WHERE function_name = p_function_name
  ) THEN
    RAISE EXCEPTION 'Unknown Mind Manual Edge function or missing lease UUID' USING ERRCODE = '22023';
  END IF;
  SELECT phase INTO STRICT v_phase FROM mind_manual_migration.control
    WHERE singleton FOR SHARE;
  IF v_phase <> 'open' THEN RETURN false; END IF;
  INSERT INTO mind_manual_migration.edge_leases (lease_id, function_name)
    VALUES (p_lease_id, p_function_name) ON CONFLICT (lease_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END
$function$;

CREATE FUNCTION public.mind_manual_release_edge(p_lease_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_deleted integer;
BEGIN
  IF p_lease_id IS NULL THEN
    RAISE EXCEPTION 'Missing Mind Manual lease UUID' USING ERRCODE = '22023';
  END IF;
  DELETE FROM mind_manual_migration.edge_leases WHERE lease_id = p_lease_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END
$function$;

CREATE FUNCTION mind_manual_migration.guard_subject_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_phase text; v_old_subject uuid; v_new_subject uuid;
BEGIN
  SELECT phase INTO STRICT v_phase FROM mind_manual_migration.control
    WHERE singleton FOR SHARE;
  IF v_phase = 'fenced' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_old_subject := (to_jsonb(OLD) ->> TG_ARGV[0])::uuid;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_new_subject := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
    END IF;
    IF EXISTS (SELECT 1 FROM mind_manual_migration.subjects
               WHERE user_id = v_old_subject OR user_id = v_new_subject) THEN
      RAISE EXCEPTION 'Mind Manual selected-subject writes are fenced' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION mind_manual_migration.guard_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_phase text;
BEGIN
  SELECT phase INTO STRICT v_phase FROM mind_manual_migration.control
    WHERE singleton FOR SHARE;
  IF v_phase = 'fenced' THEN
    RAISE EXCEPTION 'Mind Manual scoped relations cannot be truncated while fenced' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END
$function$;

DO $install$
DECLARE scope record;
BEGIN
  FOR scope IN SELECT * FROM mind_manual_migration.relation_scopes ORDER BY schema_name, relation_name LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = scope.schema_name AND c.relname = scope.relation_name
        AND c.relkind = 'r' AND NOT c.relispartition
        AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid OR i.inhparent = c.oid)
        AND a.attname = scope.owner_column AND a.atttypid = 'uuid'::regtype
        AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'Mind Manual scope %.% requires an ordinary table with UUID owner column %',
        scope.schema_name, scope.relation_name, scope.owner_column;
    END IF;
    EXECUTE format('CREATE TRIGGER mind_manual_subject_write_fence BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION mind_manual_migration.guard_subject_write(%L)',
      scope.schema_name, scope.relation_name, scope.owner_column);
    -- A later BEFORE trigger can rewrite NEW; validate the final stored owner too.
    EXECUTE format('CREATE TRIGGER mind_manual_subject_write_fence_after AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION mind_manual_migration.guard_subject_write(%L)',
      scope.schema_name, scope.relation_name, scope.owner_column);
    EXECUTE format('CREATE TRIGGER mind_manual_truncate_fence BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION mind_manual_migration.guard_truncate()',
      scope.schema_name, scope.relation_name);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER mind_manual_subject_write_fence', scope.schema_name, scope.relation_name);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER mind_manual_subject_write_fence_after', scope.schema_name, scope.relation_name);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER mind_manual_truncate_fence', scope.schema_name, scope.relation_name);
  END LOOP;
END
$install$;

REVOKE ALL ON ALL TABLES IN SCHEMA mind_manual_migration FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mind_manual_migration FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA mind_manual_migration
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA mind_manual_migration
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mind_manual_admit_edge(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mind_manual_release_edge(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mind_manual_admit_edge(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mind_manual_release_edge(uuid) TO service_role;

COMMIT;
