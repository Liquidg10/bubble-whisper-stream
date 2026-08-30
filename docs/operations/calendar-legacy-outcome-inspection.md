# Legacy Calendar outcome inventory and inspection

Base: `e3a6eaf15098e1e64cafaec96541f09ad0cf9403`.
Branch: `codex/calendar-outcome-inventory`.
Status: source implementation only; no deployment, activation or provider canary.

## Reachable behavior

Calendar → Sync Management → Outcomes has two explicit actions:

1. Refresh saved update holds from the active owner's browser journal.
2. Inspect the current Google event for one selected operation.

No request starts on mount. Inventory includes every `pending`, `uncertain`, and
`provider_written` receipt, even when its task or mapping is missing or the
separate sync-state envelope is malformed. Authentication and the strict bounded
journal still must validate. Storage failure is unavailable inventory, not zero.
The list describes only this account's current browser journal; it is not a
cross-device/server inventory or proof that provider work has stopped.

## Observation is not recovery

The v1 journal has operation/task/account/event identifiers and timestamps, but
no frozen outgoing fields, digest, original ETag or provider operation marker.
Current Google values cannot establish the outcome of an interrupted request.
In particular, matching fields or a 404 does not prove that an earlier PATCH
completed or stopped; it may still be in flight.

The new protocol is deliberately disjoint from dispatch receipts:

- `observed` + `observationOnly: true` supplies a bounded current snapshot.
- `inspection_unavailable` explains only this inspection's failure.

Neither response is `written`, `not_written`, cancellation or authorization to
retry. Every journal row remains byte-for-byte unchanged after inspection,
including `provider_written` rows with an existing ETag. There is no clear/reset,
expiration, retry, automatic sync, reassignment, task edit or cache repair.
The UI retains the hold and prominently labels observation-only evidence.

## Server and lifecycle boundaries

The dedicated `inspect_reviewed_outcome` action uses POST to the authenticated
Calendar function, then exactly one Google GET. It shares the independently
default-off `CALENDAR_REVIEWED_UPDATES_ENABLED` gate. It rejects internal callers,
independently scopes account and OAuth-token reads to the signed-in owner, and
requires the exact stored non-`primary` calendar ID, an enabled Google account,
an unexpired token and a supported read-capable scope. Existing `calendar.readonly`
and `calendar.events.readonly` grants suffice; no write grant or token refresh is
requested. This code neither changes OAuth requests nor enables the gate.

The observation helper has no cache read/write, provider write or lease-release
port. Response transport/body parsing is bounded to 15 seconds / 128 KiB;
redirects and raw errors are rejected. It uses the existing conservative event
parser; unsupported/guest/recurring/all-day events stay uninspected and held.
Scope semantics: [Google Events GET](https://developers.google.com/workspace/calendar/api/v3/reference/events/get).

The manager serializes with its existing owner-scoped cooperating Web Lock,
reauthenticates before/after reads and rejects changed journal snapshots or
operation/account/event identities. A lock is not a global writer freeze.
The UI hides previous-owner material before effects and suppresses stale,
duplicate, post-stop and post-unmount completions. React lifecycle guidance
informed these boundaries. Provider text exists only in the temporary observation
view; it is not added to the journal or logs.

Inspection never identifies or releases an earlier request's lease. Completion
of a new read request is not completion evidence for the original write request.
There is no claim of provider drain, source/storage freeze or activation readiness.

## Verification and remaining work

Focused regression coverage includes strict protocol discrimination, independent
owner/token checks, readonly grants, bounded GET failures, orphaned and malformed
sync-state inventory, unchanged holds, current-field non-proof, same-origin
coordination and owner-bound UI lifecycle. Tests use synthetic fixtures; they
never contact Google or authenticate a real account. The built-app lost-response
scenario reloads the page, opens Outcomes, observes fields matching the earlier
submitted values, and verifies the entire journal, task and mapping remain
unchanged with no replay. The screenshot was visually checked for readable tabs,
scope labels and the retained hold.

Verified locally on 2026-08-30:

- Focused Calendar gate: **845/845**, 19 files (683 prior + 162 new regressions).
- Full application suite: **1,991 passed, 52 inherited skips**, 124 passed files
  and 3 skipped files.
- Current built-app browser gate: **15/15**, including the expanded lost-outcome
  scenario. Browser fixtures intercept/abort every nonlocal network request.
- Actual app typecheck, actual Calendar Edge-entrypoint Deno check, production
  build, targeted new-code lint and whitespace checks passed.
- Both debt ratchets passed: **861 existing lint errors / 203 existing cohesion
  findings** remain unchanged. Existing bundle warnings also remain.
- Independent source review found no actionable blockers within this limited
  inventory/observation contract.

No SQL migration, credential change, Google mutation, cache repair, permission
grant, deployment or production activation was performed. These checks establish
source/local-browser behavior, not live provider proof or cutover readiness.

Actual proof-backed reconciliation remains future work. Future dispatches need
durable intent and operation-linked provider evidence. Legacy unknown outcomes
cannot be upgraded into successful completion by copying current values. Cache
repair, operation/lease linkage, approved activation, real-provider rejection and
ambiguity canaries, and all cutover gates remain separate.
