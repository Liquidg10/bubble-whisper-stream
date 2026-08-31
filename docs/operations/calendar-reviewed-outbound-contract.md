# Reviewed outbound Calendar updates

Status: **implemented in an unmerged draft; not activated or published**.
Continuation base: `9e366883cec9b50a173cd267d16f4b488f3e0ace`.
Canonical main: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
Branch: `codex/scoped-migration-freeze`; [PR #35](https://github.com/Liquidg10/bubble-whisper-stream/pull/35).

## Reachable manual workflow

Calendar → Sync Management → Updates provides explicit actions:

1. Refresh verified linked local tasks for the current authenticated owner.
2. Review the existing Google event against the saved task, with all seven
   current/proposed fields and exact account/event references visible.
3. Confirm that one reviewed update, or cancel the local preview.

No mount, timer, import, recovery or ordinary sync action starts this workflow.
The legacy `syncTaskToCalendar`/`update_event` paths remain unavailable; the new
server actions are `prepare_reviewed_update` and `confirm_reviewed_update`.
This does not create events, delete events, enable auto-write, update saved task
contents, clear conflicts, reassign mappings or silently refresh/import afterward.

Supported updates are deliberately limited to existing, confirmed, organizer-owned,
guest-free, nonrecurring timed events with a positive duration no greater than
24 hours. Title, description, location and start/end instants can change. Named
time zones are preserved. All-day, recurring, guest, locked and special-event
workflows require their own reviewed contracts.

## Local evidence, confirmation and outcomes

The manager uses the existing authenticated lifecycle and cooperating same-origin
Web Lock. It loads a bounded transaction-completed raw Bubble snapshot, requires
one exact mapping and canonical-v1 owner/provenance in both persisted representations,
and rejects malformed or duplicate evidence instead of using adapter defaults.
Unresolved imports or outbound outcomes block another update of that event.
The evidence fingerprint retains original timestamp representation, revisions and
all outgoing values. Sent timestamps are normalized to UTC; invalid dates, local
times, unsupported precision, unknown offsets and inconsistent mirrors are rejected.

Inspection does not save a dispatch. A successful server preview issues one
in-memory owner/generation-bound client review token, valid for five minutes.
Confirmation consumes it, reauthenticates, rereads committed local evidence and
compares both saved envelopes and the candidate fingerprint. Expiry is rechecked
after asynchronous evidence reads. The UI hides previous-owner material before
effects, suppresses stale completions and guards duplicate clicks. React lifecycle
review guided these safeguards and the versioned minimal persistence contract.

Before dispatch, `calendar-task-outbound:v1:<owner>` must durably save a pending
operation UUID, task/account/event references and timestamp. The journal is strict,
bounded to 1,000 receipts/1 MiB, and contains no event text or credentials. Unknown
schema, malformed state, duplicate UUIDs, incomplete/inherited completion fields,
quota failure or capacity exhaustion block further work rather than reset history.

The response must bind the same operation/account/event and exact reviewed fields,
with a valid new ETag and the expected cache status. Outcomes remain distinct:

- **written**: verified provider result, exact cache receipt, and local journal saved.
- **not_written**: a recognized server rejection; a new explicit review is required.
- **provider_written**: Google returned the reviewed update but cache/local receipt
  confirmation failed. The durable hold remains; this is not permission to retry.
- **uncertain/pending**: lost, malformed, contradictory or stopped completion.
  The durable hold remains across manager restart and page reload.

Neither a friendly error nor `success: true` substitutes for that protocol.
There is no retry loop, reset button, automatic expiry of holds, history pruning
or compensation delete. An admitted operation may settle after sign-out; it is
not claimed cancelled, and its unresolved hold remains.

## Server authorization and provider contract

The new route is inside the existing migration-admitted Calendar function. It
requires POST and independently checks
`CALENDAR_REVIEWED_UPDATES_ENABLED === 'true'`; the default is OFF. It rejects
internal/service-role callers. Every account, OAuth token and cache lookup is
independently scoped to the authenticated end user. The account must be enabled,
Google-backed and have an exact stored calendar ID, never an inferred `primary`.
The Google token must be owned, for Calendar, unexpired, and explicitly grant
`calendar.events` or full `calendar` scope. This path never refreshes tokens.

**The canonical OAuth request remains `calendar.readonly`.** This change neither
broadens it nor reconnects anyone. A separately approved permission/reauthorization
change and runtime activation remain prerequisites. Enabling a flag alone cannot
make a read-only token writable.

Preparation performs a bounded Google GET. Confirmation performs another GET and
checks the full before snapshot and ETag, then at most one PATCH with `If-Match`
and `sendUpdates=none`. Only the reviewed scalar/time fields are sent; attendee,
reminder and other arrays are never replaced. This uses Google's documented
[conditional modification](https://developers.google.com/workspace/calendar/api/guides/version-resources)
and [PATCH field semantics](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch).

Provider transport/body are bounded (15 seconds/128 KiB), redirects are refused,
and raw provider errors/content/tokens are not logged. A stale ETag/412 requires
new review, never reapplication. Unexpected PATCH status, response loss or invalid
success body is uncertain. A verified provider result is not relabeled unwritten
when the independent cache update fails. Cache persistence requires the exact
owned row, prior cached ETag and returned fields, with no insert/upsert fallback.
Both uncertain and provider-written/cache-unknown results return 502 so the
existing migration lease remains held for explicit reconciliation.

## Limits and activation gates

The client preview token represents the UI review, not server authorization or a
durable server idempotency record. The server authorizes the authenticated owner
and conditions the update on Google ETag evidence; the operation UUID correlates
receipts. No global exactly-once or durable replay registry is claimed.

The task store remains shared local application storage, not a generally
account-private database. The Web Lock only covers cooperating managers on one
origin. Ordinary task editors, old clients, other origins/devices and privileged
writers remain outside it. A task can change after the final evidence snapshot;
the operation sends the reviewed snapshot, not a globally frozen task. IndexedDB,
localStorage, Google and the cache do not share an atomic transaction.

Pending journals keep identifiers, not a full frozen provider payload. Resolving
ambiguous outcomes requires separate reviewed provider/cache evidence; these
records alone do not prove what a lost request did. Missing or malformed tasks
can be absent from the linked-task list even when a hold remains, so that list is
explicitly not a complete hold inventory or drain receipt.

Before activation: review Google write-scope reauthorization, exact deployed code
and flags, admitted control catalog, provider rejection/ambiguity canaries, outcome
reconciliation and rollback procedures, old writer retirement, and the owner's
maintenance/cutover decision. The existing source/storage readiness diagnostics
remain BLOCKED. No credentials, provider events, source data, scheduler, database
deployment, source freeze, permission grant, merge, publication or cutover was
performed during implementation.

## Verification

The focused Calendar gate now includes strict outbound task evidence, journal,
manager workflow, UI lifecycle, server transport/authorization and lease outcomes.
The browser fixtures use the actual built app, AuthProvider, IndexedDB and Web
Locks with synthetic authentication and function responses; every nonlocal request
is fulfilled by a fixture or aborted. Success, lost-response reload holds and a
disabled server are exercised without real credentials or Google operations.
These are local/browser protocol tests, not signed-in production/provider proof.

Final local checks on 2026-08-30 UTC:

- Focused Calendar gate: **683/683**, 16 files (266 prior + 417 new: evidence177,
  workflow34, journal21, server129, UI56).
- Full application suite: **1,829 passed, 52 inherited skips**, 121 passed files
  and 3 skipped. Bounded unit gate: **1,250/1,250**, 71 files.
- Node migration/tool suite: **231/231**, 18 suites, no skips (local PostgreSQL16).
- Current UI browser gate: **15/15**; real storage/coordination gate: **7/7**.
- Actual app typecheck, production build, actual Calendar Edge-entrypoint Deno
  check, targeted lint, whitespace check and both debt ratchets passed.
  Existing **861 lint errors, 203 cohesion findings**, bundle warnings and the
  skipped tests are not described as zero debt.
- Both readiness commands still exit **2 / BLOCKED**, with activation/freeze false.

Hosted check URLs for the exact committed head are recorded in PR #35. The previous
live runtime inventory remains dated 2026-08-30 09:34–09:36 UTC; these synthetic
tests do not refresh it. Inherited skipped tests, lint/cohesion debt and bundle
warnings remain separately disclosed.
