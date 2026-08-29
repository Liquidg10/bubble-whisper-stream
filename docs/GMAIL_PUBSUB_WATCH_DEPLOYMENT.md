# Gmail Pub/Sub watch deployment

This release replaces the invalid direct Gmail webhook/channel model with the
documented Gmail API → Google Cloud Pub/Sub → authenticated push endpoint flow.
It is deliberately not self-deploying: database, Edge, Google Cloud IAM, and a
real mailbox canary must be applied and verified in this order.

## Runtime contract

- Edge endpoint: `${SUPABASE_URL}/functions/v1/gmail-watch`
- Edge gateway: `verify_jwt = false` so Google can reach it. The handler itself
  verifies Google's RS256 signature, issuer, expiry, exact audience, exact push
  service-account email, exact subscription name, and mailbox ownership before
  any database/provider action.
- User controls: the same endpoint accepts only `start`, `renew`, or `stop` for
  one UUID `oauth_accounts.id`, authenticated by that user's Supabase JWT.
- Scheduler controls: an exact service-role bearer may renew one UUID at a time.
- Gmail cursor: the first `users.watch` response seeds `history_id`; renewal
  preserves it. Authenticated pushes call paginated `users.history.list`, store
  metadata-only change events, and advance the cursor monotonically.
- Gap safety: a Gmail 404 or the bounded 10,000-record ingestion ceiling marks
  the mailbox `resync_required`. `start` and `renew` then fail closed instead of
  silently replacing the cursor and losing the unseen interval. Complete a
  full mailbox resync, transition the row to `inactive`, and only then `start`.
- Replay: `(subscription_name, pubsub_message_id)` is unique. A five-minute
  lease prevents parallel provider reads; terminal duplicates are acknowledged
  without calling Gmail again.

## Required Edge secrets

Set these with the normal secret manager; never put values in source or logs.

| Name | Required value |
| --- | --- |
| `GMAIL_PUBSUB_TOPIC` | Fully qualified topic, for example `projects/mind-manual/topics/gmail-notifications` |
| `GMAIL_PUBSUB_SUBSCRIPTION` | Fully qualified push subscription |
| `GMAIL_PUBSUB_PUSH_AUDIENCE` | Exact audience configured on the push subscription; use the exact Edge endpoint URL |
| `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT` | Exact user-managed service-account email used by the push subscription |
| `GOOGLE_CLOUD_PROJECT_ID` | Google developer project that executes `users.watch`; it must match the topic project |

The existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `OAUTH_ENCRYPTION_KEY` remain required. Deploy the
OAuth token hardening migration before this function: Gmail provider calls
accept only authenticated `oauth:v1` AES-GCM envelopes and fail closed on
plaintext, an invalid envelope, or a missing/wrong key. Tokens are never logged.

## Google Cloud prerequisites

1. Create the Pub/Sub topic in the same Google developer project as the Gmail
   OAuth client.
2. Grant `roles/pubsub.publisher` on that topic to
   `gmail-api-push@system.gserviceaccount.com`.
3. Create a dedicated user-managed push-auth service account. Do not reuse an
   owner/editor identity.
4. Grant the Pub/Sub service agent
   `service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com`
   `roles/iam.serviceAccountTokenCreator` on the push-auth service account.
5. Create one push subscription targeting the exact Edge endpoint. Enable OIDC
   authentication with the dedicated service account and set the audience to
   the exact value stored in `GMAIL_PUBSUB_PUSH_AUDIENCE`.
6. Configure bounded retry/dead-letter retention appropriate for the project.
   A non-2xx response is intentionally retried; an expired Gmail history cursor
   is durably marked `resync_required` and acknowledged because replay cannot
   repair the gap.

Representative commands (fill variables from the authenticated project):

```sh
gcloud pubsub topics create "$TOPIC_ID" --project "$PROJECT_ID"
gcloud pubsub topics add-iam-policy-binding "$TOPIC_ID" \
  --project "$PROJECT_ID" \
  --member serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role roles/pubsub.publisher

gcloud pubsub subscriptions create "$SUBSCRIPTION_ID" \
  --project "$PROJECT_ID" \
  --topic "$TOPIC_ID" \
  --push-endpoint "$PUSH_ENDPOINT" \
  --push-auth-service-account "$PUSH_SERVICE_ACCOUNT" \
  --push-auth-token-audience "$PUSH_AUDIENCE"
```

## Release order and receipts

1. Apply `20260829000002_gmail_pubsub_watch.sql`, verify its three tables and
   two service-role-only RPCs, then apply
   `20260829000003_harden_generic_oauth_credentials.sql`. Use that ascending,
   exact-file order so the divergent remote migration ledger stays coherent;
   do not deploy `gmail-watch` until both migrations, their RLS, grants, and
   constraints are verified.
2. Set the five new Edge secrets and verify the existing OAuth secrets.
3. Deploy `gmail-watch` with the checked-in `verify_jwt = false` configuration.
4. Create/verify the Google topic IAM and authenticated push subscription.
5. Confirm an unsigned POST and a wrong-audience signed POST are rejected before
   any receipt is created.
6. Call `start` with one owner-authenticated Gmail-capable OAuth account. Verify
   active state, future expiry, generation 1, and the `watch_start` sync log.
7. Produce one reversible, owner-approved mailbox change. Verify exactly one
   terminal push receipt, history events, a monotonic cursor, and a successful
   `pubsub_history` sync log. Redeliver the same Pub/Sub message and verify no
   new events/provider read.
   Also inject a non-production expired-cursor fixture: verify the row becomes
   `resync_required`, the poison delivery is acknowledged, and both `start` and
   `renew` return `GMAIL_FULL_RESYNC_REQUIRED` until the full resync is recorded.
8. Run the protected renewal job once. Verify the generation and expiry advance
   while `history_id` does not reset.
9. Call `stop`; verify Gmail accepts the empty-body `users.stop` request and the
   watch becomes inactive. Start it again only if monitoring should remain on.

## Rollback

Disable push delivery at the Pub/Sub subscription first, call `stop` for each
active mailbox, then roll back the Edge function. Keep the tables and receipts
for audit/recovery; dropping them would destroy cursor and replay evidence.

## Official contracts

- Gmail push setup and renewal: https://developers.google.com/workspace/gmail/api/guides/push
- Gmail `users.watch`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
- Gmail `users.history.list`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
- Authenticated Pub/Sub push: https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions
