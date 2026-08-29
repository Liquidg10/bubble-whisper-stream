-- Target-only OAuth credential reset template.
--
-- The operator wrapper replaces every @@...@@ token with a validated count,
-- digest, or strict oauth:v1 tombstone before sending this transaction to
-- psql. Never run this template directly and never run it on the source.

\set ON_ERROR_STOP on
BEGIN;
SET ROLE postgres;

-- Block callback, scheduler, or sync writes between the receipt-bound checks
-- and the fail-closed mutation. The fixed alphabetical order minimizes
-- deadlock risk if an operator accidentally enables target traffic early.
LOCK TABLE
  public.calendar_accounts,
  public.calendar_events,
  public.email_accounts,
  public.email_messages,
  public.email_recipients,
  public.gmail_actionables,
  public.gmail_compose_receipts,
  public.gmail_history_events,
  public.gmail_pubsub_receipts,
  public.gmail_threads,
  public.gmail_watch_subscriptions,
  public.oauth_accounts,
  public.oauth_state,
  public.oauth_tokens,
  public.plaid_accounts,
  public.plaid_items,
  public.plaid_sync_status,
  public.plaid_transactions,
  public.plaid_webhooks
IN SHARE ROW EXCLUSIVE MODE;

DO $reset$
DECLARE
  actual_digest text;
  oauth_metadata_before text;
  calendar_metadata_before text;
  calendar_events_before text;
  updated_tokens integer;
  updated_accounts integer;
