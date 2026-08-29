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
relations, two Gmail RPCs, four Pub/Sub configuration names, and the live
`gmail-watch` `verify_jwt` value. Any different blocker needs investigation.

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
- requires an exact `COPY_STORAGE:<target-ref>:<source-prefix>` token to write.

`scripts/quarantine-isolated-supabase-provider-state.mjs`

- refuses the source project ref;
- requires the verified import receipt;
- clears source-bound Calendar/Gmail watch state and disables generic webhook
  state on the target only;
- requires an exact `QUARANTINE:<target-ref>:<import-prefix>` token;
- records before/after counts, then blocks provider deployment unless all
  source-bound state is inactive.

`scripts/prepare-isolated-supabase-rollback-receipt.mjs`

- accepts only a ready source, verified import, verified storage copy, and
  verified quarantine receipt;
- verifies the source/import/storage/quarantine hash chain and a target canary
  envelope no older than two hours;
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
new Gmail watch with `verify_jwt=false`, configure the four Pub/Sub settings,
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

- production Site URL and exact `/auth/callback` and `/oauth-callback` entries;
- leaked-password protection enabled;
- email OTP expiry 3600 seconds;
- no source JWT reuse; users will sign in again.

Run target preflight without comparison first. Any unexpected public relation
or commerce object is a destroy-and-reprovision condition, not a repair target.

### 5. Transfer secrets without disclosure

The source API exposes secret names/hashes, not recoverable plaintext. Copy or
rotate each user-managed value through its provider/operator secret store.
Never paste it into a receipt.

`OAUTH_ENCRYPTION_KEY` is special: the two copied OAuth-token rows remain
decryptable only if the exact existing value reaches the target. If that value
cannot be recovered safely, omit/expire those credentials and require Google
reauthorization; never substitute a fallback key.

Configure the four Gmail values introduced by the Pub/Sub implementation:

- `GMAIL_PUBSUB_TOPIC`;
- `GMAIL_PUBSUB_SUBSCRIPTION`;
- `GMAIL_PUBSUB_PUSH_AUDIENCE`;
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
window.

### 7. Copy and verify private storage

Supabase documents that storage object metadata and file bytes are separate and
must both be migrated:
<https://supabase.com/docs/guides/storage/management/download-objects>.
Its database-clone flow likewise does not copy storage objects, Edge Functions,
Auth settings, or API keys:
<https://supabase.com/docs/guides/platform/clone-project>.

Inject both service-role keys without echoing, run the storage tool without
`--execute`, review its count/bytes/content digest, then run the printed exact
confirmation. A successful receipt must say `verified`, include three objects
and 603,067 bytes if the source has not changed, report three remapped paths,
and show signed-URL verification for every object.

### 8. Quarantine and rebind provider state

After exact data parity is receipted, quarantine copied provider state on the
target. This intentionally changes target row checksums; preserve the exact
pre-quarantine receipt and the new quarantine receipt.

Then rebind in this order:

1. add both target project-bound Google redirects—the Calendar Edge callback
   and Supabase Auth's `/auth/v1/callback`—while retaining their source forms;
2. retain the app-hosted `/oauth-callback` redirect used by Gmail OAuth;
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
- 40 Calendar rows (or the fresh receipted count) and a bounded sync;
- Calendar watch callback with the new target channel;
- Gmail OAuth scope, watch start, signed Pub/Sub delivery, history advance, and
  replay/idempotency receipt;
- Gmail compose draft acceptance receipt;
- sync read/write receipt;
- Plaid empty-state or a separately approved reauthorization receipt;
- zero console errors, typecheck/build/tests, and security advisor review.

Record those checks in a private copy of
`supabase/isolation/target-cutover-canary.example.json`. Every evidence field
must contain the SHA-256 of its underlying private receipt; self-attested prose,
a deploy result, or an HTTP 200 does not satisfy the envelope. The completed
canary must be less than two hours old when the rollback receipt is prepared.

### 10. Rollback and cutover confirmation gate

Prepare the rollback receipt. Stop immediately before changing Lovable's
Supabase URL/publishable key, publishing the app, or moving the final provider
callback. Present:

- ready source receipt hash;
- verified import, storage, and quarantine receipt hashes;
- target signed-in/provider canary receipts;
- prior source URL/key pair confirmed in the operator secret store;
- rollback-window end and owner;
- the exact `CUTOVER:<target-ref>:<rollback-prefix>` token.

The token is generated only when the receipt chain and fresh canary envelope
validate:

```sh
MIND_MANUAL_SOURCE_PUBLIC_CONFIG_STORED=yes \
node scripts/prepare-isolated-supabase-rollback-receipt.mjs \
  --source-receipt /absolute/private/path/source-preflight.json \
  --import-receipt /absolute/private/path/import-receipt.json \
  --storage-receipt /absolute/private/path/storage-receipt.json \
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
