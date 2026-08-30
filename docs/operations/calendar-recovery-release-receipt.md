# Calendar ownership and saved-link recovery release tranche

Status: independently extracted and locally verified for incremental integration.
This receipt does not claim a merge, frontend publication, provider operation,
database rollout, source freeze or production cutover.

- Initial canonical base: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
- Branch: `codex/release-calendar-recovery`.
- Extraction source: `9e366883cec9b50a173cd267d16f4b488f3e0ace` in draft PR #35.
- Source worktree: `bubble-whisper-stream-scoped-migration-freeze` (preserved).
- Release worktree: `bubble-whisper-stream-release-calendar-recovery`.
- Date: 2026-08-30 UTC. Final integration SHA and hosted check receipts belong
  in the release pull request; local test success is not a merge receipt.

## Bounded changes

The 24 extracted application/test/UI-workflow files are byte-identical to the
named source revision. This tranche additionally adds two focused package
scripts, a focused Calendar step to the ordinary quality workflow, and this
standalone receipt. It does not copy draft migration documentation or controls.

The application changes are CalendarSyncPanel, CalendarImportRecoveryPanel,
Calendar page, AuthProvider, calendarTaskSyncManager,
calendarImportRecoveryEvidence, calendarSyncCoordinator, storage, and taskStore.
The related eleven focused test files, current UI browser smoke spec, browser
storage config/spec and browser CI step travel with those implementations.

### Authenticated ownership and honest local persistence

AuthProvider is the Calendar manager's lifecycle owner. Importing the manager
does not start a timer or read another owner's mappings. Identity transitions
stop admission, invalidate stale completions, and bind every subsequent manual
operation to the authenticated owner. Calendar account/event lookup also checks
canonical server ownership instead of trusting supplied event objects.

The manager's automatic interval performs read-only assessment. Explicit manual
imports can create/update verified owned local tasks; they are not provider
writes. The old automatic outgoing create/update/merge paths are unavailable.
Normal task edits retain their existing behavior. Calendar imports do not start
automatic-write evaluation or silently adopt legacy/unowned tasks.

Local task-save success now waits for the IndexedDB transaction to complete,
not merely an individual request's success. A failed or uncertain save leaves a
durable owner-scoped hold before another import can be attempted. Stopping
admission does not cancel a transaction that was already dispatched.

### Explicit saved-link recovery

Calendar -> Sync Management -> Recovery has three explicit actions: refresh the
known held-import list, review the saved match, and restore that reviewed link.
No mount, refresh, timer or ordinary import triggers a recovery confirmation.

Recovery requires exactly one current canonical-v1 owned task with matching
persisted direct/envelope provenance and Calendar fields. The bounded committed
snapshot also counts malformed duplicate claims; adapter fallbacks cannot make
ambiguous evidence disappear. No-match, foreign, duplicate, changed or invalid
evidence remains held. Existing conflicts remain available for separate review.

The owner/generation-bound preview is single-use and expires after five minutes.
Confirmation reauthenticates and repeats the committed evidence checks; changed
state, account switches, expired previews and duplicate clicks cannot reuse the
earlier authority. React lifecycle review preserves primitive owner dependencies,
transient refs, immediate hiding of prior-owner labels and stale-result guards.

Success saves only the owner-scoped mapping envelope and removes the one reviewed
hold in the same localStorage write. It does not create, rewrite or delete a task,
change Google Calendar, reset all holds, or retry the original import. A storage
failure is not presented as successful recovery.

## Boundaries that remain explicit

- Locator-only holds prove a current association, not the original transaction's
  causal outcome. No-match/ambiguous holds and legacy assignments need separate
  reviewed handling. There is no automatic reset, expiry or reassignment.
- Readonly snapshots resolve after cursor exhaustion and transaction completion;
  accumulation is bounded to 10,000 rows and 16 MiB serialized UTF-8 data. That
  is not a hard browser heap limit because IndexedDB materializes each row.
- Owner-scoped Web Locks serialize cooperating updated managers on one origin
  and remain held through admitted work settling. Busy/unavailable locks fail
  closed. Old clients, ordinary task editors, other origins/devices and direct
  storage writers do not participate.
- IndexedDB and localStorage are not one atomic transaction. The underlying
  task database remains shared application storage, not an account-private DB.
- A successful refresh returning zero known holds is not a complete inventory
  of all calendar work, a provider reconciliation, or a global drain receipt.
- This extraction does not include the later reviewed outbound update workflow,
  uncertainty recovery, broader Google scopes, credentials or activation flags.
- It excludes all draft Edge admission wrappers, migration scripts/SQL/catalogs,
  photo gateway/client changes, Supabase configuration and scheduler changes.
  Those remain a separately coordinated rollout, not dependencies of this code.

## Verification on the initial canonical base

Foreground `npm ci` completed with zero reported dependency vulnerabilities.
All 24 extracted files matched source revision `9e36688` byte-for-byte.

| Check | Result |
| --- | --- |
| `npm run test:isolation:calendar-sync` | 266 passed, 11 files |
| `npm run test:vitest:ci` | 1,158 passed, 52 inherited skips; 107 passed / 3 skipped files |
| `npm run test:unit:ci` | 635 passed, 58 files |
| `npm run test:storage-browser` | 7 passed |
| `CI=true npm run test:e2e:ci` | 12 passed |
| `CI=true npm run test:a11y:ci` | 14 passed |
| `npm run typecheck` | passed (actual application project) |
| `npm run build` | passed, 4,070 modules |
| ESLint/cohesion ratchets | passed, 861 existing errors / 203 existing findings |
| `git diff --check` | passed |

Browser tests use the real built application, AuthProvider, IndexedDB and Web
Locks with synthetic authentication/Calendar fixtures. They prove mapping-only
recovery, preserved holds after saved-task changes, signed-out denial, real
transaction completion/late abort, and same-origin manager exclusion. Every
nonlocal request in the recovery fixtures is fulfilled synthetically or aborted.
They do not use real credentials, change provider events, or constitute signed-in
production/provider parity proof. The successful recovery screenshot was inspected
for readable state, explicit no-Google-write copy and the known-list caveat.

The dedicated agent-browser helper was unavailable; the repository's Playwright
runner supplied browser verification. Existing bundle-size/dynamic-import warnings,
the 52 skipped tests and lint/cohesion debt remain disclosed, not called resolved.

The focused Calendar gate is included in normal hosted quality CI, including
AuthProvider and UI tests not selected by the older bounded unit gate. The real
storage browser gate is included in normal browser CI. Rebase onto the preceding
lifecycle merge, rerun focused/release checks, and verify exact-head hosted checks
before merging. Publication and production parity are separate release steps.
