-- Scope watch-renewal discovery to the caller even though this helper must
-- remain SECURITY DEFINER for the authenticated browser and service-role cron.
CREATE OR REPLACE FUNCTION public.get_expiring_watch_channels(hours_ahead integer DEFAULT 24)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    calendar_id text,
    watch_channel_id text,
    watch_resource_id text,
    watch_expires_at timestamp with time zone,
    account_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        ca.id,
        ca.user_id,
        ca.calendar_id,
        ca.watch_channel_id,
        ca.watch_resource_id,
        ca.watch_expires_at,
        ca.account_email
    FROM public.calendar_accounts AS ca
    WHERE ca.watch_status = 'active'
      AND ca.watch_expires_at IS NOT NULL
      AND ca.watch_expires_at <= (now() + (hours_ahead || ' hours')::interval)
      AND (
        COALESCE((auth.jwt() ->> 'role') = 'service_role', false)
        OR ca.user_id = auth.uid()
      );
$$;

REVOKE ALL ON FUNCTION public.get_expiring_watch_channels(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_expiring_watch_channels(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_expiring_watch_channels(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expiring_watch_channels(integer) TO service_role;

COMMENT ON FUNCTION public.get_expiring_watch_channels(integer) IS
  'Returns expiring calendar watch channels for the authenticated owner or service-role scheduler.';
