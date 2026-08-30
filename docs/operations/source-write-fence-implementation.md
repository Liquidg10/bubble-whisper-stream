# Mind Manual scoped write-fence implementation

Status: **implemented for local verification only; not deployment- or activation-ready**.
No database, credentials, provider, scheduler, app setting, or live deployment is
changed by this tranche. Do not merge into an auto-deploying release until the
rollout dependency and remaining gates below have an approved plan.

## What this tranche implements

`supabase/isolation/source-write-fence.sql` is a manual, transactional,
install-once artifact, deliberately outside `supabase/migrations`. It installs a
private operator-owned control schema, initially `open` with no selected users.
It is not executed by any of the commands below.

The control sequence is:

1. `open`: admission allowed; writes unchanged; explicit existing Auth subjects
   can be configured through the private operator function.
2. `draining`: new work through all 34 Mind Manual Edge entrypoints receives
   a sanitized 503 and retry header; already admitted requests retain leases;
   database writes are still allowed to let admitted work finish.
3. `fenced`: transition is refused until every Edge lease is released. Writes
   involving selected users in the 32 allowlisted physical tables and selected
   Auth users/identities are denied. This is a **database fence**, not a claim
   that the entire source is frozen.
4. `resume`: reopen admission and database writes. Existing leases are retained
   so an uncertain provider operation cannot be silently declared completed.

Database write/admission checks share a row lock with transitions. The fence
waits for transactions already inside guarded writes. Triggers check both old
and new ownership and the final stored owner; they run even under replica mode
and RLS-bypassing service roles. A selected user's new linked Auth identity is
also a write. Whole-table TRUNCATE on guarded tables is denied while fenced
because it cannot be restricted to a user. Arbitrary privileged DDL remains an
operator boundary, not something a trigger can prevent.

The two public control RPCs are service-role-only. Browser roles cannot admit
or release work, select scope, change phase, or read the private registry. The
registry holds only function names, random internal lease UUIDs and timestamps;
no credentials, request bodies, emails or provider payloads.

Every `serve` call uses `wrapMindManualHandler` with its exact manifest name.
Missing/malformed control state or unavailable admission RPCs fail closed
**before the underlying handler starts**. OPTIONS only returns CORS headers.
Existing endpoint authorization still executes inside an admitted request;
admission is not authentication and does not replace provider verification.

The lease covers the handler and response-body completion. Realtime voice also
binds the browser and provider socket lifetimes. An error, cancellation, lost
worker, missing WebSocket lifecycle, or failed release must not expire a lease
into an apparent successful drain. Reconcile uncertain leases out of band under
a separate operator decision; there is no automatic timeout cleanup.
Plaid webhook child dispatches now await and consume their responses before
the webhook is marked processed, rather than escaping the parent lifetime.

### Subject-scoped migration contract

