# Generic OAuth credential hardening deployment

This cutover closes the legacy `oauth_accounts` / `oauth_tokens` browser
credential boundary and replaces the generic Google exchange with an
authenticated, owner-bound Gmail flow. It is deliberately a runbook only:
this change does not authorize or perform a production deployment.

The dedicated Calendar OAuth, sync, and watch contract remains canonical and
must pass its regression canary. Gmail Pub/Sub from commit `c73b896` expects the
same strict `oauth:v1` envelope and must not be activated until this hardening
migration is applied.

## Verified staging facts

The read-only production inventory on 2026-08-29 found:

- `oauth_accounts`: 0 rows and therefore 0 legacy credentials.
- `oauth_tokens`: 2 rows; every non-null access and refresh credential had an
  `oauth:v1` envelope prefix.
- `authenticated` still had table-level `SELECT`, `INSERT`, `UPDATE`, and
  `DELETE` privileges on both credential-bearing tables. RLS reduced the blast
  radius but did not make provider-token columns an acceptable browser API.

These facts are a snapshot, not a deployment waiver. Repeat every aggregate
preflight in the cutover window and stop if it differs.

## Preconditions

- CI is green on the exact integrated candidate SHA, including the Gmail
  Pub/Sub commit and this hardening commit.
- A rollback owner and a bounded cutover window are named.
- The live Calendar flow proves that the existing `OAUTH_ENCRYPTION_KEY` can
  decrypt current canonical tokens. Do not print, replace, or rotate that key.
- `OAUTH_ENCRYPTION_KEY` decodes to exactly 32 bytes in every function runtime.
  A missing or invalid value must remain a hard failure.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present in the target
  Supabase project.
- The Google OAuth client permits exactly
  `https://bubble-whisper-stream.lovable.app/oauth-callback` for production.
- Any in-flight legacy Gmail OAuth state is allowed to expire or is explicitly
  abandoned. The migration intentionally deletes unsafe legacy email state.

Run these aggregate-only preflights without selecting credential values:

```sql
select
  count(*) as account_rows,
  count(*) filter (
    where access_token is not null
      and access_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
  ) as invalid_access_envelopes,
  count(*) filter (
    where refresh_token is not null
      and refresh_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
  ) as invalid_refresh_envelopes
from public.oauth_accounts;

select
  count(*) as token_rows,
  count(*) filter (
    where access_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
  ) as invalid_access_envelopes,
  count(*) filter (
    where refresh_token is not null
      and refresh_token !~ '^oauth:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{23,}$'
  ) as invalid_refresh_envelopes
from public.oauth_tokens;

select user_id, provider, provider_user_id, count(*)
from public.oauth_accounts
group by user_id, provider, provider_user_id
having count(*) > 1;
```

Every invalid-envelope count and duplicate query must be zero. If not, stop:
reauthorize or deliberately re-encrypt each affected account through reviewed
server code. Never prefix plaintext to make the migration pass.

## Exact cutover order

Keep the database/function interval short. The strict producers are deployed
first so no old code can create users or plaintext credentials during the
schema cutover; they fail closed until their new state RPC exists.

1. Record the candidate SHA, function versions, migration ledger, aggregate
   preflights above, and current Calendar canary receipt.
2. Deploy these functions from the integrated candidate, in this order:
   `oauth-google` (410 tombstone), `oauth-scope-decay` (410 tombstone),
   `oauth-google-start`, `oauth-google-callback`, `oauth-google-refresh`,
   `oauth-google-revoke`, `gmail-sync`, then `gmail-compose`.
3. Apply only the Gmail Pub/Sub schema migration
   `supabase/migrations/20260829000002_gmail_pubsub_watch.sql` from `c73b896`.
4. Apply only
   `supabase/migrations/20260829000003_harden_generic_oauth_credentials.sql`
   with `ON_ERROR_STOP`; record that exact version in the remote migration
   ledger. Do not use a broad database push when the remote ledger diverges.
5. Re-run the privilege and envelope probes below before exposing a new client.
6. Deploy `gmail-watch` from the integrated Gmail Pub/Sub candidate, then
   configure its verified Google Pub/Sub push path and renewal schedule using
   the Gmail Pub/Sub deployment runbook.
7. Publish the exact integrated frontend SHA. Do not publish an older client
   that expects token columns, popup exchange, or client-side encryption.
8. Run the signed-in Gmail, Calendar, and Pub/Sub canaries. Keep the feature
   unavailable if any receipt is missing.
9. After the observation window shows no calls to `oauth-google`, remove its
   tombstone in a later release. Do the same for `oauth-scope-decay`; never
   restore either implementation.

Every deployed function listed above must have the intended JWT gateway
setting. `oauth-google`, both tombstones, the start/callback/refresh/revoke
functions, `gmail-sync`, and `gmail-compose` use `verify_jwt = true`.
Google push handlers use their documented provider-authenticated exception,
not a browser-accessible service-role bypass.

