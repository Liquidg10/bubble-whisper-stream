-- Fix function search path security warnings
DROP FUNCTION IF EXISTS get_expiring_watch_channels(integer);

-- Recreate function with proper search_path setting
CREATE OR REPLACE FUNCTION get_expiring_watch_channels(hours_ahead integer DEFAULT 24)
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
SET search_path = public
AS $$
    SELECT 
        ca.id,
        ca.user_id,
        ca.calendar_id,
        ca.watch_channel_id,
        ca.watch_resource_id,
        ca.watch_expires_at,
        ca.account_email
    FROM public.calendar_accounts ca
    WHERE ca.watch_status = 'active'
    AND ca.watch_expires_at IS NOT NULL
    AND ca.watch_expires_at <= (now() + (hours_ahead || ' hours')::interval);
$$;

-- Fix existing functions that may have search path issues
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;