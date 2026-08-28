# Google Calendar OAuth activation

This cutover activates the dedicated, authenticated Google Calendar OAuth path.
It is complete only after the database, Edge functions, published frontend, and
a real same-user Google callback/sync/watch canary have matching receipts.

The grant is intentionally read-only:
`https://www.googleapis.com/auth/calendar.readonly`. Do not describe this
release as Calendar write or auto-write parity.

## Preconditions

- CI is green on the exact candidate SHA.
- Live preflight confirms no duplicate canonical provider identities, Calendar
  accounts, or `(calendar_account_id, external_event_id)` event identities.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
  `CALENDAR_WATCH_WEBHOOK_SECRET` are present in the target Supabase project.
- The Google OAuth client permits the exact redirect URI
  `https://bubble-whisper-stream.lovable.app/oauth-callback`.
- `OAUTH_ENCRYPTION_KEY` is provisioned as exactly 32 random bytes. Never write
  its value to source, receipts, or command output.
- A rollback owner and a bounded cutover window are named.

## Cutover

1. Record fresh counts for Calendar OAuth state, canonical tokens/accounts,
   events, and each uniqueness preflight in the migration.
2. Provision `OAUTH_ENCRYPTION_KEY`; verify only the secret name/digest.
3. Deploy the encrypted token consumers first:
   `calendar-sync` and `calendar-watch`.
4. Deploy the dormant dedicated producers:
   `calendar-oauth-start` and `calendar-oauth-callback`.
5. Apply only
   `supabase/migrations/20260828000001_harden_google_calendar_oauth.sql`.
   Do not use a broad database push when the remote migration ledger diverges.
6. Mark that exact migration version applied, regenerate linked Supabase types,
   inspect the generated diff, and rerun the release gates.
7. Merge and publish the exact frontend SHA.
8. Probe the deployed boundary before consent:
   unauthenticated requests fail, disallowed origins fail, user-bound state is
   single-use, browser roles cannot read canonical provider tokens, and only
   the service role can invoke the privileged state/cleanup RPCs.
9. As the signed-in canary user, choose **Add Calendar** and complete Google's
   account selection and read-only consent. Require all of these receipts:
   token-free callback response, encrypted canonical token envelope, one
   account row, completed bounded sync with a final sync token, active watch
   channel/resource IDs, and a future watch expiry.
10. Make a real Google Calendar change and verify the HMAC callback, exact
    account lookup, incremental sync, canonical event change, and success log.

## Rollback

- Prefer disabling **Add Calendar** and forward-fixing while retaining the
  migration, encryption key, and encrypted token consumers.
- Never redeploy a plaintext token consumer after encrypted rows exist.
- Never remove or rotate `OAUTH_ENCRYPTION_KEY` without first re-encrypting
  stored tokens under a deliberate rotation plan.
- If the migration duplicate preflight fails, let the transaction roll back,
  reconcile the duplicate rows explicitly, and rerun the exact file.
- If a canary watch was created, stop that Google channel before deleting the
  canary account.
- Do not restore browser token access, unbound OAuth state, or broad receipt
  insertion as a routine rollback.
