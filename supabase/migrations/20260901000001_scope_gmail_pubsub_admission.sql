-- Draft owner-scoped Gmail admission tranche. Apply only in an approved,
-- coordinated database/runtime release: old unscoped RPC callers fail closed.
-- No owner UUID or provider configuration is selected by this migration.
BEGIN;

CREATE FUNCTION public.claim_gmail_pubsub_message_scoped(
  p_user_id uuid,
  p_oauth_account_id uuid,
  p_account_email text,
  p_watch_generation bigint,
  p_watch_id uuid,
  p_subscription_name text,
  p_pubsub_message_id text,
  p_notification_history_id text,
  p_publish_time timestamptz
)
RETURNS TABLE (receipt_id uuid, claim_state text, receipt_status text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_watch public.gmail_watch_subscriptions%ROWTYPE;
BEGIN
  -- Lock before using the private compatibility implementation. This binds
  -- receipt ownership to the tuple admitted by the Edge control plane even if
  -- an administrative owner/account reassignment races the preceding lookup.
  SELECT * INTO v_watch FROM public.gmail_watch_subscriptions
   WHERE id = p_watch_id AND user_id = p_user_id
     AND oauth_account_id = p_oauth_account_id
     AND account_email = p_account_email
     AND subscription_name = p_subscription_name
     AND watch_generation = p_watch_generation
     AND status = 'active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admitted Gmail watch is unavailable' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY SELECT * FROM public.claim_gmail_pubsub_message(
    p_watch_id, p_subscription_name, p_pubsub_message_id,
    p_notification_history_id, p_publish_time
  );
END
$function$;

CREATE FUNCTION public.complete_gmail_pubsub_message_scoped(
  p_user_id uuid,
  p_oauth_account_id uuid,
  p_account_email text,
  p_watch_generation bigint,
  p_watch_id uuid,
  p_subscription_name text,
  p_attempt_count integer,
  p_receipt_id uuid,
  p_status text,
  p_effective_history_id text,
  p_history_records integer,
  p_change_events integer,
  p_result_summary jsonb,
  p_error_code text,
  p_error_message text
)
RETURNS TABLE (completion_state text, stored_history_id text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_watch public.gmail_watch_subscriptions%ROWTYPE;
  v_receipt public.gmail_pubsub_receipts%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('succeeded', 'ignored', 'failed')
     OR p_effective_history_id IS NULL OR p_effective_history_id !~ '^[0-9]{1,32}$'
     OR p_history_records IS NULL OR p_history_records < 0
     OR p_change_events IS NULL OR p_change_events < 0
     OR p_attempt_count IS NULL OR p_attempt_count < 1 THEN
    RAISE EXCEPTION 'Invalid Gmail completion' USING ERRCODE = '22023';
  END IF;
  -- Always lock watch then receipt, matching claim's order. A stopped or
  -- renewed generation cannot be resurrected by a late successful worker.
  SELECT * INTO v_watch FROM public.gmail_watch_subscriptions
   WHERE id = p_watch_id AND user_id = p_user_id
     AND oauth_account_id = p_oauth_account_id
     AND account_email = p_account_email
     AND subscription_name = p_subscription_name
     AND watch_generation = p_watch_generation
   FOR UPDATE;
  IF NOT FOUND OR (p_status = 'succeeded' AND v_watch.status <> 'active') THEN
    RAISE EXCEPTION 'Admitted Gmail watch is unavailable' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_receipt FROM public.gmail_pubsub_receipts
   WHERE id = p_receipt_id AND user_id = p_user_id
     AND watch_id = p_watch_id AND oauth_account_id = p_oauth_account_id
     AND subscription_name = p_subscription_name
     AND attempt_count = p_attempt_count
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admitted Gmail receipt is unavailable' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY SELECT * FROM public.complete_gmail_pubsub_message(
    p_receipt_id, p_status, p_effective_history_id, p_history_records,
    p_change_events, p_result_summary, p_error_code, p_error_message
  );
END
$function$;

-- SECURITY DEFINER wrappers can call the old implementations as their owner;
-- neither public clients nor a stale service-role Edge version may bypass the
-- admitted tuple or overwrite the outcome of a reclaimed delivery attempt.
REVOKE ALL ON FUNCTION public.claim_gmail_pubsub_message(
  uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_gmail_pubsub_message(
  uuid, text, text, integer, integer, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_gmail_pubsub_message_scoped(
  uuid, uuid, text, bigint, uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_gmail_pubsub_message_scoped(
  uuid, uuid, text, bigint, uuid, text, integer, uuid, text, text, integer, integer, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gmail_pubsub_message_scoped(
  uuid, uuid, text, bigint, uuid, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_gmail_pubsub_message_scoped(
  uuid, uuid, text, bigint, uuid, text, integer, uuid, text, text, integer, integer, jsonb, text, text
) TO service_role;

COMMIT;
