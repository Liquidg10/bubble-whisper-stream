# Background writer lifecycle and live rollout inventory

Status: **draft implementation; not deployed, frozen, or cut over**.
Observation window: 2026-08-30 09:34–09:36 UTC (2026-08-29 in Honolulu).
Continuation base: `fc82133b19d0325769b11088c68aadf007ae3aa8`.
Canonical main: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
Branch: `codex/scoped-migration-freeze`; [draft PR #35](https://github.com/Liquidg10/bubble-whisper-stream/pull/35).

## Authenticated read-only observations

The inventory used authenticated project/function metadata, a narrowly selected
deployed function download, read-only database catalog transactions, and GitHub
workflow metadata. No application rows, Auth subject list, provider tokens or
workflow secret values were inventoried. No credentials were changed or exposed.
No application endpoint was invoked and no workflow was dispatched or disabled.
These are point-in-time observations, not continuing monitoring or retirement.

| Surface | Source `ekekeywoxvdbfbmqyhjy` | Target `fjxedbaskrbewjunfxaj` |
| --- | --- | --- |
| Project status | ACTIVE_HEALTHY | ACTIVE_HEALTHY |
| Manifest functions present | 33 of 34; `storage-photo` absent | 33 of 34; `storage-photo` absent |
| JWT configuration | 31 true / 2 false; no manifest mismatch | 31 true / 2 false; no manifest mismatch |
| Deployed versions | Mixed versions 2–87 | All 33 at version 4 |
| Function hashes available | 18 present / 15 unknown | 33 present |
| PostgreSQL major version | 17 | 17 |
| Private guard schema / guard RPCs | Absent / 0 | Absent / 0 |
| Gateway Storage policies | 0 | 0 |
| Buckets | Exactly `photos`, `voice-samples`; both private | Same |
| `cron.job`, `cron.job_run_details`, `net.http_request_queue` | Relations absent | Relations absent |

The 18 comparable function metadata hashes match for 15 functions and differ for
`plaid-exchange-token`, `plaid-get-accounts`, and `plaid-get-transactions`. A missing
hash is unknown, not parity. Version numbers and metadata hashes do not prove
running workers have retired. Both databases report `storage.objects` owned by
`supabase_storage_admin`; `anon` and `authenticated` are neither superusers nor
RLS-bypassing roles. This is not a complete hosted Storage policy audit.

For a concrete runtime check, the deployed `watch-renewal-cron` source was
downloaded from each project into separate private temporary directories using
the authenticated Supabase download API. The entrypoints were identical:

- 7,932 bytes; SHA-256 `2726741f43f3cb259d22bf9f7bd29175648c7bcfb526221c6dcfe364f02fa29a`.
- The entrypoint passes an arrow function directly to `serve`; no
  `wrapMindManualHandler` or `migrationWriteFence` helper exists in that downloaded
  closure. This verifies one concrete unguarded deployed endpoint, not all 33.
- Local guarded entrypoint SHA-256:
  `0b20bfeee4443c5380cc6045107db71ccee7d051a8e24b056176ab35cb21f9e8`.
- Function metadata generation fingerprints stayed unchanged across download:
  source `ddd7a8d55e87aebc1e6c2cb5f5d66c3e11b2b46301083cc8d276e2be5eb59cac`;
  target `8bcc53de49b0bae0a201c775b0cf1b237befcb48ad5f95d0efc4609a0204f093`.

**Do not deploy the candidate alone.** Its admission wrapper fails closed when
the guard RPCs are absent. The live observations confirm this dependency is
currently unsatisfied. Follow the separately approved
[storage and guard rollout order](storage-ingress-and-catalog-contract.md#exact-catalog-contract-and-baseline-ownership).

## GitHub scheduler observation

`Calendar watch renewal`, workflow ID `344435829`, was **ACTIVE**, with scheduled
`17 */12 * * *` and manual dispatch. Its canonical-main file SHA-256 was
`3f919de3f651c715a8d49adcecfd9df40b2bf47cd8a3d6bf36a2b1e22e04efe8`.
It POSTs to the source renewal endpoint with the configured service credential;
the handler can subsequently renew provider watches and write sync logs.

At 09:34 UTC, complete repository-wide GitHub queries found zero runs in each of
`queued`, `in_progress`, `requested`, `waiting`, and `pending`. The latest
[scheduled run 33284717239](https://github.com/Liquidg10/bubble-whisper-stream/actions/runs/33284717239)
succeeded at 01:01:55–01:02:06 UTC on canonical main. An empty run queue at one
instant is **not** a disabled scheduler or proof its previous provider work ended.
Absent cron/network tables likewise do not exclude external schedulers, signed
Storage operations, provider callbacks, or operators.

## Browser lifecycle changes

The candidate corrects a reachable shutdown bug: watch-renewal startup did not
retain its hourly interval, so duplicate starts created duplicate timers and
stop left background scans running. An awaited scan could also dispatch or
recreate timers after shutdown. Similar races existed in token refresh, dynamic
OAuth service startup, and production watch-health startup/maintenance.

- Token refresh and watch renewal now start idempotently, retain and clear
  timers, coalesce scans, and check generation after awaited reads before new
  dispatch. Old generations cannot restart work after stop/restart.
- OAuth startup shares one module load and pending start. Stale loading or
  failed startup cannot restart stopped services or stop a newer generation.
- Watch-health automatic renewal triggers delegate to the single watch-renewal
  coordinator. They do not bypass it through Calendar/Gmail health helpers.
- Account-level in-flight operations remain tracked across stop/restart.
  Transport failures and invalid completion receipts hold automatic retries for
  that browser session. Token refresh additionally rejects non-future or invalid
  expiry timestamps and credential-bearing receipts.
- Already-dispatched requests may finish after stop. Stop suppresses new
  follow-on dispatch and secondary renewal/refresh database logs; it does not
  cancel remote work. A failed telemetry
  write does not relabel a valid token-refresh receipt as provider failure.
- Explicit 410 recovery remains a separate callable operation, with per-account
  coalescing and generation checks between stages. It is not included in the
  automatic-renewal uncertainty hold. Explicit manual token refresh remains
  callable while background monitoring is stopped, but respects its account hold.

These holds are in-memory only. A reload, another tab, another user session,
old deployed clients or a server scheduler can still act. A stopped timer, empty
local counter or successful mocked response cannot establish a global freeze,
provider reconciliation, deployed behavior, or permission to clear durable leases.

## Remaining reachable writers and rollout gates

At the inventory base, the separate `calendarTaskSyncManager` constructor started
a 15-minute timer without a stop method and its Calendar route caller could reach
calendar writes. The subsequent [owner-bound sync follow-up](calendar-task-sync-owner-boundary.md)
removes that automatic writer, retains explicit owned local imports, and labels
outbound updates unavailable. It does not establish live retirement. Deferred audio-queue
retries can invoke TTS provider work. Calendar callbacks, Gmail Pub/Sub history,
Plaid webhooks, manual watch rotation, other clients and privileged Storage
writers remain independent. Do not turn this partial roster into a global stop.

Before a live window, retain the pre-guard baseline, resolve approved subjects
and shared-identity/cross-product FK/trigger dependencies, inventory endpoint and
bucket exclusivity, account for old workers and every writer/provider ambiguity,
install and validate matching artifacts in the approved order, and collect live
denial, continuity, byte stability and rollback receipts. The final owner
activation/cutover decision remains separate. Both readiness tools still block.

## Verification boundary

`npm run test:isolation:schedulers` exercises the four service lifecycles plus
their combined automatic-renewal behavior using fake timers, synthetic accounts
and deferred mocked requests. It is included in the isolated migration workflow
as well as the normal service-test gate. No test invokes Google, Plaid, hosted
Storage, live Auth or production SQL. Existing disposable database tests use
local PostgreSQL 16; this does not claim hosted PostgreSQL 17 verification.

Local verification for this continuation:

- Five lifecycle/integration files: **68/68 passed**.
- Full Vitest: **1,146 passed, 52 existing skips**; 105 passing files and three
  skipped files. No failed or cancelled tests.
- All Node migration/catalog/storage tests: **231/231 passed, zero skips**,
  including real disposable PostgreSQL integration.
- Actual app TypeScript and production build: passed (4,067 modules). Existing
  chunk-size and mixed static/dynamic-import warnings remain.
- Focused changed-service/test lint and whitespace checks: passed. Repository
  debt ratchets pass with 884 ESLint errors and 203 cohesion findings still
  recorded; this is not a debt-free claim.
- Independent combined-path review found no remaining actionable blocker in
  this bounded lifecycle change. It did not certify live drain or activation.
- Fence readiness: blocked / exit 2, all 34 local entrypoints wired and nine
  live activation gates remaining. Storage readiness: blocked / exit 2.

Hosted CI must be checked against the pushed commit separately; green results
on the continuation base do not certify a new head. No production database,
provider setting, credential, scheduler, or deployed client was changed.
