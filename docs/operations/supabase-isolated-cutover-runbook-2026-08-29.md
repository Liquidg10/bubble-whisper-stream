# Mind Manual isolated Supabase cutover runbook

Status: tooling complete; source remains authoritative; no target has been
provisioned and no data has been copied by this work.

This is the fail-closed path for extracting Mind Manual from the shared
`Marks Mental Manual` Supabase project. It copies only the reviewed Mind Manual
surface. Commerce relations are never an input, staging area, or rollback
dependency.

## Current read-only source receipt

The 2026-08-29 source probe found:

- one Auth user and one email identity;
- seven Auth sessions and 93 refresh tokens, all deliberately excluded so the
  new project forces a fresh sign-in;
- two Calendar accounts, 40 Calendar events, two conversation threads, two
  OAuth-token rows, one profile, and five sync logs;
- four transient `oauth_state` rows, deliberately excluded;
- three `photos` objects totaling 603,067 bytes and no `voice-samples`
  objects; all three legacy photos are flat paths with no `owner_id` metadata,
  so the target copy deterministically prefixes the sole migrated Auth subject
  and verifies the remapped private path;
- no Plaid items or Plaid user data requiring a Vault-secret migration.

That snapshot is not a cutover authorization. Re-run it after the combined
source release and immediately before the write freeze.

The current source intentionally fails the new preflight until the Gmail
Pub/Sub source release is deployed. The expected blockers are the three Gmail
relations, two Gmail RPCs, five Pub/Sub configuration names, the undeployed
`oauth-google-revoke` function, and the live `gmail-watch` `verify_jwt` value.
Any different blocker needs investigation.

## Canonical allowlists

- `supabase/isolation/mind-manual-tables.txt`: 32 physical tables plus
  `plaid_items_safe`.
- `supabase/isolation/mind-manual-functions.txt`: 13 reviewed public
  functions. Every name must resolve exactly once.
- `supabase/isolation/mind-manual-data-scopes.tsv`: one explicit owner column
  and copy/discard decision for every physical table.
- `supabase/isolation/mind-manual-buckets.txt`: `photos` and `voice-samples`.
- `supabase/isolation/mind-manual-secrets.txt`: names only; values never enter
  a receipt.
- `supabase/isolation/mind-manual-edge-functions.tsv`: every function directory
  and its exact `verify_jwt` value. Only `calendar-watch` and `gmail-watch` are
  gateway-JWT-off; each verifies its provider callback in-handler.
- `supabase/isolation/mind-manual-external-bindings.tsv`: every callback,
  audience, and public app setting that changes with the project ref.
- `supabase/isolation/target-cutover-canary.example.json`: the exact fresh
  signed-in/provider evidence envelope required before a cutover token exists.

The target preflight rejects every public relation outside the allowlist. It
also rejects every public routine, Edge Function, and user-managed secret name
outside its allowlist, and explicitly rejects `tenants`, `user_tenants`,
`bookings`, `orders`, `gift_cards`, `gift_card_transactions`, and
`financial_audit_log`.

## What each tool proves

`scripts/supabase-isolation-preflight.mjs`

- requires the CLI-linked project ref to equal the named source or target;
- fingerprints columns, constraints, indexes, RLS policies, triggers, grants,
  view definitions, and function definitions;
- records exact owner-scoped row counts and SHA-256 content digests without
  emitting row values;
- records Auth subject/user/identity digests without emitting IDs, email, or
  password hashes;
- records bucket count, bytes, path digest, and metadata digest without
  emitting object paths;
- lists only secret names/presence, never values;
- verifies every deployed Edge Function is active with the expected JWT mode;
- can compare a target receipt to a ready source receipt.

`scripts/export-isolated-supabase-schema.sh`

- exports only allowlisted public relations and reviewed functions;
- aborts on a missing or overloaded manifest entry;
- appends reviewed Auth trigger, grants, Plaid boundary, and private-bucket
  hardening;
- never exports commerce.

`scripts/export-isolated-supabase-data.mjs`

- requires a ready source receipt, a fresh owner Auth decision, and a
  write-freeze confirmation no older than 30 minutes;
- re-runs source preflight before export;
- writes outside the repository to a mode-0700 directory;
- creates mode-0600 binary COPY files in one repeatable-read transaction;
- copies `auth.users` and `auth.identities`, but not sessions or refresh tokens;
- copies only rows owned by a migrated Auth subject;
- emits an empty binary payload for transient `oauth_state`;
- refuses MFA, SSO, non-default Auth instance state, Plaid Vault state, or any
  non-owned durable row without a new reviewed disposition.

