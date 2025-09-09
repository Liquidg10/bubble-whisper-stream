-- Phase 1: Enhance calendar_events table with missing fields
ALTER TABLE public.calendar_events 
ADD COLUMN IF NOT EXISTS etag text,
ADD COLUMN IF NOT EXISTS start_tz text,
ADD COLUMN IF NOT EXISTS end_tz text,
ADD COLUMN IF NOT EXISTS html_link text,
ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_etag ON public.calendar_events(etag);
CREATE INDEX IF NOT EXISTS idx_calendar_events_last_synced ON public.calendar_events(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_id ON public.calendar_events(external_event_id);

-- Enhance calendar_accounts table for better sync tracking
ALTER TABLE public.calendar_accounts
ADD COLUMN IF NOT EXISTS bounded_sync_window_days integer DEFAULT 90,
ADD COLUMN IF NOT EXISTS last_full_sync_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS sync_page_token text;

-- Add function to clean up old events outside sync window
CREATE OR REPLACE FUNCTION public.cleanup_old_calendar_events(account_id uuid, window_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.calendar_events
  WHERE calendar_account_id = account_id
  AND (
    start_time < (now() - (window_days || ' days')::interval) OR
    start_time > (now() + (window_days || ' days')::interval)
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;