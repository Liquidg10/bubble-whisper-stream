-- Run on the isolated target only, after exact data parity is receipted and
-- before any scheduler or provider callback is enabled. This intentionally
-- invalidates the exact row checksum; capture the before/after receipt.

BEGIN;

UPDATE public.calendar_accounts
SET watch_channel_id = NULL,
    watch_resource_id = NULL,
    watch_expires_at = NULL,
    watch_status = 'inactive',
    updated_at = statement_timestamp()
WHERE watch_channel_id IS NOT NULL
   OR watch_resource_id IS NOT NULL
   OR watch_expires_at IS NOT NULL
   OR watch_status <> 'inactive';

UPDATE public.email_accounts
SET history_id = NULL,
    watch_expiration = NULL,
    watch_resource_id = NULL,
    watch_channel_id = NULL,
    updated_at = statement_timestamp()
WHERE history_id IS NOT NULL
   OR watch_expiration IS NOT NULL
   OR watch_resource_id IS NOT NULL
   OR watch_channel_id IS NOT NULL;

UPDATE public.gmail_watch_subscriptions
SET status = 'inactive',
    history_id = NULL,
    last_notification_history_id = NULL,
    watch_expires_at = NULL,
    last_notification_at = NULL,
    last_sync_at = NULL,
    stopped_at = statement_timestamp(),
    last_error_code = NULL,
    last_error_message = NULL,
    updated_at = statement_timestamp()
WHERE status <> 'inactive'
   OR history_id IS NOT NULL
   OR last_notification_history_id IS NOT NULL
   OR watch_expires_at IS NOT NULL;

UPDATE public.webhook_subscriptions
SET is_active = false,
    updated_at = statement_timestamp()
WHERE is_active;

UPDATE public.plaid_sync_status
SET webhook_url = NULL,
    is_healthy = false,
    updated_at = statement_timestamp()
WHERE webhook_url IS NOT NULL OR is_healthy;

DELETE FROM public.oauth_state;

DO $assertions$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.calendar_accounts
    WHERE watch_channel_id IS NOT NULL
       OR watch_resource_id IS NOT NULL
       OR watch_expires_at IS NOT NULL
       OR watch_status <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'Calendar provider state was not quarantined';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gmail_watch_subscriptions
    WHERE status <> 'inactive'
       OR history_id IS NOT NULL
       OR watch_expires_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Gmail provider state was not quarantined';
  END IF;

  IF EXISTS (SELECT 1 FROM public.webhook_subscriptions WHERE is_active) THEN
    RAISE EXCEPTION 'Generic provider subscriptions remain active';
  END IF;

  IF EXISTS (SELECT 1 FROM public.oauth_state) THEN
    RAISE EXCEPTION 'Transient OAuth state must not cross projects';
  END IF;
END
$assertions$;

COMMIT;
