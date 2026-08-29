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
GRANT EXECUTE ON FUNCTION public.consume_google_calendar_oauth_state(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_plaid_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_expiring_watch_channels(integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_plaid_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_thread_last_message() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_google_calendar_connection(uuid, text, text, text, text, text, timestamp with time zone, text) TO service_role;

-- Browser roles must never read the Plaid credential-bearing base table.
REVOKE SELECT ON TABLE public.plaid_items FROM anon, authenticated;
REVOKE SELECT ON TABLE public.plaid_items_safe FROM anon;
GRANT SELECT ON TABLE public.plaid_items_safe TO authenticated;

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
