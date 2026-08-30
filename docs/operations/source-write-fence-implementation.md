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
2. `draining`: new work through all 33 Mind Manual Edge entrypoints receives
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

## Rollout dependency: do not deploy this candidate alone

The Edge wrapper is intentionally always enforced: there is no environment
flag that silently disables it when the control schema is missing. **Deploying
these Edge functions before the reviewed control SQL is installed would return
503 for normal requests.** Neither source nor target installation/deployment is
authorized by local implementation or test success. The current migration
allowlists also do not include the two new RPCs or the guard catalog; do not
add blanket exceptions to get around their rejection.

## What is not proven or implemented yet

`npm run supabase-freeze:readiness` is read-only source inspection. It always
exits 2 with `status: blocked`, even when all 33 entrypoints are wired. It has
no execute, force, confirmation or owner-assertion flags and cannot mint a
freeze or CUTOVER receipt. Resolve all of the following in a later reviewed
tranche before it can become a live activation verifier:

- **One explicit subject scope throughout migration.** Current source preflight
  and exporter select all `auth.users`/`auth.identities`; public ownership follows
  all source users. The scope must bind export, storage copy, import and rollback
  evidence without including newly signed-up unrelated users.
- **Shared-identity/dependency disposition.** Selected Auth rows cannot keep
  changing login metadata while remaining byte-identical for migration. A user
  who also uses commerce needs an explicit disposition. Inventory cross-product
  FKs, cascades and triggers: blocking a selected child may roll back a larger
  transaction. Unselected synthetic-user tests do not prove every live commerce
  flow unaffected.
- **Storage byte ingress.** `photoService` uploads/deletes directly through
  Storage, outside Edge admission. Inventory and stop/drain standard, resumable,
  S3, signed-upload and privileged writers for `photos` and `voice-samples`.
  Guarding `storage.objects` alone cannot prove immutable stored bytes. No
  storage fence is installed by this SQL.
- **Runtime generation and endpoint exclusivity.** Prove these 33 functions
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
- **Exact guard catalog parity.** New public triggers change existing relation
  fingerprints. New RPCs are rejected by the target allowlist; private control
  objects and Auth triggers are not covered by the old catalog receipt. Extend
  the exact contract, not broad exclusions or disabled comparisons.
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
npm run typecheck
npm run test:unit:ci
npm run test:vitest:ci
npm run build
npm run supabase-freeze:readiness
```

The PostgreSQL integration runner must start an isolated local temporary
cluster, never connect through `DATABASE_URL`, the Supabase CLI link, or
operator credentials. If PostgreSQL is unavailable, report that gate as not
run; mocks are not a substitute. Its fixture contains synthetic selected and
unselected users plus unrelated commerce, not source data. The readiness
command's exit 2 is expected while the activation blockers remain.

`.github/workflows/scoped-migration-freeze.yml` runs the same disposable
PostgreSQL and Edge lifecycle tests on an isolated CI runner. It uses no
Supabase/provider credentials and never installs the guard on a live database.

## Implementation verification receipt — 2026-08-29

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
