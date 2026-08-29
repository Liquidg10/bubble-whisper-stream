-- Close the legacy generic OAuth credential boundary.
--
-- Browser roles receive only account metadata. Provider credentials stay in
-- the two base tables and are readable/writable only by service-role Edge
-- Functions. Both token stores use the same strict oauth:v1 AES-256-GCM
-- envelope as the canonical Calendar path.

BEGIN;

-- Refuse to bless plaintext or legacy ciphertext. Production rollout must
-- explicitly reconcile any row reported by the preflight queries in the
-- deployment runbook before this migration is applied.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.oauth_accounts
    WHERE (access_token IS NOT NULL AND access_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$')
       OR (refresh_token IS NOT NULL AND refresh_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$')
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'oauth_accounts contains a non-oauth:v1 provider credential',
      HINT = 'Stop deployment and re-authorize or explicitly re-encrypt every legacy row; never copy a plaintext token into the migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.oauth_tokens
    WHERE access_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
       OR (refresh_token IS NOT NULL AND refresh_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$')
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'oauth_tokens contains a non-oauth:v1 provider credential',
      HINT = 'Stop deployment and explicitly reconcile the canonical token rows before retrying.';
  END IF;
END
$migration$;

ALTER TABLE public.oauth_accounts
  DROP CONSTRAINT IF EXISTS oauth_accounts_access_token_envelope_check,
  DROP CONSTRAINT IF EXISTS oauth_accounts_refresh_token_envelope_check;

ALTER TABLE public.oauth_accounts
  ADD CONSTRAINT oauth_accounts_access_token_envelope_check
    CHECK (
      access_token IS NULL
      OR access_token ~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
    ),
  ADD CONSTRAINT oauth_accounts_refresh_token_envelope_check
    CHECK (
      refresh_token IS NULL
      OR refresh_token ~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
    );

ALTER TABLE public.oauth_tokens
  DROP CONSTRAINT IF EXISTS oauth_tokens_access_token_envelope_check,
  DROP CONSTRAINT IF EXISTS oauth_tokens_refresh_token_envelope_check;

ALTER TABLE public.oauth_tokens
  ADD CONSTRAINT oauth_tokens_access_token_envelope_check
    CHECK (access_token ~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'),
  ADD CONSTRAINT oauth_tokens_refresh_token_envelope_check
    CHECK (
      refresh_token IS NULL
      OR refresh_token ~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
    );

-- The inherited helper returned provider credentials unchanged. Encryption is
-- exclusively an Edge Function responsibility now.
DROP FUNCTION IF EXISTS public.encrypt_oauth_token(text);

-- A Google identity may be connected independently by multiple Mind Manual
-- users. Ownership is part of the canonical identity key.
ALTER TABLE public.oauth_accounts
  DROP CONSTRAINT IF EXISTS oauth_accounts_provider_provider_user_id_key;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.oauth_accounts
    GROUP BY user_id, provider, provider_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot enforce OAuth account identity: duplicate owner/provider rows exist',
      HINT = 'Reconcile duplicate OAuth account rows explicitly, then rerun this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oauth_accounts_owner_provider_identity_unique'
      AND conrelid = 'public.oauth_accounts'::regclass
  ) THEN
    ALTER TABLE public.oauth_accounts
      ADD CONSTRAINT oauth_accounts_owner_provider_identity_unique
      UNIQUE (user_id, provider, provider_user_id);
  END IF;
END
$migration$;

-- Browser roles cannot operate on either credential-bearing base table. RLS
-- remains a second row-ownership boundary for metadata reads.
DROP POLICY IF EXISTS "Users can update their own OAuth accounts"
  ON public.oauth_accounts;
DROP POLICY IF EXISTS "Users can delete their own OAuth accounts"
  ON public.oauth_accounts;
DROP POLICY IF EXISTS "Users can insert their own OAuth accounts"
  ON public.oauth_accounts;
DROP POLICY IF EXISTS "Users can view their own OAuth accounts"
  ON public.oauth_accounts;
CREATE POLICY "Users can view their own OAuth account metadata"
  ON public.oauth_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own tokens"
  ON public.oauth_tokens;
DROP POLICY IF EXISTS "Users can view their own OAuth token metadata"
  ON public.oauth_tokens;
CREATE POLICY "Users can view their own OAuth token metadata"
  ON public.oauth_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL PRIVILEGES ON TABLE public.oauth_accounts
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.oauth_tokens
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.oauth_state
  FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  provider,
  provider_user_id,
  expires_at,
  last_used_at,
  scopes,
  scopes_string,
  account_email,
  token_type,
  created_at,
  updated_at
) ON TABLE public.oauth_accounts TO authenticated;

GRANT SELECT (
  id,
  user_id,
  provider,
  service_type,
  account_email,
  provider_account_id,
  token_expires_at,
  scope,
  created_at,
  updated_at
) ON TABLE public.oauth_tokens TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_accounts
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_tokens
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_state
  TO service_role;

DROP VIEW IF EXISTS public.oauth_accounts_metadata;
CREATE VIEW public.oauth_accounts_metadata
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  id,
  user_id,
  provider,
  provider_user_id,
  expires_at,
  last_used_at,
  scopes,
  scopes_string,
  account_email,
  token_type,
  created_at,
  updated_at
FROM public.oauth_accounts;

DROP VIEW IF EXISTS public.oauth_tokens_metadata;
CREATE VIEW public.oauth_tokens_metadata
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  id,
  user_id,
  provider,
  service_type,
  account_email,
  provider_account_id,
  token_expires_at,
  scope,
  created_at,
  updated_at
FROM public.oauth_tokens;

REVOKE ALL PRIVILEGES ON TABLE public.oauth_accounts_metadata
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.oauth_tokens_metadata
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.oauth_accounts_metadata TO authenticated;
GRANT SELECT ON TABLE public.oauth_tokens_metadata TO authenticated;

-- Bind legacy Gmail OAuth state to the authenticated initiator and consume it
-- exactly once. The dedicated Calendar state contract is preserved unchanged.
ALTER TABLE public.oauth_state
  ADD COLUMN IF NOT EXISTS oauth_account_id uuid
    REFERENCES public.oauth_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS requested_scope text;

DELETE FROM public.oauth_state
WHERE service IN ('email', 'gmail')
  AND (
    user_id IS NULL
    OR redirect_uri IS NULL
    OR requested_scope IS NULL
  );

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oauth_state_legacy_gmail_retired_check'
      AND conrelid = 'public.oauth_state'::regclass
  ) THEN
    ALTER TABLE public.oauth_state
      ADD CONSTRAINT oauth_state_legacy_gmail_retired_check
      CHECK (service IS DISTINCT FROM 'gmail');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oauth_state_email_origin_check'
      AND conrelid = 'public.oauth_state'::regclass
  ) THEN
    ALTER TABLE public.oauth_state
      ADD CONSTRAINT oauth_state_email_origin_check
      CHECK (
        service IS DISTINCT FROM 'email'
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
    WHERE conname = 'oauth_state_email_redirect_check'
      AND conrelid = 'public.oauth_state'::regclass
  ) THEN
    ALTER TABLE public.oauth_state
      ADD CONSTRAINT oauth_state_email_redirect_check
      CHECK (
        service IS DISTINCT FROM 'email'
        OR (
          user_id IS NOT NULL
          AND redirect_uri = origin || '/oauth-callback'
          AND requested_scope IS NOT NULL
          AND requested_scope <> ''
        )
      );
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION public.consume_google_oauth_state(
  p_state text,
  p_user_id uuid
)
RETURNS TABLE (
  code_verifier text,
  service text,
  origin text,
  redirect_uri text,
  oauth_account_id uuid,
  requested_scope text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  DELETE FROM public.oauth_state AS oauth_state_row
  WHERE oauth_state_row.state = p_state
    AND oauth_state_row.user_id = p_user_id
    AND oauth_state_row.service = 'email'
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
    AND oauth_state_row.requested_scope IS NOT NULL
  RETURNING
    oauth_state_row.code_verifier,
    oauth_state_row.service,
    oauth_state_row.origin,
    oauth_state_row.redirect_uri,
    oauth_state_row.oauth_account_id,
    oauth_state_row.requested_scope;
$function$;

REVOKE ALL ON FUNCTION public.consume_google_oauth_state(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_google_oauth_state(text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
