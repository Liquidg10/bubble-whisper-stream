-- Preserve the existing Calendar account identity when one canonical account
-- is linked to an OAuth token. This keeps cached events attached to the same
-- account during the isolated-project forced-reauthorization flow.

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
  linked_calendar_account_count integer;
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

  SELECT count(*)
  INTO linked_calendar_account_count
  FROM public.calendar_accounts
  WHERE oauth_token_id = selected_token_id;

  IF linked_calendar_account_count = 1 THEN
    SELECT account.id
    INTO selected_calendar_account_id
    FROM public.calendar_accounts AS account
    WHERE account.oauth_token_id = selected_token_id
    FOR UPDATE;
  ELSE
    SELECT account.id
    INTO selected_calendar_account_id
    FROM public.calendar_accounts AS account
    WHERE account.oauth_token_id = selected_token_id
      AND account.calendar_id = 'primary'
    ORDER BY account.created_at
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF selected_calendar_account_id IS NULL THEN
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
    RETURNING id INTO selected_calendar_account_id;
  ELSE
    UPDATE public.calendar_accounts
    SET user_id = p_user_id,
        provider = 'google',
        account_name = COALESCE(
          NULLIF(btrim(p_account_name), ''),
          lower(btrim(p_account_email))
        ),
        account_email = lower(btrim(p_account_email)),
        sync_enabled = true,
        updated_at = statement_timestamp()
    WHERE id = selected_calendar_account_id;
  END IF;

  RETURN QUERY SELECT selected_token_id, selected_calendar_account_id;
END
$function$;

REVOKE ALL ON FUNCTION public.upsert_google_calendar_connection(
  uuid, text, text, text, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_calendar_connection(
  uuid, text, text, text, text, text, timestamptz, text
) TO service_role;
