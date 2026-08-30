# Reviewed Calendar import association recovery

Status: **local implementation in an unmerged draft; not a production release**.
Continuation base: `31a79a6ffb308b6e30e737205f5d4837b53d736f`.
Canonical main: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
Branch: `codex/scoped-migration-freeze`; [PR #35](https://github.com/Liquidg10/bubble-whisper-stream/pull/35).

The subsequent [reviewed outbound update contract](calendar-reviewed-outbound-contract.md)
adds a separate default-off manual update flow. It does not change this recovery
action's mapping-only behavior or activate any Google permission.

## What the reachable flow does

Calendar → Sync Management → Recovery offers three explicit steps:

1. Refresh the current account's known unresolved import references.
2. Review one reference against authenticated, enabled, owned Calendar metadata
   and a fresh, complete local database snapshot.
3. Confirm restoration of the verified saved task's local Calendar link.

The action changes only the owner-scoped mapping envelope and removes that one
reference's hold. It never creates, updates or deletes a task, modifies Google,
clears all holds, adopts legacy data or automatically retries the original import.
Existing conflict records and conflict status are preserved for their own review.
The automatic interval remains read-only assessment, not import or provider work.

The v1 hold records an account/event locator, not an operation ID or the intended
generated task ID. Recovery therefore proves a **current saved association**,
not that the original uncertain transaction succeeded or caused the saved row.

## Evidence and confirmation boundaries

Recovery requires exactly one matching persisted canonical-v1 task. Candidate
counting includes the union of raw direct/envelope ownership/provenance claims;
a malformed duplicate cannot disappear through an adapter's fallback projection.
Then required own properties, consistent direct/envelope owner and provenance,
task ID, schema, revision, content and calendar fields must validate. Display
text is bounded and only the selected current owner's labels are returned.

Absent, duplicate, foreign, unsupported, malformed or differing candidates stay
held. A different existing mapping, or a candidate mapped to another event, is
not silently reassigned. A failed scan cannot be interpreted as an empty scan.

Inspection makes no persistent change. It issues one in-memory, owner/generation
bound review token valid for at most five minutes. Confirmation consumes it and
reauthenticates, refetches canonical event data, rescans committed task rows and
compares the bounded candidate fingerprint plus the entire owner envelope and
canonical event with the preview. Changed, expired, stopped or replayed reviews
fail closed. Expiry is checked again after the final asynchronous evidence read.

Mapping and hold clearance are saved together; success is published only after
the browser's localStorage write succeeds. Storage errors preserve the previous
durable hold. Refresh can reload valid saved state after a transient failure;
malformed persisted state is not discarded or reset to empty.

## Local persistence and concurrency

`readCommittedBubbles()` uses an IndexedDB readonly cursor and resolves only on
transaction completion after cursor exhaustion. It rejects on abort, request,
enqueue, continuation or serialization errors. It bounds the accumulated snapshot
to 10,000 rows and 16 MiB of UTF-8 serialized array content. This is not a hard
browser heap bound: IndexedDB materializes each row before its size is checked.
This follows the [IndexedDB completion contract](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event).

All manager admissions now share one owner-scoped exclusive Web Lock across
updated same-origin instances. Each reloads the persisted owner envelope after
lock acquisition instead of overwriting another tab's holds with cached state.
Lock unavailability fails closed, without an unsafe fallback, lock stealing or
automatic waiting/retry. The lock remains held through already-admitted work
even if authentication changes or the manager stops. The same-instance queue
still coalesces identical pending work. These semantics use the browser's
[Web Locks contract](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

Important limits:

- Only cooperating updated managers in the same browser origin participate.
  Old clients, other origins/devices, ordinary BubbleStore edits, privileged
  tools and direct/manual storage changes are not governed by this lock.
- This does not make IndexedDB and localStorage one atomic transaction. The
  stored-envelope comparison detects intervening observed changes, not all
  races from noncooperating writers. A task may change after any read snapshot.
- Already-admitted task writes may finish after stop; neither cancellation nor
  global drain is claimed. Recovery never clears an absent/ambiguous candidate.
- The underlying app store remains shared local storage, not a generally
  account-private database. Owner markers are client checks, not server authz.
- Legacy assignments, no-match holds, reassignment/unlink and original-operation
  causality need separate reviewed workflows. No automatic reset/expiry clears
  persisted holds; the five-minute expiry applies only to the preview token.
- Browser support is required for this safe path; no Web Locks means no manager
  import/recovery admission. The app remains viewable and errors stay visible.

## UI and verification

The Recovery tab uses explicit async refresh → inspection → confirmation. It
does not fetch on mount or treat failed inventory as zero work. Account changes
hide prior labels during render, before effects; cleanup and transient refs
suppress stale completions and duplicate clicks. This was guided by the React
lifecycle/state review. Successful confirmation removes only the selected item
from the displayed known list, not an assertion that all calendar work is drained.

The browser tests use the real built application, IndexedDB and Web Locks with
synthetic sign-in/Calendar metadata responses. All nonlocal requests are fulfilled
by the fixture or aborted; no real credentials or provider operations are used.
They check successful association-only recovery and preservation of a hold after
a saved task changes. Separate browser tests exercise actual storage source,
late read aborts and exclusion between two same-origin tabs. These are local UI
proof, not signed-in production or provider parity receipts.

Checks: `npm run test:isolation:calendar-sync`, `npm run test:storage-browser`,
`npm run test:e2e:ci`, full/bounded Vitest, actual app typecheck, build and debt
ratchets. Counts and exact hosted check receipts are recorded in the PR handoff.

Local verification on 2026-08-30 UTC:

- Focused Calendar gate: **266/266 passed**, 11 files. New coverage adds 162
  cases: recovery26, evidence87, coordinator7, snapshot20, Recovery UI22.
- Full Vitest: **1,412 passed**, 52 inherited skips; 116 passed files, 3 skipped.
- Bounded unit gate: **889/889 passed**, 67 files. Node migration/tool gate:
  **231/231 passed**, no skips.
- Current UI browser gate: **12/12 passed**, including both new synthetic
  signed-in recovery flows. Storage/coordination browser gate: **7/7 passed**.
- Actual application typecheck, production build, whitespace and both debt
  ratchets passed. Existing 861 ESLint errors, 203 cohesion findings, build
  bundle warnings and 52 skipped tests are not represented as zero debt.

Both readiness diagnostics remain BLOCKED. No database deployment, source freeze,
credential, provider, scheduler, live subject selection, merge or cutover occurs
in this change. The prior live inventory remains dated evidence, not refreshed
by these synthetic tests.
