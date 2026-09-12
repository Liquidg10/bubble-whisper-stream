# Draft migration reconciliation — 2026-08-30

This is a **local integration receipt**, not a deployment, source-freeze,
production-parity, or cutover receipt. PR #35 remains a draft and is not approved
for direct merge or coordinated rollout by these results.

## Exact ancestry and scope

Worktree: `bubble-whisper-stream-scoped-migration-freeze`.
Branch: `codex/scoped-migration-freeze`.
Existing draft parent: `e3a6eaf15098e1e64cafaec96541f09ad0cf9403`.
Canonical main parent: `be0ecb646af53b19053fc68fb58d37af0e8c64a9`.

This is a normal merge of canonical main **into the draft**, preserving both
histories. It is not a rebase, squash, force-push, or merge of the draft into main.
The merge commit containing this receipt identifies the exact integrated tree.
The stale primary checkout was not modified.

The following changes are already on main and are not remaining PR #35 work:

| Main release | Canonical merge |
| --- | --- |
| #36 background connection lifecycle | `7b754d73af61d82c85f4d54f18fb8f175464766e` |
| #37 owned Calendar imports and reviewed link recovery | `f9c13d3c2464a317980e85eb9d1f15feb4b25ba9` |
| #38 strict optional configuration inventory | `e855fb61d92f7310076d510155a0ebe26b09cd0c` |
| #39 reviewed Calendar updates and held-outcome inspection | `be0ecb646af53b19053fc68fb58d37af0e8c64a9` |

## Conflict resolutions and preserved boundaries

- Calendar UI, lifecycle tests, local journal, sync manager, browser fixtures,
  and current UI smoke tests match canonical main. The new outcome inventory
  and inspection implementation is included without changing its owner checks,
  non-mutating inspection contract, or explicit default-OFF update contract.
- The draft's Calendar entrypoint still calls
  `serve(wrapMindManualHandler("calendar-sync", handler))`. It does not inherit
  standalone main's unwrapped `serve(handler)`. The draft-only regression still
  proves a cache-uncertain 502 retains its admitted migration lease.
- The source fence SQL, storage-policy SQL, fixed guard-catalog reference,
  admission/lifetime helpers, photo gateway/client, Supabase gateway declaration,
  and other guarded entrypoints are unchanged from the existing draft parent.
  Missing control SQL still fails closed; local source coverage is 34/34.
- Preflight combines main's exact required/optional manifest validation and
  byte-hash bindings with the draft's selected-subject scope, fixed guard-catalog
  binding, scoped storage, immutable comparison snapshot, and redacted outputs.
  Configuration checks do not replace scope or guard checks. A valid binding in
  one layer does not repair an invalid binding in another.
- Test fixtures now carry valid synthetic scope/guard/configuration bindings;
  ten new cross-boundary regressions cover their independent rejection. An
  independent review inspected the complete preflight resolution and ran 71
  focused tests, including disposable local PostgreSQL, with no failures.
- Package scripts retain the main release gates and all draft migration gates.
  No package dependencies or lockfile changed.

## Remaining diff against main

There are **93 remaining files including this receipt**, grouped below. This
counts paths, not independent releases or decisions. The existing draft contract
documents remain historical design/provenance material; they do not turn already
merged Calendar or lifecycle implementation into new work.

| Remaining category | Files | What remains draft-only |
| --- | ---: | --- |
| Operator scripts and local tests | 29 | Selected-subject export/import/storage/reset/quarantine/rollback, exact guard catalog, fail-closed receipts and combined configuration regressions |
| Edge/shared guard changes | 39 | Admission wrappers, long-lived response/socket handling, photo gateway, and Calendar lease-preserving integration |
| Isolation SQL and scope examples | 8 | Manual source fence/storage policy, exact catalog reference, scoped decision/continuity/rollback examples and gateway manifest entry |
| Photo client and draft security tests | 6 | Gateway-only photo mutation, fence/entrypoint/gateway tests and the Calendar lease regression |
| Workflow/package/Supabase config | 3 | Local migration CI and scripts plus the gateway declaration |
| Draft contracts/runbook and this receipt | 8 | Coordination boundaries, historical foundation evidence and fresh reconciliation evidence |

There is no remaining diff in the released Calendar components, owner/import
manager, journal, Auth provider, stores, or current UI browser tests. Readiness
and release status must be evaluated from this residual diff, not from the old
pre-split PR size.

## Fresh local verification

The dependency and devDependency entries and lockfile are unchanged from the
two parents; package scripts retain the union described above.
PostgreSQL tests used `/opt/homebrew/opt/postgresql@16/bin` through
`MIND_MANUAL_TEST_PG_BIN`; fixtures start disposable local clusters with synthetic
data. They do not use source/target database credentials or provider mutations.

| Gate | Result |
| --- | --- |
| Actual app TypeScript configuration | Passed |
| Calendar focused gate | 845 passed, 19 files |
| Bounded unit gate | 1,380 passed, 73 files |
| Full Vitest gate | 1,991 passed; 52 existing skipped, 124 passed files and 3 skipped files |
| All migration Node tests | 283 passed, 19 suites, zero skips |
| Source-fence focused gate | 16 PostgreSQL tests plus 49 Edge/lifetime tests passed |
| Subject/package/export/storage/import/reset/rollback focused gate | 123 passed, zero skips |
| Storage ingress/catalog/export focused gate | 90 Node tests plus 137 gateway/client tests passed |
| Deferred-sync focused gate | 3 receipt tests plus 6 service tests passed |
| Background scheduler lifecycle gate | 68 passed, 5 files |
| Optional configuration focused gate | 51 passed, zero skips |
| Deno checks | Calendar entrypoint, migration fence, shared photo gateway and photo entrypoint passed |
| Production build | Passed; inherited chunk-size/ineffective-dynamic-import warnings remain |
| ESLint debt ratchet | Passed: 861 errors versus inherited baseline 1,077; not a lint-clean claim |
| Cohesion debt ratchet | Passed: 203 findings versus baseline 203 |
| Current UI browser gate | 15 passed with synthetic intercepted account/provider fixtures |
| Real browser storage gate | 7 passed, including IndexedDB completion/abort and same-origin Web Locks |
| Bounded accessibility browser gate | 14 passed |
| Source-fence readiness | Expected exit 2, blocked; 34/34 guarded entrypoints, nine blockers |
| Storage-ingress readiness | Expected exit 2, blocked; three blockers; no source/storage byte freeze asserted |
| Whitespace check | Passed |

The suite overlap is intentional; these counts must not be added into a count
of unique tests. Mocked/synthetic browser results are not fresh Google consent,
native provider writes, live backend deployment, or global browser retirement.

## Still required before any coordinated migration rollout

The nine source-fence blockers remain: owner-approved private subject scope,
shared identity disposition, historical/privileged storage ingress retirement,
runtime-generation retirement, ambiguous provider-outcome reconciliation,
scheduler/writer inventory and drain, exact live guard-catalog parity, live
denial/continuity/rollback evidence, and an explicit owner maintenance window.
The storage diagnostic independently retains missing observations, unverified
provider provenance, and the owner-window blocker.

No live inventory was refreshed in this local step. Historical source/target
or scheduler observations in prior documents keep their original capture time
and are not promoted to fresh evidence. No guard SQL was installed, no photo
gateway was deployed, no provider secret or activation flag was changed, no
subject was selected, no user data was exported/imported, and no source freeze
or cutover occurred. The branch has not been pushed by this integration task;
root review precedes any external draft update. No additional user policy choice
was required merely to preserve both sets of local safety checks.
