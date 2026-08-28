-- Harden the dedicated Google Calendar OAuth path while leaving the legacy
-- Gmail state producer compatible. Legacy unowned Calendar state is retired;
-- new Calendar state is user-bound and consumed atomically by a
-- service-role-only RPC.

ALTER TABLE public.oauth_state
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS redirect_uri text,
  ADD COLUMN IF NOT EXISTS calendar_account_id uuid
    REFERENCES public.calendar_accounts(id) ON DELETE CASCADE;

-- The legacy Calendar producer did not bind state to an authenticated user.
-- Those rows cannot be upgraded safely, so retire them before making the
-- dedicated Calendar state contract mandatory. Other services remain intact.
DELETE FROM public.oauth_state
WHERE service = 'calendar'
  AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_state_user_expires
  ON public.oauth_state (user_id, expires_at)
  WHERE user_id IS NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oauth_state_calendar_origin_check'
      AND conrelid = 'public.oauth_state'::regclass
  ) THEN
    ALTER TABLE public.oauth_state
      ADD CONSTRAINT oauth_state_calendar_origin_check
      CHECK (
        service IS DISTINCT FROM 'calendar'
        OR (
          user_id IS NOT NULL
          AND origin IN (
            'https://bubble-whisper-stream.lovable.app',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://localhost:3000'
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oauth_state_calendar_redirect_check'
      AND conrelid = 'public.oauth_state'::regclass
  ) THEN
    ALTER TABLE public.oauth_state
      ADD CONSTRAINT oauth_state_calendar_redirect_check
      CHECK (
        service IS DISTINCT FROM 'calendar'
        OR (
          user_id IS NOT NULL
          AND redirect_uri IS NOT NULL
          AND redirect_uri = origin || '/oauth-callback'
        )
      );
  END IF;
END
$migration$;

ALTER TABLE public.oauth_tokens
  ADD COLUMN IF NOT EXISTS provider_account_id text;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.oauth_tokens
    WHERE provider_account_id IS NOT NULL
    GROUP BY user_id, provider, service_type, provider_account_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot enforce OAuth provider identity: duplicate canonical provider-account rows exist',
      HINT = 'Reconcile the duplicate OAuth token rows explicitly, then rerun this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oauth_tokens_provider_identity_unique'
      AND conrelid = 'public.oauth_tokens'::regclass
  ) THEN
    ALTER TABLE public.oauth_tokens
      ADD CONSTRAINT oauth_tokens_provider_identity_unique
      UNIQUE (user_id, provider, service_type, provider_account_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_accounts
    WHERE calendar_id IS NOT NULL
    GROUP BY oauth_token_id, calendar_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot enforce Calendar account identity: duplicate (oauth_token_id, calendar_id) rows exist',
      HINT = 'Reconcile the duplicate Calendar accounts explicitly, then rerun this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_accounts_token_calendar_unique'
      AND conrelid = 'public.calendar_accounts'::regclass
  ) THEN
    ALTER TABLE public.calendar_accounts
      ADD CONSTRAINT calendar_accounts_token_calendar_unique
      UNIQUE (oauth_token_id, calendar_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_events
    GROUP BY calendar_account_id, external_event_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot enforce Calendar event identity: duplicate (calendar_account_id, external_event_id) rows exist',
      HINT = 'Reconcile the duplicate Calendar events explicitly, then rerun this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_events_account_external_unique'
      AND conrelid = 'public.calendar_events'::regclass
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_account_external_unique
      UNIQUE (calendar_account_id, external_event_id);
  END IF;
END
$migration$;

-- Canonical provider tokens are server-only. The browser-facing account table
-- contains metadata; Edge functions with the service role are the only token
-- readers and writers.
DROP POLICY IF EXISTS "Users can manage their own tokens" ON public.oauth_tokens;

-- Retire inherited privilege gaps around Calendar cache maintenance and sync
-- receipts. Service-role Edge functions bypass RLS and remain the only callers
-- of the SECURITY DEFINER cleanup helpers. Authenticated browser code may write
-- only a receipt for its own user; anon callers cannot insert receipts.
REVOKE ALL ON FUNCTION public.cleanup_old_calendar_events(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_calendar_events(uuid, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_oauth_state()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_oauth_state()
  TO service_role;

DROP POLICY IF EXISTS "Service can insert sync logs" ON public.sync_logs;
DROP POLICY IF EXISTS "Users can insert their own sync logs" ON public.sync_logs;
CREATE POLICY "Users can insert their own sync logs"
  ON public.sync_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.consume_google_calendar_oauth_state(
  p_state text,
  p_user_id uuid
)
RETURNS TABLE (
  code_verifier text,
  service text,
  origin text,
  redirect_uri text,
  calendar_account_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  DELETE FROM public.oauth_state AS oauth_state_row
  WHERE oauth_state_row.state = p_state
    AND oauth_state_row.user_id = p_user_id
    AND oauth_state_row.service = 'calendar'
    AND oauth_state_row.expires_at > statement_timestamp()
    AND oauth_state_row.origin IN (
      'https://bubble-whisper-stream.lovable.app',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://localhost:3000'
    )
    AND oauth_state_row.redirect_uri = oauth_state_row.origin || '/oauth-callback'
  RETURNING
    oauth_state_row.code_verifier,
    oauth_state_row.service,
    oauth_state_row.origin,
    oauth_state_row.redirect_uri,
    oauth_state_row.calendar_account_id;
$function$;

REVOKE ALL ON FUNCTION public.consume_google_calendar_oauth_state(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_google_calendar_oauth_state(text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_expired_google_calendar_oauth_state()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.oauth_state
  WHERE service = 'calendar'
    AND user_id IS NOT NULL
    AND expires_at <= statement_timestamp();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$function$;

REVOKE ALL ON FUNCTION public.cleanup_expired_google_calendar_oauth_state()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_google_calendar_oauth_state()
  TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_google_calendar_connection(
  p_user_id uuid,
  p_provider_account_id text,
  p_account_email text,
  p_account_name text,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_scope text
)
RETURNS TABLE (
  oauth_token_id uuid,
  calendar_account_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  selected_token_id uuid;
  selected_calendar_account_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Authenticated user does not exist';
  END IF;

  IF p_provider_account_id IS NULL OR btrim(p_provider_account_id) = '' THEN
    RAISE EXCEPTION 'Google provider account ID is required';
  END IF;
  IF p_account_email IS NULL OR btrim(p_account_email) = '' THEN
    RAISE EXCEPTION 'Google account email is required';
  END IF;
  IF p_access_token IS NULL OR p_access_token NOT LIKE 'oauth:v1:%' THEN
    RAISE EXCEPTION 'Access token must use the oauth:v1 encrypted envelope';
  END IF;
  IF p_refresh_token IS NULL OR p_refresh_token NOT LIKE 'oauth:v1:%' THEN
    RAISE EXCEPTION 'Refresh token must use the oauth:v1 encrypted envelope';
  END IF;
  IF p_token_expires_at IS NULL OR p_token_expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'OAuth token expiry must be in the future';
  END IF;
  IF NOT (
    'https://www.googleapis.com/auth/calendar.readonly' = ANY(
      regexp_split_to_array(btrim(p_scope), '\s+')
    )
  ) THEN
    RAISE EXCEPTION 'Calendar read scope is required';
  END IF;

  SELECT token.id
  INTO selected_token_id
  FROM public.oauth_tokens AS token
  WHERE token.user_id = p_user_id
    AND token.provider = 'google'
    AND token.service_type = 'calendar'
    AND token.provider_account_id = p_provider_account_id
  FOR UPDATE;

  -- Adopt a legacy canonical row for the same user/account instead of creating
  -- a duplicate. Legacy plaintext tokens are replaced, never read or retained.
  IF selected_token_id IS NULL THEN
    SELECT token.id
    INTO selected_token_id
    FROM public.oauth_tokens AS token
    WHERE token.user_id = p_user_id
      AND token.provider = 'google'
      AND token.service_type = 'calendar'
      AND token.provider_account_id IS NULL
      AND lower(token.account_email) = lower(p_account_email)
    ORDER BY token.created_at
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF selected_token_id IS NULL THEN
    INSERT INTO public.oauth_tokens (
      user_id,
      provider,
      service_type,
      provider_account_id,
      account_email,
      access_token,
      refresh_token,
      token_expires_at,
      scope
    )
    VALUES (
      p_user_id,
      'google',
      'calendar',
      p_provider_account_id,
      lower(btrim(p_account_email)),
      p_access_token,
      p_refresh_token,
      p_token_expires_at,
      btrim(p_scope)
    )
    ON CONFLICT ON CONSTRAINT oauth_tokens_provider_identity_unique
    DO UPDATE SET
      account_email = EXCLUDED.account_email,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      scope = EXCLUDED.scope,
      updated_at = statement_timestamp()
    RETURNING id INTO selected_token_id;
  ELSE
    UPDATE public.oauth_tokens
    SET provider_account_id = p_provider_account_id,
        account_email = lower(btrim(p_account_email)),
        access_token = p_access_token,
        refresh_token = p_refresh_token,
        token_expires_at = p_token_expires_at,
        scope = btrim(p_scope),
        updated_at = statement_timestamp()
    WHERE id = selected_token_id;
  END IF;

  INSERT INTO public.calendar_accounts (
    user_id,
    oauth_token_id,
    provider,
    account_name,
    account_email,
    calendar_id,
    calendar_name,
    is_primary,
    sync_enabled
  )
  VALUES (
    p_user_id,
    selected_token_id,
    'google',
    COALESCE(NULLIF(btrim(p_account_name), ''), lower(btrim(p_account_email))),
    lower(btrim(p_account_email)),
    'primary',
    'Primary calendar',
    true,
    true
  )
  ON CONFLICT ON CONSTRAINT calendar_accounts_token_calendar_unique
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    provider = EXCLUDED.provider,
    account_name = EXCLUDED.account_name,
    account_email = EXCLUDED.account_email,
    calendar_name = EXCLUDED.calendar_name,
    is_primary = true,
    sync_enabled = true,
    updated_at = statement_timestamp()
  RETURNING id INTO selected_calendar_account_id;

  RETURN QUERY SELECT selected_token_id, selected_calendar_account_id;
END
$function$;

REVOKE ALL ON FUNCTION public.upsert_google_calendar_connection(
  uuid, text, text, text, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_calendar_connection(
  uuid, text, text, text, text, text, timestamptz, text
) TO service_role;