`scripts/import-isolated-supabase-data.mjs`

- dry-runs by default;
- verifies every package file and target schema/Auth column fingerprint;
- requires every allowlisted Auth/public binary exactly once and binds each
  count/content digest to the fresh source receipt;
- requires an empty, non-commerce target;
- requires an exact `IMPORT:<target-ref>:<manifest-prefix>` execution token;
- uses the CLI temporary login for dry-run reads and requires the target-only
  `MIND_MANUAL_TARGET_DB_PASSWORD` direct-admin override only for execution;
- imports in one transaction with triggers suppressed, then independently
  verifies public/Auth row parity;
- leaves the target blocked until storage and provider state are reconciled.

`scripts/copy-isolated-supabase-storage.mjs`

- accepts source and target service-role keys only through environment
  injection;
- lists recursively, downloads, and SHA-256 hashes each source object;
- stores only path hashes in its receipt;
- never overwrites a target object; an existing object must match exactly;
- remaps only the known one-user legacy flat photo shape to
  `<auth-subject>/<old-name>` and rejects every ambiguous path;
- supports safe resume after a partial copy;
- downloads the target copy, compares content, and proves a private signed URL
  can read the exact path;
- requires an exact `COPY_STORAGE:<target-ref>:<plan-prefix>` token to write;
- writes a separate content-bound plan receipt; execution is authorized by the
  plan receipt hash and writes a different verified receipt path;
- supports a no-write `--verify-only` action-time pass that re-downloads both
  sides, rechecks signed URLs, and compares the bucket/path/content manifest to
  the verified copy receipt.

`scripts/quarantine-isolated-supabase-provider-state.mjs`

- refuses the source project ref;
- requires the verified import and OAuth-reset receipts and binds their hashes;
- clears source-bound Calendar/Gmail watch state and disables generic webhook
  state on the target only;
- requires an exact `QUARANTINE:<target-ref>:<oauth-reset-prefix>` token;
- requires the target-only `MIND_MANUAL_TARGET_DB_PASSWORD` direct-admin
  override only after that token is presented;
- records before/after counts, then blocks provider deployment unless all
  source-bound state is inactive.

`scripts/reset-isolated-supabase-oauth-credentials.mjs`

- refuses the source project ref and requires a newly generated target-only
  `OAUTH_ENCRYPTION_KEY` plus an explicit fresh-key operator assertion;
- binds every relevant target count and row digest to the ready source and
  verified import receipts before changing anything;
- preserves Auth subjects, OAuth/Calendar row IDs, account metadata, and every
  Calendar event while replacing the inaccessible copied credentials with a
  strict target-key tombstone, clearing refresh credentials, expiring access,
  and disabling sync/watch state;
- requires an exact `RESET-OAUTH:<target-ref>:<contract-prefix>` token;
- requires the target-only `MIND_MANUAL_TARGET_DB_PASSWORD` direct-admin
  override only after that token is presented;
- writes an aggregate/hash-only private receipt with no secret or row ID;
- makes the token one-use in practice because a completed reset no longer
  matches the imported source-row digests.

`scripts/prepare-isolated-supabase-rollback-receipt.mjs`

- accepts only a ready source, verified import, verified storage copy, verified
  OAuth reset, and verified quarantine receipt;
- verifies the source/import/storage/OAuth-reset/quarantine hash chain and a
  target canary envelope no older than two hours;
- requires operator confirmation that the prior public URL/key pair is stored
  outside Git;
- records only hashes and boolean readiness, never key or secret values;
- emits the exact final `CUTOVER:<target-ref>:<rollback-prefix>` confirmation.

## Auth identity decision

Use
`supabase/isolation/auth-migration-decision.example.json` as the review
envelope. The supported decision is
`preserve_users_and_identities_force_reauthentication`:

1. preserve the exact Auth subject UUID, password hash, and email identity;
2. do not copy `auth.sessions` or `auth.refresh_tokens`;
3. use the target project's own JWT secret and force a fresh sign-in;
4. import public profile/data rows only after Auth table column fingerprints
   match exactly.

Supabase documents that the Auth schema, including password hashes, can be
migrated, and that a different target JWT secret invalidates existing tokens:
<https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects>.
Supabase also warns that Auth-managed columns can change, which is why the
toolkit refuses a binary copy unless the exact source/target layouts match:
<https://supabase.com/docs/guides/auth/managing-user-data>.

