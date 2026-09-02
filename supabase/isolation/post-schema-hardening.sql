-- Runtime extensions used by Mind Manual functions.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Auth bootstrap lives outside the public-schema table snapshot.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Every reviewed public function is closed to PUBLIC first. Only the provider
-- worker role can execute mutations/decryption; authenticated callers retain
-- the scoped watch-renewal discovery RPC.
REVOKE ALL ON FUNCTION public.cleanup_expired_google_calendar_oauth_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_oauth_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_calendar_events(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_gmail_pubsub_message(uuid, text, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_gmail_pubsub_message(uuid, text, text, integer, integer, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_gmail_pubsub_message_scoped(uuid, uuid, text, bigint, uuid, text, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_gmail_pubsub_message_scoped(uuid, uuid, text, bigint, uuid, text, integer, uuid, text, text, integer, integer, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_google_calendar_oauth_state(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_plaid_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_expiring_watch_channels(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_plaid_access_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_thread_last_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_google_calendar_connection(uuid, text, text, text, text, text, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_google_calendar_oauth_state() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_oauth_state() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_calendar_events(uuid, integer) TO service_role;
-- Legacy Gmail receipt implementations are callable only by their function
-- owner through the tuple-bound wrappers, never directly by old Edge versions.
GRANT EXECUTE ON FUNCTION public.claim_gmail_pubsub_message_scoped(uuid, uuid, text, bigint, uuid, text, text, text, timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_gmail_pubsub_message_scoped(uuid, uuid, text, bigint, uuid, text, integer, uuid, text, text, integer, integer, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_google_calendar_oauth_state(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_plaid_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_expiring_watch_channels(integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_plaid_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_thread_last_message() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_google_calendar_connection(uuid, text, text, text, text, text, timestamp with time zone, text) TO service_role;

-- Browser roles must never read Plaid credential columns. A security-invoker
-- view still requires its caller to hold privileges on the safe underlying
-- columns, so grant only the metadata projected by plaid_items_safe.
REVOKE ALL ON TABLE public.plaid_items FROM anon;
REVOKE SELECT, UPDATE ON TABLE public.plaid_items FROM authenticated;
GRANT SELECT (
  id,
  user_id,
  item_id,
  institution_name,
  is_active,
  created_at,
  updated_at
) ON TABLE public.plaid_items TO authenticated;
GRANT UPDATE (is_active) ON TABLE public.plaid_items TO authenticated;
REVOKE SELECT ON TABLE public.plaid_items_safe FROM anon;
GRANT SELECT ON TABLE public.plaid_items_safe TO authenticated;

REVOKE ALL ON TABLE public.gmail_watch_subscriptions,
  public.gmail_pubsub_receipts,
  public.gmail_history_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gmail_watch_subscriptions,
  public.gmail_history_events
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gmail_watch_subscriptions,
  public.gmail_pubsub_receipts,
  public.gmail_history_events
  TO service_role;

-- The isolated app has no signed-out data surface. Remove inherited anonymous
-- table access now and for future postgres-owned migrations.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON TABLE public.plaid_items_safe TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-samples', 'voice-samples', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users upload own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users read own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users update own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own photos" ON storage.objects;

CREATE POLICY "Users upload own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users read own photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users update own photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users delete own photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can upload their own voice samples" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own voice samples" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own voice samples" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own voice samples" ON storage.objects;

CREATE POLICY "Users can upload their own voice samples"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'voice-samples'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users can view their own voice samples"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'voice-samples'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users can update their own voice samples"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'voice-samples'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'voice-samples'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users can delete their own voice samples"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'voice-samples'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Executable invoker-role canary for the isolated target.
SET ROLE authenticated;
SELECT id, user_id, item_id, institution_name, is_active, created_at, updated_at
FROM public.plaid_items_safe
LIMIT 0;
UPDATE public.plaid_items
SET is_active = is_active
WHERE item_id = '' AND false;
RESET ROLE;
