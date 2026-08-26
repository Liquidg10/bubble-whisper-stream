# Calendar watch HMAC activation

The calendar-watch hardening is not active merely because this code is merged.
Treat deployment as a staged migration: existing Google Calendar channels use
the legacy `token = channelId` contract and their callbacks will be rejected by
the new HMAC verifier until every active channel is replaced.

## Preconditions

- CI is green on the exact merge SHA.
- A strong `CALENDAR_WATCH_WEBHOOK_SECRET` is provisioned in Supabase Edge
  Function secrets. Do not store its value in this repository or command logs.
- The external scheduler can send the exact configured service-role bearer to
  `watch-renewal-cron` after JWT verification is enabled.
- A rollback owner and a bounded maintenance window are named.

## Staged activation

1. Apply `supabase/migrations/20260826000001_scope_calendar_watch_renewals.sql`.
2. Verify the RPC as `authenticated`, `anon`, and `service_role`: an
   authenticated user sees only owned rows, anon cannot execute, and the
   service role can enumerate expiring rows.
3. Deploy `calendar-sync`, `calendar-watch`, `watch-renewal-cron`, the shared
   helper, and `supabase/config.toml`. Do not call the rollout complete yet.
4. Confirm an unauthenticated control request is denied, a cross-user account ID
   is not found, an owned-account renewal succeeds, and the cron rejects every
   bearer except the exact service-role key.
5. In a protected operator shell, export `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`, then choose protected absolute paths for the
   manifest and receipt ledger. Dry-run writes a new mode-0600 manifest and
   refuses to overwrite an existing file:

   ```sh
   npm run calendar-watch:rotate -- \
     --manifest=/secure/operator/calendar-watch-manifest.json
   ```

   For a deliberately bounded subset, add one or more
   `--account=<account-id>` arguments to this dry-run only.
6. Review the manifest's target project, exact count, sorted account inventory,
   pre-rotation channel state, and SHA-256 digest against the database receipt.
   Execute that exact manifest and write the append-only JSONL ledger:

   ```sh
   npm run calendar-watch:rotate -- \
     --execute \
     --manifest=/secure/operator/calendar-watch-manifest.json \
     --receipts=/secure/operator/calendar-watch-receipts.jsonl
   ```

   Execute refuses target or account-inventory drift, missing exact counts,
   truncated result pages, more than 500 accounts, and any deployed contract
   other than `hmac-v1`. It processes three at a time and verifies that the
   handler-returned channel ID is the exact channel persisted in the database.
7. Reconcile every account in the manifest to a `status: "rotated"` receipt.
   Each receipt is appended and printed immediately when that account finishes.
   To resume after an ordinary partial failure or interruption, rerun the exact
   execute command with the same manifest and ledger: receipt-confirmed
   successes are skipped, while failed or unseen accounts are retried only when
   their pre-rotation state still matches the manifest. If a process dies in
   the narrow mutation-before-receipt window, the changed database state has no
   matching receipt and the tool fails closed; investigate and reconcile that
   account before creating a new manifest. Never add a permanent global-renew
   path to the browser or cron.
8. Send a real Google change through a rotated channel and verify callback HMAC,
   account lookup, incremental sync, and bounded-sync fallback telemetry.
9. Verify the ordinary expiring-only scheduler path, then deploy the client
   caller changes. Keep rollback available through the observation window.

Do not describe the exposure as closed until the migration, deployed function
versions, scheduler bearer, full channel rotation, and live callback path all
have reconciled receipts.