This toolkit deliberately does not pretend there is a universal Auth migration
script. A newly detected OAuth identity, MFA factor, SSO provider, anonymous
user, or second user stops the run for a new decision.

## Order of implementation and execution

### 1. Make the source canonical

Merge and deploy the combined Mind Manual candidate to the existing project.
Apply only reviewed append-only SQL because the source migration ledger is
divergent; do not run a blanket `supabase db push` or mass repair. Deploy the
new Gmail watch with `verify_jwt=false`, configure the five Pub/Sub settings,
and verify the Google OIDC push boundary before proceeding.

### 2. Produce the ready source receipt

Link this clean worktree to the source, then run:

```sh
node scripts/supabase-isolation-preflight.mjs \
  --kind source \
  --project-ref ekekeywoxvdbfbmqyhjy \
  --receipt /absolute/private/path/source-preflight.json
```

The command must say `ready` with zero blockers. Review nonzero table counts,
Auth counts, storage count/bytes, secret presence, and Edge JWT modes. The
receipt is sensitive operational evidence and must remain mode 0600 outside
Git.

### 3. Provisioning confirmation gate

Stop immediately before pressing Supabase **Create project** or issuing the
Management API project-create request. Present one envelope containing:

- organization `aikkzqkxlykvcgvblawu`;
- region `us-east-1`;
- final project name;
- the displayed recurring cost/plan;
- confirmation that the generated database password destination is an
  operator secret store, not terminal output or Git.

Provision only after the owner confirms that exact envelope at action time.
Creating the project is the first paid/external mutation; broad implementation
approval does not substitute for this receipt.

### 4. Build the target schema

Generate the baseline only after source preflight is ready:

```sh
scripts/export-isolated-supabase-schema.sh \
  /absolute/private/path/mind-manual-baseline.sql
```

Relink to the target, apply that one baseline, then configure Auth:

- production Site URL and the existing app redirect allowlist used by password
  and email recovery flows;
- keep the Supabase Google Auth provider disabled; do not add
  `https://{PROJECT_REF}.supabase.co/auth/v1/callback` to Google Cloud;
- leaked-password protection enabled;
- email OTP expiry 3600 seconds;
- no source JWT reuse; users will sign in again.

Run target preflight without comparison first. Any unexpected public relation
or commerce object is a destroy-and-reprovision condition, not a repair target.

### 5. Transfer secrets without disclosure

The source API exposes secret names/hashes, not recoverable plaintext. Copy or
rotate each user-managed value through its provider/operator secret store.
Never paste it into a receipt.

`OAUTH_ENCRYPTION_KEY` is special: copied OAuth-token rows remain decryptable
only if the exact existing value reaches the target. If that value cannot be
recovered safely, generate a new target-only key and use the receipt-backed
credential-reset phase after the exact import. Never substitute a fallback key,
delete the copied token rows, or weaken the importer: deleting these rows would
cascade into Calendar accounts and cached events. The reset deliberately
expires/tombstones credentials in place and requires Google reauthorization.
Generate exactly 32 random bytes and store them as one encoded string:
`base64url:` followed by 43 unpadded base64url characters (or a correctly
padded `base64:` form). A raw 44-character output from `openssl rand -base64
32` is not a 32-byte raw key and will be rejected unless it carries the
`base64:` prefix. Provision and inject the same encoded string without echoing
it.

Configure the five Gmail values introduced by the Pub/Sub implementation:

- `GMAIL_PUBSUB_TOPIC`;
- `GMAIL_PUBSUB_SUBSCRIPTION`;
- `GMAIL_PUBSUB_PUSH_AUDIENCE`;
- `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT`;
- `GOOGLE_CLOUD_PROJECT_ID`.

Deploy all functions with the JWT modes in the manifest. Do not start schedulers
or move provider callbacks yet.

### 6. Freeze and package identity/data

Enter the short write freeze, prepare the owner Auth decision from the ready
source receipt, and run the exporter. The output directory must not exist and
must be outside the repository:

```sh
node scripts/export-isolated-supabase-data.mjs \
  --source-receipt /absolute/private/path/source-preflight.json \
  --auth-decision /absolute/private/path/auth-decision.json \
  --output-dir /absolute/private/path/mind-manual-data-package
```

