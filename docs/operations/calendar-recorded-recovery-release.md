# Calendar recorded-completion recovery — paired runtime release

Date: 2026-08-30. Base: merged foundation `002a47576722636aa07c29e36fea19e966e1652e`
([PR #40](https://github.com/Liquidg10/bubble-whisper-stream/pull/40)).
Branch: `codex/calendar-recorded-recovery-release`. This receipt describes source
and local verification; a later release comment establishes deployment status.

## What this adds

New reviewed Calendar updates use v2 immutable intent and a service-owned server
operation registry. The client saves its original provider target, ETag, request
digest and after-field digest **before** dispatch. The server independently
authenticates, recomputes the intent binding and obtains a unique durable claim.
Only that fresh claim's nonce holder can run the existing single-attempt provider
helper. An old operation is never reacquired or retried.

The server pins the actual Google calendar, not just a mutable local account ID.
It saves and validates the exact terminal result before returning `recorded`.
Provider/cache uncertainty and lost finalization acknowledgments remain held.
There is no inference from current matching values, a 404, an absent row or time.

Calendar → Sync Management → Outcomes can explicitly review a saved server
receipt for a newer hold. A second explicit confirmation rereads the same server
completion, rechecks active ownership and the exact local journal snapshot, then
saves only that chosen local outcome. It does not replay Google work or edit a
task, mapping, event or cache. The original task/account may be missing; lookup
uses historical owner-bound evidence, not current OAuth/cache existence.

This recovers **client-response loss when the server already recorded exact
completion**. It does not solve server/provider ambiguity before that record.
Legacy v1 rows, missing records, pending/uncertain states and provider-written but
cache-unknown states remain held. Contradictory local provider-written ETags or a
claimed no-write result cannot silently replace prior positive write evidence.

## Compatibility, account safety and minimal storage

The browser retains the existing version-1 journal envelope/key and every legacy
row. New rows have an own strict version-2 intent extension. Old readers reject
that unknown extension rather than silently ignoring it. No legacy row is upgraded
with guessed intent, dropped, expired or reset. New intent stores hashes and
references, not copied Calendar text. Terminal history is immutable.

The actual Edge entrypoint neutrally rejects old prepare/confirm versions before
provider work; rejection is not falsely labeled a terminal no-write receipt.
Legacy observation-only inspection remains separate and unchanged.

Both request and response evidence is detached before asynchronous boundaries.
Owner changes, stale reviews, duplicate clicks, changed storage, malformed replies,
unavailable storage and post-unmount results fail closed. React guidance informed
explicit event-driven actions, minimal versioned storage, functional state updates
and hiding prior-owner material during render before effect cleanup.

## Failure status and future migration compatibility

An admitted write with unknown provider/cache/finalizer/claim completion keeps an
HTTP 502 boundary. A hypothetical PR #35 wrapper must not treat its JSON body as
a successful completed write and release the original migration lease. Known
terminal results remain 200. Read-only lookups and exact non-winning claims use
their own request's completion boundary and do not release an earlier lease.

The actual draft wrapper was exercised locally with synthetic admitted outcomes,
including provider success, rejection, lost/malformed PATCH, cache uncertainty,
finalizer failure and committed-but-lost completion. This is compatibility evidence,
not a deployed guard, global drain or operation-to-migration-lease linkage.
Private-ledger writes and those lease bindings still need explicit PR #35 coverage.

The ledger covers reviewed v2 attempts only. Legacy create/delete, imports, other
clients and external provider writers are not globally inventoried or frozen.

## Activation and rollout limits

`CALENDAR_REVIEWED_UPDATES_ENABLED` must still be exactly `true` for a new reviewed
dispatch. It was freshly verified absent on source production v31 during this
work. No flag, credential, OAuth scope, consent or Google event changed.

Saved-receipt reads independently require the authenticated owner and exact
binding; they do not depend on write enablement or current Google authorization.
Missing SQL/RPCs return unavailable/held evidence, never fabricated completion or
a fallback provider write. The new SQL artifact remains **manual and uninstalled**.
This source implementation is not a claim that the live registry is provisioned.

Before any registry install or write activation: approve retention/privacy-deletion
policy, incorporate the private schema/RPCs into scoped export/catalog/guard and
rollback coverage, deploy matching schema/server/client versions, verify exact
live access boundaries, obtain an explicit Google write grant, and run approved
provider success/rejection/ambiguity canaries. Account-only versus all-user cutover
scope is still undecided. PR #35 remains draft; no user data moved.

## Release evidence

Integrated runtime source is `93d92cc52aabc6855d89c0275a1372a8538f86db`:
server `e6dcd6e`, admitted-write status correction `574e5f2`, and paired client
`93d92cc`. The release commit adds this receipt and makes the new focused contract
gate mandatory in hosted quality checks. Exact-head hosted checks and the final
merge/deployment SHA will be linked in the PR release comment.

These gates overlap; their counts are not additive unique-test totals.

| Gate | Result |
| --- | --- |
| Existing Calendar isolation contracts | 852 passed, 19 files |
| Exact v2 receipt/server/journal/recovery/UI contracts | 332 passed, 6 files |
| Real disposable PostgreSQL concurrency/access tests | 36 passed, zero skips |
| Full application suite | 2,144 passed; 52 inherited skips, 126 passing files |
| Bounded unit gate | 1,500 passed, 74 files |
| Built-app current UI | 17 passed |
| Real browser storage/coordination | 7 passed |
| Bounded accessibility | 14 passed |
| Actual app TypeScript and actual Calendar Edge Deno | Passed |
| Production build, whitespace, inherited-debt ratchets | Passed |

Independent reviewers checked the final shared contract, paired client/server
behavior, absent-schema failure, and HTTP-status boundary. Two regression fixes
detach hash inputs and parsed response evidence before asynchronous boundaries.
The paired release retains both.

The repository is not debt-free: 861 inherited ESLint errors, 203 cohesion
findings, build warnings, and 52 skipped tests remain. Browser gates use synthetic
provider/account fixtures; neither those checks nor disposable PostgreSQL tests
establish a provisioned live registry or real Google write/recovery success.

Local logs use `/tmp/mind-manual-calendar-recorded-integrated-*.log`; retained
visual evidence is under `/tmp/mind-manual-calendar-operation-release.POY2Jw/`.
Temporary files are supporting evidence, not a durable backup.
