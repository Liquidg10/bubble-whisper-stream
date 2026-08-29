-- Durable, per-user idempotency receipts for Gmail mutations.
--
-- The gmail-compose Edge Function writes a pending receipt before the first
-- Gmail POST. A reused key can only replay the stored result (or fail closed
-- while pending); it can never start a second provider mutation.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oauth_accounts_id_user_unique'
      AND conrelid = 'public.oauth_accounts'::regclass
  ) THEN
    ALTER TABLE public.oauth_accounts
      ADD CONSTRAINT oauth_accounts_id_user_unique UNIQUE (id, user_id);
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.gmail_compose_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  request_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_artifact_id text,
  response_body jsonb,
  last_error_code text,
  last_error_message text,
  provider_call_started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT gmail_compose_receipts_account_owner_fkey
    FOREIGN KEY (account_id, user_id)
    REFERENCES public.oauth_accounts(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT gmail_compose_receipts_user_key_unique
    UNIQUE (user_id, idempotency_key),
  CONSTRAINT gmail_compose_receipts_key_shape_check
    CHECK (
      char_length(idempotency_key) BETWEEN 16 AND 200
      AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  CONSTRAINT gmail_compose_receipts_operation_check
    CHECK (operation IN ('create_draft', 'send', 'send_draft')),
  CONSTRAINT gmail_compose_receipts_hash_check
    CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT gmail_compose_receipts_status_check
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT gmail_compose_receipts_completion_check
    CHECK (
      (status = 'pending' AND completed_at IS NULL)
      OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_gmail_compose_receipts_user_created
  ON public.gmail_compose_receipts (user_id, created_at DESC);

ALTER TABLE public.gmail_compose_receipts ENABLE ROW LEVEL SECURITY;

-- Receipts contain provider identifiers and are intentionally server-only.
-- The service-role Edge Function still binds every read/write to the verified
-- JWT user and an OAuth account owned by that user.
REVOKE ALL ON TABLE public.gmail_compose_receipts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gmail_compose_receipts
  TO service_role;