The package contains password hashes, identity data, and encrypted OAuth
credentials. Treat the entire directory as a secret. Do not attach it to chat,
commit it, or put it in a general cloud-sync folder.

Relink to the target and dry-run the importer. It prints the exact confirmation
token but does not write:

```sh
node scripts/import-isolated-supabase-data.mjs \
  --package-dir /absolute/private/path/mind-manual-data-package \
  --auth-decision /absolute/private/path/auth-decision.json \
  --target-ref TARGET_REF
```

Run again with `--execute --confirmation ...` only inside the approved cutover
window. The new target's Supabase CLI temporary login is read-only; prefix the
execution command (not the dry-run) with the target-only direct database
password from the operator store:

```sh
MIND_MANUAL_TARGET_DB_PASSWORD="$MIND_MANUAL_TARGET_DB_PASSWORD_FROM_STORE" \
node scripts/import-isolated-supabase-data.mjs \
  --package-dir /absolute/private/path/mind-manual-data-package \
  --auth-decision /absolute/private/path/auth-decision.json \
  --target-ref TARGET_REF \
  --execute --confirmation 'IMPORT:TARGET_REF:RECEIPTED_PREFIX'
```

The tooling removes the override from its inherited environment before any
read-only child process and passes it only as `PGPASSWORD` to the confirmed
direct-admin write. It never prints the password.

### 6a. Reset inaccessible OAuth credentials on the target

If the exact source `OAUTH_ENCRYPTION_KEY` was not recovered from an approved
operator store, keep the exact copied rows long enough to obtain the import
parity receipt, then reset them in place before any target callback, scheduler,
sync, or watch is activated. Generate a fresh 32-byte target-only key, store it
in the operator secret store, provision that same value on the target, and
inject it into this protected shell without echoing it.

Dry-run against the ready source receipt that was packaged by the exporter and
the verified import receipt:

```sh
MIND_MANUAL_TARGET_OAUTH_KEY_IS_FRESH=yes \
OAUTH_ENCRYPTION_KEY="$MIND_MANUAL_TARGET_OAUTH_ENCRYPTION_KEY" \
npm run supabase-oauth:reset -- \
  --source-receipt /absolute/private/path/mind-manual-data-package/source-preflight.json \
  --import-receipt /absolute/private/path/mind-manual-data-package/import-receipt.json \
  --target-ref TARGET_REF \
  --receipt /absolute/private/path/oauth-reset-receipt.json
```

The dry-run performs read-only target inventory and prints the only valid
`RESET-OAUTH:<target-ref>:<contract-prefix>` token. Execute with that exact
token and inject `MIND_MANUAL_TARGET_DB_PASSWORD` only on the executing run.
A SHA-256 fingerprint of the fresh target key is part of the confirmation
contract, so a token prepared with one key cannot authorize a reset using a
different key. The fingerprint is not the key and the key value is never
written or printed.
A successful receipt must preserve the OAuth identity metadata digest,
Calendar account metadata digest, and full Calendar event digest; it must show
all copied refresh credentials null, all access credentials expired behind a
strict target-key `oauth:v1` tombstone, and every Calendar sync/watch state
disabled. It records no secret, token value, email, provider ID, or row ID.

This reviewed mode currently requires zero generic OAuth, email/Gmail, and
Plaid state. The fresh source receipt supplies the expected counts and hashes;
the implementation does not silently rely on the historical 2-token,
2-account, 40-event snapshot. Any new provider state stops for a separate
disposition.

Execution holds one machine-global mode-0600 lock for the target from the
pre-mutation inventory through final receipt persistence, while the SQL holds
transactional table locks. It first writes and fsyncs a mode-0600,
aggregate/hash-only prepared intent. If the process is interrupted before the
final receipt is written, rerun the same
command with `--recover` (and without `--execute`) to classify the target as
the exact pre-reset or post-reset state and print the same confirmation token.
Then add `--execute --confirmation ...`: pre-reset recovery completes the
locked transaction, while post-reset recovery only verifies and finalizes the
receipt. The target-key tombstone is reproducible for this one contract, so
recovery never stores or prints its ciphertext.

A process crash can leave the target lock behind. The tool reports the exact
lock path; verify that no reset or recovery is running and inspect that one
mode-0600 lock before removing only that stale file. Never remove locks by glob
or clear the system temporary directory.

### 7. Copy and verify private storage