BEGIN
  IF (SELECT count(*) FROM public.oauth_accounts) <> 0 THEN
    RAISE EXCEPTION 'Generic OAuth accounts require a separate reviewed disposition';
  END IF;

  IF (SELECT count(*) FROM public.oauth_tokens) <> @@EXPECTED_OAUTH_TOKEN_COUNT@@ THEN
    RAISE EXCEPTION 'OAuth token count drifted after the verified import';
  END IF;
  IF (SELECT count(*) FROM public.calendar_accounts) <> @@EXPECTED_CALENDAR_ACCOUNT_COUNT@@ THEN
    RAISE EXCEPTION 'Calendar account count drifted after the verified import';
  END IF;
  IF (SELECT count(*) FROM public.calendar_events) <> @@EXPECTED_CALENDAR_EVENT_COUNT@@ THEN
    RAISE EXCEPTION 'Calendar event count drifted after the verified import';
  END IF;
  IF (
    SELECT count(*) FROM public.calendar_accounts
    WHERE calendar_id = 'primary'
  ) <> @@EXPECTED_CALENDAR_ACCOUNT_COUNT@@ THEN
    RAISE EXCEPTION 'Reviewed reset requires every Calendar account to retain calendar_id=primary';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n' ORDER BY to_jsonb(source_row)::text),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO actual_digest
  FROM public.oauth_tokens AS source_row;
  IF actual_digest <> @@EXPECTED_OAUTH_TOKEN_DIGEST@@ THEN
    RAISE EXCEPTION 'OAuth token rows drifted after the verified import';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n' ORDER BY to_jsonb(source_row)::text),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO actual_digest
  FROM public.calendar_accounts AS source_row;
  IF actual_digest <> @@EXPECTED_CALENDAR_ACCOUNT_DIGEST@@ THEN
    RAISE EXCEPTION 'Calendar account rows drifted after the verified import';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n' ORDER BY to_jsonb(source_row)::text),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO actual_digest
  FROM public.calendar_events AS source_row;
  IF actual_digest <> @@EXPECTED_CALENDAR_EVENT_DIGEST@@ THEN
    RAISE EXCEPTION 'Calendar event rows drifted after the verified import';
  END IF;
  calendar_events_before := actual_digest;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(string_agg(row_json, E'\n' ORDER BY row_json), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO oauth_metadata_before
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'provider', provider,
      'service_type', service_type,
      'provider_account_id', provider_account_id,
      'account_email', account_email,
      'scope', scope,
      'created_at', created_at
    )::text AS row_json
    FROM public.oauth_tokens
  ) AS preserved_oauth_metadata;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(string_agg(row_json, E'\n' ORDER BY row_json), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO calendar_metadata_before
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'oauth_token_id', oauth_token_id,
      'provider', provider,
      'account_name', account_name,
      'account_email', account_email,
      'calendar_id', calendar_id,
      'calendar_name', calendar_name,
      'is_primary', is_primary,
      'bounded_sync_window_days', bounded_sync_window_days,
      'created_at', created_at
    )::text AS row_json
    FROM public.calendar_accounts
  ) AS preserved_calendar_metadata;

  IF EXISTS (
    SELECT 1 FROM public.email_accounts
    UNION ALL SELECT 1 FROM public.email_messages
    UNION ALL SELECT 1 FROM public.email_recipients
    UNION ALL SELECT 1 FROM public.gmail_actionables
    UNION ALL SELECT 1 FROM public.gmail_compose_receipts
    UNION ALL SELECT 1 FROM public.gmail_history_events
    UNION ALL SELECT 1 FROM public.gmail_pubsub_receipts
    UNION ALL SELECT 1 FROM public.gmail_threads
    UNION ALL SELECT 1 FROM public.gmail_watch_subscriptions
    UNION ALL SELECT 1 FROM public.oauth_state
    UNION ALL SELECT 1 FROM public.plaid_accounts
    UNION ALL SELECT 1 FROM public.plaid_items
    UNION ALL SELECT 1 FROM public.plaid_sync_status
    UNION ALL SELECT 1 FROM public.plaid_transactions
    UNION ALL SELECT 1 FROM public.plaid_webhooks
  ) THEN
    RAISE EXCEPTION 'Email, Gmail, or Plaid state requires a separate reviewed disposition';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.oauth_tokens
    WHERE provider <> 'google'
       OR service_type <> 'calendar'
       OR provider_account_id IS NULL
       OR access_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
       OR (
         refresh_token IS NOT NULL
         AND refresh_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
       )
  ) THEN
    RAISE EXCEPTION 'Imported OAuth credentials do not match the reviewed Calendar-only contract';
  END IF;

  IF EXISTS (
    SELECT token.id
    FROM public.oauth_tokens AS token
    LEFT JOIN public.calendar_accounts AS account
      ON account.oauth_token_id = token.id
    GROUP BY token.id
    HAVING count(account.id) <> 1
  ) THEN
    RAISE EXCEPTION 'Every imported OAuth token must back exactly one Calendar account';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_accounts AS account
    JOIN public.oauth_tokens AS token ON token.id = account.oauth_token_id
    WHERE account.user_id <> token.user_id
       OR account.provider <> 'google'
  ) THEN
    RAISE EXCEPTION 'Calendar account ownership or provider metadata is inconsistent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_events AS event
    LEFT JOIN public.calendar_accounts AS account
      ON account.id = event.calendar_account_id
    WHERE account.id IS NULL
       OR event.user_id IS DISTINCT FROM account.user_id
  ) THEN
    RAISE EXCEPTION 'Calendar event ownership is inconsistent';
  END IF;

  UPDATE public.oauth_tokens
  SET access_token = @@OAUTH_TOMBSTONE@@,
      refresh_token = NULL,
      token_expires_at = to_timestamp(0),
      updated_at = statement_timestamp()
  WHERE provider = 'google' AND service_type = 'calendar';
  GET DIAGNOSTICS updated_tokens = ROW_COUNT;
  IF updated_tokens <> @@EXPECTED_OAUTH_TOKEN_COUNT@@ THEN
    RAISE EXCEPTION 'OAuth credential reset changed an unexpected row count';
  END IF;

  UPDATE public.calendar_accounts
  SET sync_enabled = false,
      last_sync_at = NULL,
      sync_token = NULL,
      watch_channel_id = NULL,
      watch_resource_id = NULL,
      watch_expires_at = NULL,
      watch_status = 'inactive',
      next_sync_token = NULL,
      sync_status = 'idle',
      last_sync_error = NULL,
      sync_cursor = NULL,
      last_full_sync_at = NULL,
      sync_page_token = NULL,
      updated_at = statement_timestamp()
  WHERE provider = 'google';
  GET DIAGNOSTICS updated_accounts = ROW_COUNT;
  IF updated_accounts <> @@EXPECTED_CALENDAR_ACCOUNT_COUNT@@ THEN
    RAISE EXCEPTION 'Calendar quarantine changed an unexpected row count';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.oauth_tokens
    WHERE access_token <> @@OAUTH_TOMBSTONE@@
       OR access_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
       OR refresh_token IS NOT NULL
       OR token_expires_at IS NULL
       OR token_expires_at >= statement_timestamp()
  ) THEN
    RAISE EXCEPTION 'OAuth credentials were not reset to the fail-closed target state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_accounts
    WHERE sync_enabled
       OR last_sync_at IS NOT NULL
       OR sync_token IS NOT NULL
       OR watch_channel_id IS NOT NULL
       OR watch_resource_id IS NOT NULL
       OR watch_expires_at IS NOT NULL
       OR watch_status <> 'inactive'
       OR next_sync_token IS NOT NULL
       OR sync_status <> 'idle'
       OR last_sync_error IS NOT NULL
       OR sync_cursor IS NOT NULL
       OR last_full_sync_at IS NOT NULL
       OR sync_page_token IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Calendar sync or watch state was not fully quarantined';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(string_agg(row_json, E'\n' ORDER BY row_json), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO actual_digest
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'provider', provider,
      'service_type', service_type,
      'provider_account_id', provider_account_id,
      'account_email', account_email,
      'scope', scope,
      'created_at', created_at
    )::text AS row_json
    FROM public.oauth_tokens
  ) AS preserved_oauth_metadata;
  IF actual_digest <> oauth_metadata_before THEN
    RAISE EXCEPTION 'OAuth identity or account metadata changed during credential reset';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(string_agg(row_json, E'\n' ORDER BY row_json), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO actual_digest
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'oauth_token_id', oauth_token_id,
      'provider', provider,
      'account_name', account_name,
      'account_email', account_email,
      'calendar_id', calendar_id,
      'calendar_name', calendar_name,
      'is_primary', is_primary,
      'bounded_sync_window_days', bounded_sync_window_days,
      'created_at', created_at
    )::text AS row_json
    FROM public.calendar_accounts
  ) AS preserved_calendar_metadata;
  IF actual_digest <> calendar_metadata_before THEN
    RAISE EXCEPTION 'Calendar identity or account metadata changed during quarantine';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(
          string_agg(to_jsonb(source_row)::text, E'\n' ORDER BY to_jsonb(source_row)::text),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO actual_digest
  FROM public.calendar_events AS source_row;
  IF actual_digest <> calendar_events_before THEN
    RAISE EXCEPTION 'Calendar events changed during OAuth credential reset';
  END IF;
END
$reset$;

COMMIT;
