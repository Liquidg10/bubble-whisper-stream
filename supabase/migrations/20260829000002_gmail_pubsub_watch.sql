-- Canonical Gmail mailbox-watch state and authenticated Pub/Sub ingestion.
--
-- Gmail users.watch publishes only to a Google Cloud Pub/Sub topic. It does
-- not create Calendar-style webhook channels or send X-Goog resource headers.
-- The public Edge endpoint authenticates the push subscription's Google OIDC
-- JWT, while these tables keep provider cursors and replay receipts server-side.

CREATE TABLE IF NOT EXISTS public.gmail_watch_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  oauth_account_id uuid NOT NULL,
  account_email text NOT NULL,
  topic_name text NOT NULL,
  subscription_name text NOT NULL,
  label_ids text[] NOT NULL DEFAULT ARRAY['INBOX']::text[],
  status text NOT NULL DEFAULT 'inactive',
  history_id text,
  last_notification_history_id text,
  watch_expires_at timestamptz,
  watch_generation bigint NOT NULL DEFAULT 0,
  last_notification_at timestamptz,
  last_sync_at timestamptz,
  stopped_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT gmail_watch_subscriptions_account_owner_fkey
    FOREIGN KEY (oauth_account_id, user_id)
    REFERENCES public.oauth_accounts(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT gmail_watch_subscriptions_oauth_account_unique
    UNIQUE (oauth_account_id),
  CONSTRAINT gmail_watch_subscriptions_id_user_unique
    UNIQUE (id, user_id),
  CONSTRAINT gmail_watch_subscriptions_email_normalized_check
    CHECK (
      account_email = lower(btrim(account_email))
      AND char_length(account_email) BETWEEN 3 AND 320
      AND account_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
    ),
  CONSTRAINT gmail_watch_subscriptions_topic_check
    CHECK (topic_name ~ '^projects/[^/]+/topics/[^/]+$'),
  CONSTRAINT gmail_watch_subscriptions_subscription_check
    CHECK (subscription_name ~ '^projects/[^/]+/subscriptions/[^/]+$'),
  CONSTRAINT gmail_watch_subscriptions_status_check
    CHECK (status IN ('inactive', 'active', 'error', 'resync_required')),
  CONSTRAINT gmail_watch_subscriptions_history_check
    CHECK (history_id IS NULL OR history_id ~ '^[0-9]{1,32}$'),
  CONSTRAINT gmail_watch_subscriptions_notification_history_check
    CHECK (
      last_notification_history_id IS NULL
      OR last_notification_history_id ~ '^[0-9]{1,32}$'
    ),
  CONSTRAINT gmail_watch_subscriptions_active_expiry_check
    CHECK (status <> 'active' OR watch_expires_at IS NOT NULL)
);

-- A Gmail address represents one mailbox and can have only one active cursor.
-- This prevents one signed notification from ambiguously resolving to multiple
-- application owners.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_watch_subscriptions_email
  ON public.gmail_watch_subscriptions (lower(account_email));