Supabase documents that storage object metadata and file bytes are separate and
must both be migrated:
<https://supabase.com/docs/guides/storage/management/download-objects>.
Its database-clone flow likewise does not copy storage objects, Edge Functions,
Auth settings, or API keys:
<https://supabase.com/docs/guides/platform/clone-project>.

Inject both service-role keys without echoing, run the storage tool without
`--execute`, and write `/absolute/private/path/storage-plan.json`. Review its
count/bytes/content digest, then run the printed exact confirmation with
`--plan-receipt` pointing to that plan and `--receipt` pointing to a different
`storage-receipt.json`. The execution re-downloads source bytes and refuses to
upload if bucket/path/content differs from the reviewed plan. A successful
receipt must say `verified`, include three objects and 603,067 bytes if the
source has not changed, report three remapped paths, and show signed-URL
verification for every object.

Immediately before Gate B, run a separate no-write revalidation:

```sh
node scripts/copy-isolated-supabase-storage.mjs \
  --source-receipt /absolute/private/path/mind-manual-data-package/source-preflight.json \
  --target-ref TARGET_REF \
  --verify-only \
  --compare-receipt /absolute/private/path/storage-receipt.json \
  --receipt /absolute/private/path/storage-revalidation.json
```

It must say `verified_revalidation` and retain the exact verified
bucket/path/content manifest. This pass never overwrites the original receipt.

### 8. Reset credentials, quarantine, and rebind provider state

After exact data parity is receipted, complete the OAuth reset above when the
source key was unavailable, then quarantine copied provider state on the
target. These steps intentionally change target row checksums; preserve the
exact pre-reset import receipt plus the OAuth-reset and quarantine receipts.

Dry-run quarantine with both receipts, then inject the target database password
only on the confirmed execution. Its token is bound to the OAuth-reset receipt,
so provider quarantine cannot be accepted from the pre-reset import alone:

```sh
node scripts/quarantine-isolated-supabase-provider-state.mjs \
  --target-ref TARGET_REF \
  --import-receipt /absolute/private/path/import-receipt.json \
  --oauth-reset-receipt /absolute/private/path/oauth-reset-receipt.json \
  --receipt /absolute/private/path/quarantine-receipt.json
```

Then rebind in this order:

1. under the exact owner-approved Google credential update, add only
   `http://localhost:8080/oauth-callback` for the unpublished target canary and
   retain the existing production app redirects;
2. do not add a target Edge-function redirect or a Supabase Auth callback to
   Google Cloud. Both Calendar and Gmail policies use
   `${origin}/oauth-callback`, and the Supabase Google provider stays disabled;
3. update Gmail Pub/Sub push URL and exact OIDC audience together;
4. create new Calendar watch channels on the target, then stop source channels;
5. start/renew the Gmail watch on the target and prove one signed Pub/Sub push;
6. update Plaid webhook only if a Plaid item is connected in the final source
   receipt;
7. keep source callbacks available through the rollback window.

Do not copy active provider channel identifiers between projects. A deployed
function or HTTP 200 is not provider delivery proof.

### 9. Target story verification

With the application still pointed at the source, verify the target directly:

- password sign-in with a fresh target session;
- profile and private photo access;
- owner reauthorization of every receipted Calendar OAuth identity when an
  OAuth-reset receipt exists; require new target-key envelopes without reading
  them, the same token/account identity counts, and the preserved event count;
- 40 Calendar rows (or the fresh receipted count) and a bounded full sync;
- Calendar watch callback with the new target channel;
- Gmail OAuth scope, watch start, signed Pub/Sub delivery, history advance, and
  replay/idempotency receipt;
- Gmail compose draft acceptance receipt;
- cross-device sync deferred-boundary receipt proving anon/authenticated
  privileges are denied, the three prototype relations are absent from
  realtime, and the client service fails closed;
- Plaid empty-state or a separately approved reauthorization receipt;
- zero console errors, typecheck/build/tests, and security advisor review.

