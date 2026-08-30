# Calendar operation receipts — foundation, not activation

Base: `be0ecb646af53b19053fc68fb58d37af0e8c64a9`. Branch: `codex/calendar-operation-receipts`.
Date: 2026-08-30. This tranche adds a tested protocol and **manual-install-only**
SQL artifact. It does not add a runtime caller, install SQL, deploy a function,
enable Calendar writes, change Google grants, or perform a data cutover.

## Bounded objective

A later runtime tranche may recover an exact server-persisted completion after
the client loses its response. It cannot infer completion from matching current
Google values, a 404, elapsed time, a browser lock, or an absent registry row.
Legacy v1 outcomes, unknown provider outcomes and unconfirmed cache writes stay
held. There is no retry, takeover, reset, expiry, pruning, or compensating write.

V2 intent binds the authenticated owner, operation, task, account, actual Google
calendar ID, event, original ETag, and all seven reviewed before/after fields.
SHA-256 uses fixed-order arrays with explicit domain/version identifiers. An
independent after-field digest supports exact receipt matching without copying
Calendar text into the journal or registry. A digest is a binding, not a signature
or authorization. The server must recompute it from its authenticated caller.

The response protocol separates `ready`/`unavailable`, `recorded`, and `held`.
Only strict recorded `written` with a changed ETag and confirmed cache receipt,
or recognized recorded `not_written`, is terminal. Provider-written/cache-unknown
and uncertain results can be durably retained but never parsed as terminal.
Identity/state/owner/time/result parsing rejects extra, inherited, malformed,
contradictory and whitespace-suffixed values.

## Manual registry and concurrency

Artifact: `supabase/manual/calendar-operation-receipts.sql`, deliberately outside
automatic migrations. One-time installation is transactional and refuses existing
objects instead of overwriting them. Installation requires an explicitly approved
privileged operator and reviewed runtime/deletion/migration envelope.

- The table is in private schema `mind_manual_calendar`, with RLS enabled/forced.
  `anon`, `authenticated`, and `service_role` have no direct table/schema access.
- Only `service_role` may call the three public RPCs. Their security-definer
  search paths are empty and all data references are schema-qualified. The
  privileged install owner remains part of the trust boundary.
- `calendar_operation_claim` inserts immutable `(owner, operation)` identity and
  returns a private nonce only to the insertion winner. Conflicts return no
  nonce. No existing operation is reacquired, including a terminal one.
- A partial unique index protects `(owner, actual Google calendar ID, event)`
  while an operation is pending, uncertain or provider-written/cache-unknown.
  Another account row referring to that provider target cannot bypass the hold.
- `calendar_operation_finalize` compares exact identity and nonce against a
  pending row, changes it once, and returns the durable result. The caller must
  validate this result before sending terminal evidence to the browser.
- `calendar_operation_read` returns only the matching owner's exact historical
  record, without the private claim nonce or current provider/account lookup.
- No foreign-key cascade deletes receipts when an account/token is unlinked.
  There is intentionally no automatic retention. Account deletion, privacy
  deletion and migration disposition must be explicitly designed before rollout.

Uniqueness/admission relies on PostgreSQL's atomic conflict handling, not a
read-then-insert check: [PostgreSQL INSERT](https://www.postgresql.org/docs/16/sql-insert.html)
and [partial indexes](https://www.postgresql.org/docs/16/indexes-partial.html).
The existing Google conditional write remains a separate provider-version check:
[Google versioned resources](https://developers.google.com/workspace/calendar/api/guides/version-resources).
Neither database admission nor an ETag proves an interrupted provider request's
outcome. A claim-to-provider crash gap remains held indefinitely.

## Verification

`npm run test:calendar:receipts` runs the strict contract tests and a real,
disposable PostgreSQL cluster on a private Unix socket with TCP disabled. It does
not accept a database URL or connect to an existing source/target database.
Missing local binaries fail rather than turning into a skipped pass. Synthetic
fixture clusters are removed after shutdown; user/repository data is not deleted.

Contract cases cover each owner/target/field binding, shape/version discrimination,
legacy/nonterminal rejection, malformed digests/ETags, and exact recorded rows.
Database cases cover role denial, single nonce winner, cross-owner/identity denial,
same-target account aliases, immutable finalization, lost finalizer acknowledgment,
permanent unknown holds, malformed inputs, eight concurrent duplicate claims,
two concurrent different-operation claims, and rolled-back completion.

First local database run exposed PostgreSQL's repetition-count limit for a 256-
character ETag regex. The artifact now uses an independent length constraint and
unbounded character-class check; the real database suite was rerun successfully.
The checked-in workflow runs the same contract and PostgreSQL gate on PRs/main.

Verified final local foundation: **53 contract tests, 36 real PostgreSQL tests,
1,857 full-suite passes and 52 inherited skips**. Actual app TypeScript, shared
Edge Deno check, production build, targeted lint, whitespace and both debt ratchets
passed. Inherited 861 lint errors, 203 cohesion findings and build warnings remain.
Independent review reran all 89 focused tests successfully. It also caught an
asynchronous digest snapshot gap; both encodings now freeze before any await,
covered by a deferred-crypto mutation regression. Hosted results belong to the
exact PR head and subsequent main commit, not this pre-merge local receipt.

## Required runtime and rollout boundaries

The next runtime tranche must authenticate independently, freeze/recheck the
actual provider calendar, claim before provider work, and execute only for the
fresh nonce winner. It must persist/validate completion before exposing recorded
success. Duplicate, missing, conflicting, malformed, or unavailable evidence stays
held. Legacy v1 prepare/confirm requests must fail neutrally rather than fabricate
known-not-written evidence. Recovery reads must not depend on write activation,
live OAuth permissions or a surviving account/cache row.

The client must retain every old row, store immutable v2 intent before dispatch,
require explicit lookup and confirmation, reread both the exact server receipt and
unchanged local journal, and update only that chosen local outcome. It must not
edit tasks, mappings, cache or Google during recovery.

Before installing this new private ledger/RPC surface, PR #35's guarded writer,
schema/catalog, selected-subject export, continuity, privacy and rollback coverage
must explicitly include it. Its absence from existing public-data manifests must
not silently exclude uncertain operations from a future cutover. The owner still
has not selected account-only versus all-users migration scope. Existing nine
source-freeze and three storage-ingress blockers are not resolved by this code.