The preflight/export/storage/rollback tools now require one private
`--subject-scope` manifest. The importer takes the same scope from the
hash-verified `subject-scope.json` embedded in its private package. No tool
chooses users from the live Auth population or infers a legacy file owner from
there being only one user. See the [cutover runbook](supabase-isolated-cutover-runbook-2026-08-29.md#private-subject-scope-contract)
for the exact envelope and receipt binding.

Source row/Auth/storage fingerprints describe selected users only; unrelated
user/sign-up counts remain separate from compared evidence. Target inventories
still inspect all rows/users and reject unapproved contents. Source durable
rows with null or unknown owners require disposition. Exact catalog comparison
is unchanged for business objects. A separate fixed-reference contract now
validates the private guards, Auth/public triggers and exact two guard RPCs;
missing guards on both sides is rejected. See the
[storage and catalog contract](storage-ingress-and-catalog-contract.md).

Exports recheck selected Auth/public row counts and content hashes inside the
same repeatable-read transaction as every binary COPY. They also reject
selected MFA state that appeared after preflight. Copy command tags are
explicitly enabled despite the normal quiet database client setting. These
are local correctness checks, not a source-write-freeze implementation.

## Rollout dependency: do not deploy this candidate alone

The Edge wrapper is intentionally always enforced: there is no environment
flag that silently disables it when the control schema is missing. **Deploying
these Edge functions before the reviewed control SQL is installed would return
503 for normal requests.** Neither source nor target installation/deployment is
authorized by local implementation or test success. Guard artifacts must be
installed identically on both projects after the retained pre-guard baseline.
Only exact independently validated guard RPCs are accepted beside the business
allowlist; there are no blanket exceptions.

## What is not proven or implemented yet

`npm run supabase-freeze:readiness` is read-only source inspection. It always
exits 2 with `status: blocked`, even when all 34 entrypoints are wired. It has
no execute, force, confirmation or owner-assertion flags and cannot mint a
freeze or CUTOVER receipt. Resolve all of the following in a later reviewed
tranche before it can become a live activation verifier:

- **One approved live subject scope throughout migration.** The scoped code is
  implemented, but the actual private owner-approved list, legacy ownership
  assignments, exact live guard membership and fresh linked receipts are still
  required. A checked-in synthetic example is not an approval. An unrelated
  signup must not expand selected subjects or invalidate selected-data parity.
- **Shared-identity/dependency disposition.** Selected Auth rows cannot keep
  changing login metadata while remaining byte-identical for migration. A user
  who also uses commerce needs an explicit disposition. Inventory cross-product
  FKs, cascades and triggers: blocking a selected child may roll back a larger
  transaction. Unselected synthetic-user tests do not prove every live commerce
  flow unaffected.
- **Storage byte ingress.** Photo mutations now use the admitted gateway; the
  separate manual artifact restricts direct client writes. Neither revokes
  historical signed/privileged work or proves accepted requests drained. The
  storage readiness diagnostic always remains blocked; authenticated provider
  inventory, writer retirement and byte stability are still required.
- **Runtime generation and endpoint exclusivity.** Prove these 34 functions
  belong only to Mind Manual, verify deployed artifacts, and retire/account for
  every pre-instrumentation request, stream and WebSocket. Zero leases only
  describes work admitted by the new helper.
- **Uncertain provider outcomes.** HTTP completion does not prove a remote
  provider stopped after a lost response. Reconcile durable attempts, pending
  idempotency state and every ambiguous provider result before freeze. The guard
  conservatively retains exceptions/server failures, but a successful handler
  can also swallow a provider error; zero leases alone is insufficient.
- **Schedulers and other writers.** `.github/workflows/calendar-watch-renewal.yml`
  has a twice-daily source call and manual dispatch. Inventory active/queued
  runs, database cron/network jobs, external jobs and operator writers. Drain
  them or prove their admission denial without losing provider catch-up work.
- **Exact guard catalog parity.** Fixed-reference structural validation is now
  implemented. Fresh source and target receipts must prove the identical
  reviewed manual artifacts; no live installation or parity is established.
- **Live denial, data stability and rollback evidence.** After approved rollout,
  verify selected-user denials, unrelated-product continuity, byte-level storage
  stability and restoration. Local synthetic PostgreSQL and mocked HTTP results
  are implementation evidence only.
- **Owner activation window.** Confirm exact source, selected subjects, affected
  buckets, Auth handling, outage scope, abort criteria and tested resume action
  at action time. Then collect fresh post-drain receipts. The existing final
  CUTOVER confirmation remains a separate gate.

## Local verification

```sh
npm ci
npm run test:isolation:freeze
npm run test:isolation:subjects
npm run test:isolation:ingress
npm run typecheck
npm run test:unit:ci
npm run test:vitest:ci
npm run build
npm run supabase-freeze:readiness
npm run supabase-storage:readiness
```

The PostgreSQL integration runner must start an isolated local temporary
cluster, never connect through `DATABASE_URL`, the Supabase CLI link, or
operator credentials. If PostgreSQL is unavailable, report that gate as not
run; mocks are not a substitute. Its fixture contains synthetic selected and
unselected users plus unrelated commerce, not source data. The readiness
command's exit 2 is expected while the activation blockers remain.

`.github/workflows/scoped-migration-freeze.yml` runs the same disposable
PostgreSQL, Edge lifecycle, subject-scope and migration-chain tests on an isolated CI runner. It uses no
Supabase/provider credentials and never installs the guard on a live database.

## Implementation verification receipt — 2026-08-29

The counts below are the initial fence-foundation receipt, not a claimed result
for the later subject-scope suite. Re-run `test:isolation:subjects` and the full
release gates after integration; keep their fresh results separately.

Base: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
Branch: `codex/scoped-migration-freeze`.

- Real disposable PostgreSQL 16.14: 16/16 tests, no skips. Includes all 32 table
  scopes, the shared Auth-to-profile signup trigger, concurrent writes/admission,
  stale repeatable-read transactions, bypass attempts and non-destructive resume.
- Focused Edge/entrypoint/lifetime: 49/49 tests; all 33 entrypoints guarded.
- Bounded unit gate: 52/52 files, 462/462 tests.
- Full Vitest: 98 files passed, 3 intentionally skipped; 941 tests passed,
  52 intentionally skipped, no failures.
- Actual app TypeScript config and new shared-module Deno checks: passed.
- Production build: passed, 4,067 modules; inherited chunk/import warnings.
- ESLint/cohesion debt ratchets and diff whitespace check: passed.
- Independent review found and verified the fix for the response-cancellation
  lease-release race; no remaining critical implementation defect was reported.
- Readiness remains blocked with nine explicit implementation/evidence gates.

These are local implementation results. Hosted CI, live GoTrue/Storage/provider
canaries, source installation and activation are separate receipts. No production
mutation, export, import, freeze assertion or CUTOVER occurred.

## Subject-scope follow-up verification — 2026-08-29

Continuation base: `ef59e776cc19e18017b7f034c026b82dea4f2d1c` on the same
`codex/scoped-migration-freeze` draft. Canonical base remains
`ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.

- All Node migration tests: **137/137 passed, zero skipped**. This includes
  118 subject/package/export/storage/import/reset/quarantine/rollback tests,
  the existing 16 database-fence tests and 3 deferred-sync receipt tests.
- Real disposable PostgreSQL exercises actual binary COPY, every allowlisted
  table, wrong-owner data, same-count content substitutions, late writers,
  pre-commit rollback, and matching forged digests that still violate scope.
- Offline storage transport verifies selected-only byte operations, explicit
  legacy remapping, unchanged outside-user churn, exact target Auth/buckets,
  no overwrite or redirects, and late-target-state rejection.
- Focused Edge fence tests: **49/49 passed**. Full application Vitest:
  **941 passed, 52 skipped**. Actual app TypeScript and production build passed;
  inherited build warnings remain. ESLint/cohesion ratchets passed with no
  additional debt; those ratchets do not claim a debt-free repository.
- OAuth reset, storage and sync-boundary self-tests passed. Independent review
  found and closed the quiet-COPY receipt defect, stale-file/hash binding,
  missing-storage pre-import exception and target-wide bucket inventory gap.
- Readiness still returns **BLOCKED / exit 2** with nine activation gates.

No live user identifiers or storage paths were selected, no provider APIs or
production databases were contacted, and no actual freeze/export/import/reset,
deployment or runtime cutover occurred. GitHub draft review/CI is a separate
verification surface, not authorization to activate the fence.
