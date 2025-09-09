-- Fix function security issue by setting search_path
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_state()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM oauth_state WHERE expires_at < now();
$$;