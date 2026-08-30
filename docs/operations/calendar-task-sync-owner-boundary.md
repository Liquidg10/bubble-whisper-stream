# Calendar task sync: owner, admission and honest completion

Status: **draft implementation, not a live release or provider-write capability**.
Continuation base: `5959646b0de88304110f9042bd75f1ee3d604d14`.
Canonical main: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
Branch: `codex/scoped-migration-freeze`; [PR #35](https://github.com/Liquidg10/bubble-whisper-stream/pull/35).

This is the base-tranche receipt. The subsequent
[reviewed association recovery](calendar-import-recovery-contract.md) adds a
mapping-only recovery UI and coordination between updated same-origin managers;
its explicit limits replace the corresponding remaining-work items below.

## Behavior and intentional limits

The Calendar page eagerly imports its sync panel and manager. Previously that
import started a 15-minute writer even before authentication or route mounting.
The worker could create a new draft and immediately confirm it, bypassing the
policy-aware creation entrypoint. It also requested `update_event`, which the
server does not implement, and some callers ignored the failed response.

The manager now has no constructor I/O. `AuthProvider` is its single lifecycle
owner: a specific current authenticated identity starts it; sign-out, an account
change, uncertain authentication or unmount stops admission. Late initial-session
reads cannot replace newer authentication state. Routine token refresh does not
create another timer. Each operation checks the current owner/generation after
awaits; pending work is retained across stops rather than reported cancelled.
An old session's refocus `SIGNED_IN` event cannot complete a pending password or
signup action: only that action's awaited session result can establish its owner.
Overlapping stale action results/events fail closed rather than reviving a worker.

The automatic interval performs **review-only assessment**, not Calendar imports
or task/provider writes. Full Sync is an explicit user action that imports
verified, owned cached Calendar events into local tasks. Existing differing
values require explicit conflict review. The manager checks current Auth identity,
owned enabled Calendar account and canonical event fields instead of trusting a
caller-provided event payload. Existing tasks need both an exact owner marker and
matching import provenance; legacy/unowned data is not automatically adopted.

Outgoing creation, automatic confirmation, `update_event`, provider merges and
manual outbound resolution are **unavailable through this manager**. They return
review-required/false without sending a provider request or first partially
changing a task. No unscoped draft is created as a substitute. The separate
Calendar write services/widgets are not activated, certified or redesigned here.
Implementing an owned review/confirmation/update workflow remains separate work.

## Local persistence and duplicate-import boundary

One manager instance serializes admitted full-sync, individual import and conflict
operations, coalescing identical pending requests. Owner-scoped, versioned browser
state stores validated mappings, conflicts and unresolved operation references.
Legacy `calendar-task-mappings` and `calendar-task-conflicts` keys are left intact,
unread and unassigned. Missing/failed metadata reads no longer delete mappings.
Unlinking requires a separate reconciliation decision and fails closed here.

Before a local import write, an owner/account/event uncertainty marker must be
stored. The actual generated TaskStore ID and persisted task provenance/content
must agree before mapping and marker clearance are saved together. A lost
completion, stopped operation or mapping-save failure leaves the marker, so a
later instance loading it does not blindly repeat the import. Malformed or
oversized state blocks further imports; it is not silently discarded.
Writer-side conflict values obey the same bounds as the reader, so an oversized
local edit cannot poison the next session's saved envelope.

Calendar-origin TaskStore mutations require exact ownership and current lifecycle
checks, and never start automatic-write evaluation. Ordinary task edits retain
their existing evaluation behavior but now await the induced work. A saved edit
is not relabeled failed merely because subsequent evaluation fails.

Bubble creation and updates now wait for the IndexedDB transaction's `complete`
event instead of request success. The browser can abort after a request succeeds;
transaction completion is the local commit boundary. This follows the
[IndexedDB transaction contract](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event),
not a remote-sync or physical-disk durability guarantee. Other StorageService
mutation methods are outside this narrowly changed contract.

Important limits:

- Already-admitted local persistence can finish after stop. No cancellation,
  rollback, source freeze or global provider-drain receipt is claimed.
- BubbleStore and the underlying application IndexedDB remain shared local app
  storage. This is not a general account-private database or UI migration.
- Separate tabs/instances have no cross-tab compare-and-swap admission protocol.
  State loaded from storage preserves existing holds, but concurrent independent
  coordinators are not covered. Clearing browser data is not reconciliation.
- Unresolved markers have no automatic expiry or reset button; review is needed.
- Local owner/provenance markers are client safety checks, not server authorization.
  Server ownership/authentication and live rollout gates remain independently required.

## UI contract

The sync panel hides previous-owner mappings/conflicts, disables work while
signed out or uncertain, and ignores late results/toasts after owner change or
unmount. Fake progress timers and fixed success totals are removed. Only completed
local writes count as imported; review requirements and failures are visible,
not called complete. Provider update/merge buttons do not claim availability.

The Calendar page's hard-coded totals (including three supposedly auto-written
events) are replaced with labeled local task/conflict counts and unverified
Google-write status. Local counts are not provider receipts or account-private
inventory. The React review specifically guided lifecycle ownership, stale-result
suppression, versioned browser state and cleanup without fake progress timers.

## Verification

```sh
npm run test:isolation:calendar-sync
npm run test:storage-browser
npm run typecheck
npm run test:vitest:ci
npm run build
```

The focused suite includes actual manager-plus-TaskStore integration with mocked
transport and synthetic local persistence. The separate Chromium tests execute
the actual StorageService source against real IndexedDB, including abort after
request success, on a synthetic intercepted origin with no external network.
The signed-out Calendar smoke test renders the local application, blocks hosted
requests, verifies disabled actions and truthful labels, and captures a screenshot.
These do not substitute for signed-in production, provider canaries or cutover.

Verified locally on 2026-08-30 UTC:

- Focused calendar suite: **104/104 passed** across all six files (manager 45,
  TaskStore 22, actual pipeline 5, storage commit 10, Auth 14, panel 8).
- Full Vitest: **1,250 passed**, 52 existing skips; 111 passed files and 3 skipped.
- Bounded unit gate: **749/749 passed** across 63 files.
- Node migration/tool suite: **231 passed**, zero failures or skips.
- Real Chromium storage contracts: **4/4 passed**; current UI smoke: **10/10 passed**.
- Actual app typecheck, production build, debt ratchets and whitespace checks pass.
  Inherited debt remains: 861 ESLint errors, 203 cohesion findings, bundle warnings
  and the 52 skipped tests. Passing ratchets is not zero debt.
- Both readiness diagnostics still exit **2 / BLOCKED** without activation,
  source-freeze or byte-freeze claims.
- Independent review closed the auth-refocus race, oversized conflict envelope
  and local-storage fault-injection fixture issues; no remaining actionable
  blocker was found within this bounded implementation.

The prior [runtime inventory](background-writer-lifecycle-and-rollout-inventory.md)
is a dated observation, not refreshed by these local tests. Live guard/gateway
deployment dependencies and owner approval remain unchanged. No production data,
provider event, credential, scheduler or deployment is changed by this work.
