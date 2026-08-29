# Isolated Supabase project cutover

The current `Marks Mental Manual` project also contains commerce objects. The
isolated target must be built from an allowlist, never from an all-schema dump.

## Allowed Mind Manual surface

- 29 public tables and the `plaid_items_safe` view listed in
  `supabase/isolation/mind-manual-tables.txt`
- the reviewed public functions listed in
  `supabase/isolation/mind-manual-functions.txt`
- the private `photos` and `voice-samples` buckets and their owner-scoped
  policies
- Auth user bootstrap trigger `on_auth_user_created`
- current Edge Functions and their explicit JWT settings

The export excludes `tenants`, `user_tenants`, `bookings`, `orders`,
`gift_cards`, `gift_card_transactions`, `financial_audit_log`, and all
tenant/commerce helper functions.

## Cutover gates

1. Deploy and verify the combined candidate on the source project.
2. Run exact row counts and a storage inventory. Stop if any durable Mind
   Manual table contains user data that has not been explicitly migrated;
   transient OAuth state is not copied. For each private bucket, record object
   count, total bytes, and a stable path/metadata checksum. A non-empty bucket
   requires an explicit object copy plus post-copy checksum and signed-URL/path
   revalidation before URL/key cutover.
3. Generate the baseline with `scripts/export-isolated-supabase-schema.sh`.
4. Provision the target in organization `aikkzqkxlykvcgvblawu`, region
   `us-east-1`, with a generated database password stored outside Git.
5. Apply the baseline and verify table, policy, function, grant, bucket, and
   Auth-config parity.
6. Copy Edge Function secret values through the provider secret stores without
   printing them. Deploy functions with their declared JWT settings.
7. Add the new OAuth callback URLs in Google Cloud before changing the app.
8. Change only the app's Supabase URL/publishable key, publish, and run signed-in
   Calendar/Gmail/Plaid/sync smoke checks.
9. Keep the former project unchanged until the rollback window closes. Rollback
   is the prior URL/publishable-key pair; secrets are never part of the receipt.

The 2026-08-29 source inventory found three `photos` objects (603,067 bytes)
and zero `voice-samples` objects. The photo objects therefore belong to the
cutover payload; a schema-only snapshot is insufficient.

## Non-goals

- Commerce data is never copied.
- Historical migration rows are never forged.
- Auth users are not silently cloned. If the exact pre-cutover count is nonzero,
  account migration becomes a separately receipted operation.