Record those checks in a private copy of
`supabase/isolation/target-cutover-canary.example.json`. Every evidence field
must contain the SHA-256 and absolute mode-0600 path of its underlying private
JSON receipt. Every evidence file uses `version: 1`, `status: verified`, the
matching `evidenceType`, target ref, captured-at time, the complete
source/import/storage/OAuth-reset/quarantine hash chain, and explicit
no-secret/no-row-ID flags. The rollback tool reads each file once, recomputes
its hash, and validates the envelope. Calendar reconnect additionally follows
`supabase/isolation/calendar-oauth-reauthorization.example.json`: it proves the
same OAuth/Calendar identity linkage and pre-sync event digest, fresh strict
access/refresh envelopes, future expiry, and zero tombstone matches.
The sync boundary follows
`supabase/isolation/sync-deferred-boundary.example.json` and binds the exact
deferral migration, data-scope manifest, and fail-closed client service hashes;
signed-in cross-device read/write would be a release regression, not a canary
success.
Self-attested prose, a deploy result, or an HTTP 200 does not satisfy the
envelope. The completed canary must be less than two hours old when the
rollback receipt is prepared.

### 10. Rollback and cutover confirmation gate

Prepare the rollback receipt. Stop immediately before changing Lovable's
Supabase URL/publishable key, publishing the app, or moving the final provider
callback. Present:

- ready source receipt hash;
- verified import, storage, OAuth-reset, and quarantine receipt hashes;
- target signed-in/provider canary receipts;
- prior source URL/key pair confirmed in the operator secret store;
- rollback-window end and owner;
- the exact `CUTOVER:<target-ref>:<rollback-prefix>` token.

Gate B begins by confirming the source write freeze is still active. In a
separate clean source-linked worktree, capture a new ready source preflight no
more than ten minutes old. Only after the freeze confirmation, run that source
snapshot and the storage revalidation above. Fill a private copy of
`supabase/isolation/source-write-freeze-continuity.example.json`; its timestamp
must precede both revalidation captures and bind the packaged source, fresh
source, and import receipt hashes. The rollback tool requires exact
catalog/public-data/preserved-Auth/storage parity with the packaged source;
live session and refresh-token counts may churn because those records were
explicitly excluded from the package.

The token is generated only when the receipt chain and fresh canary envelope
validate:

```sh
MIND_MANUAL_SOURCE_PUBLIC_CONFIG_STORED=yes \
node scripts/prepare-isolated-supabase-rollback-receipt.mjs \
  --source-receipt /absolute/private/path/mind-manual-data-package/source-preflight.json \
  --source-revalidation-receipt /absolute/private/path/source-revalidation.json \
  --source-freeze-receipt /absolute/private/path/source-freeze.json \
  --package-manifest /absolute/private/path/mind-manual-data-package/package-manifest.json \
  --auth-decision /absolute/private/path/auth-decision.json \
  --import-receipt /absolute/private/path/import-receipt.json \
  --storage-receipt /absolute/private/path/storage-receipt.json \
  --storage-revalidation-receipt /absolute/private/path/storage-revalidation.json \
  --oauth-reset-receipt /absolute/private/path/oauth-reset-receipt.json \
  --quarantine-receipt /absolute/private/path/quarantine-receipt.json \
  --target-canary-receipt /absolute/private/path/target-canary.json \
  --target-ref TARGET_REF \
  --window-ends 2026-08-30T23:59:59Z \
  --receipt /absolute/private/path/rollback-receipt.json
```

Only that action-time confirmation authorizes the public configuration switch.
After confirmation, change the URL and publishable key together, publish once,
and immediately re-run signed-in smoke/provider checks. Do not expose either
service-role key to Lovable or browser code.

### 11. Rollback window and closeout

Keep the source project unchanged and billable through the agreed window. A
rollback restores the prior public URL/key pair, republishes, restores source
callbacks, and verifies signed-in source behavior. It never reconstructs
secrets from receipts.

After the window closes and commercial/behavioral receipts remain green:

- disable old Mind Manual callbacks and schedules;
- retain commerce and its data on the original project;
- revoke temporary migration credentials;
- destroy the private data package under the operator's approved retention
  procedure;
- keep only secret-free hashes, counts, and release receipts.

## Stop conditions

Stop without provisioning or cutover when any of these occurs:

- source preflight is blocked or older than the approved freeze;
- a manifest entry is missing, overloaded, wrong-kind, or lacks RLS;
- any durable table has a row outside the approved Auth subjects;
- Auth user count/provider/MFA/SSO state differs from the owner decision;
- a secret value cannot be transferred or deliberately rotated;
- source and target Auth column fingerprints differ;
- target contains any unexpected/commerce relation or pre-existing user row;
- any binary file, row digest, object path, byte count, or content hash differs;
- a private signed URL cannot read the copied object;
- a provider callback has not produced a real authenticated delivery receipt;
- the prior source public configuration or rollback receipt is unavailable.