CREATE INDEX IF NOT EXISTS idx_gmail_watch_subscriptions_expiry
  ON public.gmail_watch_subscriptions (watch_expires_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.gmail_pubsub_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watch_id uuid NOT NULL,
  oauth_account_id uuid NOT NULL,
  subscription_name text NOT NULL,
  pubsub_message_id text NOT NULL,
  notification_history_id text NOT NULL,
  publish_time timestamptz,
  status text NOT NULL DEFAULT 'processing',
  attempt_count integer NOT NULL DEFAULT 1,
  lease_expires_at timestamptz,
  history_records integer NOT NULL DEFAULT 0,
  change_events integer NOT NULL DEFAULT 0,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT gmail_pubsub_receipts_watch_owner_fkey
    FOREIGN KEY (watch_id, user_id)
    REFERENCES public.gmail_watch_subscriptions(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT gmail_pubsub_receipts_account_owner_fkey
    FOREIGN KEY (oauth_account_id, user_id)
    REFERENCES public.oauth_accounts(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT gmail_pubsub_receipts_message_unique
    UNIQUE (subscription_name, pubsub_message_id),
  CONSTRAINT gmail_pubsub_receipts_message_id_check
    CHECK (
      char_length(pubsub_message_id) BETWEEN 1 AND 256
      AND pubsub_message_id ~ '^[A-Za-z0-9._:-]+$'
    ),
  CONSTRAINT gmail_pubsub_receipts_subscription_check
    CHECK (subscription_name ~ '^projects/[^/]+/subscriptions/[^/]+$'),
  CONSTRAINT gmail_pubsub_receipts_history_check
    CHECK (notification_history_id ~ '^[0-9]{1,32}$'),
  CONSTRAINT gmail_pubsub_receipts_status_check
    CHECK (status IN ('processing', 'succeeded', 'ignored', 'failed')),
  CONSTRAINT gmail_pubsub_receipts_attempt_check
    CHECK (attempt_count > 0),
  CONSTRAINT gmail_pubsub_receipts_count_check
    CHECK (history_records >= 0 AND change_events >= 0),
  CONSTRAINT gmail_pubsub_receipts_completion_check
    CHECK (
      (status = 'processing' AND processed_at IS NULL AND lease_expires_at IS NOT NULL)
      OR (status <> 'processing' AND processed_at IS NOT NULL AND lease_expires_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_gmail_pubsub_receipts_watch_received
  ON public.gmail_pubsub_receipts (watch_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.gmail_history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watch_id uuid NOT NULL,
  oauth_account_id uuid NOT NULL,
  receipt_id uuid NOT NULL REFERENCES public.gmail_pubsub_receipts(id) ON DELETE CASCADE,
  history_id text NOT NULL,
  event_type text NOT NULL,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  label_ids text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT gmail_history_events_watch_owner_fkey
    FOREIGN KEY (watch_id, user_id)
    REFERENCES public.gmail_watch_subscriptions(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT gmail_history_events_account_owner_fkey
    FOREIGN KEY (oauth_account_id, user_id)
    REFERENCES public.oauth_accounts(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT gmail_history_events_identity_unique
    UNIQUE (oauth_account_id, history_id, event_type, gmail_message_id),
  CONSTRAINT gmail_history_events_history_check
    CHECK (history_id ~ '^[0-9]{1,32}$'),
  CONSTRAINT gmail_history_events_type_check
    CHECK (event_type IN ('message_added', 'message_deleted', 'labels_added', 'labels_removed')),
  CONSTRAINT gmail_history_events_message_check
    CHECK (char_length(gmail_message_id) BETWEEN 1 AND 512)
);

CREATE INDEX IF NOT EXISTS idx_gmail_history_events_user_created
  ON public.gmail_history_events (user_id, created_at DESC);

ALTER TABLE public.gmail_watch_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_pubsub_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_history_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their Gmail watch status"
  ON public.gmail_watch_subscriptions;
CREATE POLICY "Users can view their Gmail watch status"
  ON public.gmail_watch_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their Gmail history events"
  ON public.gmail_history_events;
CREATE POLICY "Users can view their Gmail history events"
  ON public.gmail_history_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Push receipts expose provider delivery identifiers and lease state. They are
-- intentionally server-only; the owner-facing health surface uses the bounded
-- watch status and sync_logs tables instead.
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

DROP TRIGGER IF EXISTS update_gmail_watch_subscriptions_updated_at
  ON public.gmail_watch_subscriptions;
CREATE TRIGGER update_gmail_watch_subscriptions_updated_at
  BEFORE UPDATE ON public.gmail_watch_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Atomically reserve or reclaim a Pub/Sub message. A concurrent delivery gets
-- "busy" and must be negatively acknowledged; a terminal duplicate gets
-- "replay" and can be acknowledged without touching Gmail again.
CREATE OR REPLACE FUNCTION public.claim_gmail_pubsub_message(
  p_watch_id uuid,
  p_subscription_name text,
  p_pubsub_message_id text,
  p_notification_history_id text,
  p_publish_time timestamptz
)
RETURNS TABLE (
  receipt_id uuid,
  claim_state text,
  receipt_status text,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_watch public.gmail_watch_subscriptions%ROWTYPE;
  v_receipt public.gmail_pubsub_receipts%ROWTYPE;
BEGIN
  SELECT *
    INTO v_watch
    FROM public.gmail_watch_subscriptions
   WHERE id = p_watch_id
     AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Gmail watch not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.gmail_pubsub_receipts (
    user_id,
    watch_id,
    oauth_account_id,
    subscription_name,
    pubsub_message_id,
    notification_history_id,
    publish_time,
    status,
    lease_expires_at
  ) VALUES (
    v_watch.user_id,
    v_watch.id,
    v_watch.oauth_account_id,
    p_subscription_name,
    p_pubsub_message_id,
    p_notification_history_id,
    p_publish_time,
    'processing',
    statement_timestamp() + interval '5 minutes'
  )
  ON CONFLICT (subscription_name, pubsub_message_id) DO NOTHING
  RETURNING * INTO v_receipt;

  IF FOUND THEN
    RETURN QUERY SELECT v_receipt.id, 'claimed'::text, v_receipt.status, v_receipt.attempt_count;
    RETURN;
  END IF;

  SELECT *
    INTO v_receipt
    FROM public.gmail_pubsub_receipts
   WHERE subscription_name = p_subscription_name
     AND pubsub_message_id = p_pubsub_message_id
   FOR UPDATE;

  IF v_receipt.watch_id <> v_watch.id
     OR v_receipt.notification_history_id <> p_notification_history_id THEN
    RAISE EXCEPTION 'Pub/Sub message identity conflict' USING ERRCODE = '23505';
  END IF;

  IF v_receipt.status IN ('succeeded', 'ignored') THEN
    RETURN QUERY SELECT v_receipt.id, 'replay'::text, v_receipt.status, v_receipt.attempt_count;
    RETURN;
  END IF;

  IF v_receipt.status = 'processing'
     AND v_receipt.lease_expires_at > statement_timestamp() THEN
    RETURN QUERY SELECT v_receipt.id, 'busy'::text, v_receipt.status, v_receipt.attempt_count;
    RETURN;
  END IF;

  UPDATE public.gmail_pubsub_receipts
     SET status = 'processing',
         attempt_count = attempt_count + 1,
         lease_expires_at = statement_timestamp() + interval '5 minutes',
         processed_at = NULL,
         error_code = NULL,
         error_message = NULL,
         updated_at = statement_timestamp()
   WHERE id = v_receipt.id
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT v_receipt.id, 'claimed'::text, v_receipt.status, v_receipt.attempt_count;
END
$function$;

-- Complete a claimed delivery and advance the mailbox cursor monotonically.
-- Concurrent, out-of-order push deliveries can overlap safely without ever
-- moving history_id backwards.
CREATE OR REPLACE FUNCTION public.complete_gmail_pubsub_message(
  p_receipt_id uuid,
  p_status text,
  p_effective_history_id text,
  p_history_records integer,
  p_change_events integer,
  p_result_summary jsonb,
  p_error_code text,
  p_error_message text
)
RETURNS TABLE (
  completion_state text,
  stored_history_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_receipt public.gmail_pubsub_receipts%ROWTYPE;
  v_watch public.gmail_watch_subscriptions%ROWTYPE;
BEGIN
  IF p_status NOT IN ('succeeded', 'ignored', 'failed') THEN
    RAISE EXCEPTION 'Invalid Gmail Pub/Sub completion status' USING ERRCODE = '22023';
  END IF;
  IF p_effective_history_id !~ '^[0-9]{1,32}$'
     OR p_history_records < 0
     OR p_change_events < 0 THEN
    RAISE EXCEPTION 'Invalid Gmail Pub/Sub completion payload' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_receipt
    FROM public.gmail_pubsub_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gmail Pub/Sub receipt not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_watch
    FROM public.gmail_watch_subscriptions
   WHERE id = v_receipt.watch_id
   FOR UPDATE;

  IF v_receipt.status IN ('succeeded', 'ignored') THEN
    RETURN QUERY SELECT 'already_complete'::text, v_watch.history_id;
    RETURN;
  END IF;
  IF v_receipt.status <> 'processing' THEN
    RAISE EXCEPTION 'Gmail Pub/Sub receipt is not claimed' USING ERRCODE = '55000';
  END IF;

  IF p_status = 'succeeded'
     AND (
       v_watch.history_id IS NULL
       OR p_effective_history_id::numeric > v_watch.history_id::numeric
     ) THEN
    UPDATE public.gmail_watch_subscriptions
       SET history_id = p_effective_history_id,
           last_notification_history_id = CASE
             WHEN last_notification_history_id IS NULL
               OR p_effective_history_id::numeric > last_notification_history_id::numeric
             THEN p_effective_history_id
             ELSE last_notification_history_id
           END,
           last_notification_at = statement_timestamp(),
           last_sync_at = statement_timestamp(),
           status = 'active',
           last_error_code = NULL,
           last_error_message = NULL,
           updated_at = statement_timestamp()
     WHERE id = v_watch.id
    RETURNING * INTO v_watch;
  ELSE
    UPDATE public.gmail_watch_subscriptions
       SET last_notification_history_id = CASE
             WHEN last_notification_history_id IS NULL
               OR p_effective_history_id::numeric > last_notification_history_id::numeric
             THEN p_effective_history_id
             ELSE last_notification_history_id
           END,
           last_notification_at = statement_timestamp(),
           updated_at = statement_timestamp()
     WHERE id = v_watch.id
    RETURNING * INTO v_watch;
  END IF;

  UPDATE public.gmail_pubsub_receipts
     SET status = p_status,
         history_records = p_history_records,
         change_events = p_change_events,
         result_summary = COALESCE(p_result_summary, '{}'::jsonb),
         error_code = p_error_code,
         error_message = left(p_error_message, 2000),
         lease_expires_at = NULL,
         processed_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = v_receipt.id;

  RETURN QUERY SELECT 'completed'::text, v_watch.history_id;
END
$function$;

REVOKE ALL ON FUNCTION public.claim_gmail_pubsub_message(
  uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_gmail_pubsub_message(
  uuid, text, text, integer, integer, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gmail_pubsub_message(
  uuid, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_gmail_pubsub_message(
  uuid, text, text, integer, integer, jsonb, text, text
) TO service_role;

COMMENT ON TABLE public.gmail_watch_subscriptions IS
  'Canonical per-mailbox Gmail users.watch state and monotonic history cursor.';
COMMENT ON TABLE public.gmail_pubsub_receipts IS
  'Server-only authenticated Pub/Sub delivery, lease, replay, and outcome receipts.';
COMMENT ON TABLE public.gmail_history_events IS
  'Metadata-only Gmail history changes ingested from authenticated Pub/Sub pushes.';