## Boundary canaries

Immediately after the migration, these privilege results are required:

```sql
select
  has_table_privilege('authenticated', 'public.oauth_accounts', 'select') as accounts_table_select,
  has_table_privilege('authenticated', 'public.oauth_accounts', 'insert') as accounts_table_insert,
  has_table_privilege('authenticated', 'public.oauth_accounts', 'update') as accounts_table_update,
  has_table_privilege('authenticated', 'public.oauth_accounts', 'delete') as accounts_table_delete,
  has_column_privilege('authenticated', 'public.oauth_accounts', 'access_token', 'select') as accounts_access_token_select,
  has_column_privilege('authenticated', 'public.oauth_accounts', 'refresh_token', 'select') as accounts_refresh_token_select,
  has_column_privilege('authenticated', 'public.oauth_accounts', 'account_email', 'select') as accounts_metadata_select,
  has_table_privilege('authenticated', 'public.oauth_accounts_metadata', 'select') as accounts_view_select,
  has_table_privilege('anon', 'public.oauth_accounts_metadata', 'select') as anon_accounts_view_select,
  has_table_privilege('authenticated', 'public.oauth_state', 'select') as oauth_state_select,
  has_table_privilege('authenticated', 'public.oauth_state', 'insert') as oauth_state_insert;

select
  has_table_privilege('authenticated', 'public.oauth_tokens', 'select') as tokens_table_select,
  has_table_privilege('authenticated', 'public.oauth_tokens', 'insert') as tokens_table_insert,
  has_table_privilege('authenticated', 'public.oauth_tokens', 'update') as tokens_table_update,
  has_table_privilege('authenticated', 'public.oauth_tokens', 'delete') as tokens_table_delete,
  has_column_privilege('authenticated', 'public.oauth_tokens', 'access_token', 'select') as tokens_access_token_select,
  has_column_privilege('authenticated', 'public.oauth_tokens', 'refresh_token', 'select') as tokens_refresh_token_select,
  has_column_privilege('authenticated', 'public.oauth_tokens', 'account_email', 'select') as tokens_metadata_select,
  has_table_privilege('authenticated', 'public.oauth_tokens_metadata', 'select') as tokens_view_select,
  has_table_privilege('anon', 'public.oauth_tokens_metadata', 'select') as anon_tokens_view_select;
```

Required values: all base-table operations, both credential-column reads, and
both anonymous view reads are `false`; both OAuth state privileges are also
`false`; authenticated metadata-column and view reads are `true`. Then repeat
the aggregate envelope queries and require zero invalid rows.

Run these behavior canaries with a dedicated signed-in test owner:

1. Unauthenticated calls fail at the gateway. An authenticated disallowed
   origin fails. A different user's `account_id` returns a non-enumerating 404
   and changes no row.
2. Start Gmail consent from Settings and return in the same tab. Confirm the
   URL is scrubbed before exchange, state is single-use and bound to the same
   user/origin, and the browser response contains metadata only. Inspect the
   network response for both snake_case and camelCase token property names.
3. Confirm the new `oauth_accounts` access and refresh values match the strict
   envelope shape without selecting or logging their contents.
4. Exercise a server refresh with `account_id` only. Require an encrypted row
   update and a token-free `{accountId, expiresAt}` receipt.
5. Exercise Gmail metadata search, a safe message detail read, and—only with
   action-time owner confirmation—a disposable draft. Confirm each function
   resolves ownership server-side and never returns credentials.
6. Activate Gmail watch, deliver a real Google Pub/Sub notification, and
   require claimed/completed receipt plus bounded history processing. No
   plaintext fallback is an acceptable recovery path.
7. Re-run the dedicated Calendar same-tab callback, bounded sync, and active
   watch receipt. Make a real Calendar change and verify incremental delivery.
8. Only with action-time owner confirmation, revoke the dedicated Gmail canary.
   Require provider-terminal status and deletion of that owner's local row.

## Rollback and stop rules

- Prefer hiding Gmail connect/compose/watch and forward-fixing while keeping
  the credential migration, strict key, and encrypted consumers in place.
- Never re-grant browser access to either base table or either token column.
- Never redeploy the retired exchange, unauthenticated scope-decay job,
  client-side token crypto, a default key, or a plaintext compatibility path.
- After the migration, a function rollback is allowed only to a version that
  already uses strict `oauth:v1` decryption and authenticated owner-bound
  `account_id` lookup.
- If a migration preflight raises, let the transaction roll back, reconcile the
  reported rows explicitly, and rerun the exact file. Do not weaken the check.
- Do not remove or rotate `OAUTH_ENCRYPTION_KEY` without a separate,
  receipt-backed re-encryption plan for both token stores.
- If Google Pub/Sub fails, disable watch activation and retain polling/manual
  sync; do not bypass provider verification or widen JWT/CORS rules.
