# Owner-scoped Edge admission — draft Stage B

Status: local implementation and automated tests only, on draft PR35. No remote
SQL installation, owner selection, credential update, provider action, deployment,
merge, or migration activation is authorized by this receipt.

## Scope and ownership

This continuation starts from `226b0b9ae8707a77ed3b5e0ca17726b59abda5f7`, with
canonical frontend main `6f48ebf695a52660a131cbb788ef78b8fdd54da2` already integrated.
It replaces the remaining global Calendar/Gmail/scheduler wrappers, preserving
unrelated-user work while fencing only the immutable selected owner.

| Entry point | Authoritative owner | Work lifetime |
| --- | --- | --- |
| `calendar-sync` | Verified Auth UUID, or exact internal service bearer and account row | Closed operation enum before credentials; owner-filtered account/token/events/status writes; uncertain completion retains lease |
| `calendar-watch` | Verified Auth UUID/internal account row, or HMAC-verified active channel/resource row | Exact tuple rechecked after admission; child sync, channel persistence and previous-channel stop are included |
| `gmail-watch` | Verified Auth UUID/internal account row, or Google OIDC then exact active subscription/mailbox row | Exact watch revalidation plus owner/account/mailbox/subscription/generation-bound database receipt calls |
| `watch-renewal-cron` | Service-only bounded discovery of authoritative watch rows | Each row is separately admitted and revalidated; one child call plus checked durable receipt; blocked owner does not stop unrelated rows |

Calendar request parsing is limited to 128 KiB, Gmail to 64 KiB; both snapshot
chunks immediately and cap chunk count and whole-body read time. Unknown control
operations cannot reach token refresh or provider work. Provider error bodies,
credentials, and raw private payloads are not returned in failure messages.

The scheduler discovers at most 101 rows per provider, processes at most 100,
and reports whether additional eligible rows exist. It does not claim globally
drained providers or guarantee fairness when the oldest batch remains blocked.
Retained leases and unresolved provider work still require explicit reconciliation.

## Gmail database boundary

`20260901000001_scope_gmail_pubsub_admission.sql` adds scoped claim/completion
RPCs. They lock the exact admitted watch tuple before entering the existing
receipt implementation; completion additionally binds the delivery attempt.
A reclaimed delivery cannot be completed by its original worker, and a late
success cannot reactivate a stopped or renewed watch. Failed completion remains
possible after that same watch is marked `resync_required`.

The migration revokes direct service execution of both old unbound RPCs.
Therefore **this is a coordinated database/runtime release**, not an additive
SQL-only hotfix: old versions fail closed once the migration is installed.
All participating versions, stop/drain evidence, rollback and the private owner
must be approved before any live rollout. The generated TypeScript declarations
describe this draft schema; they are not a live introspection receipt.
The isolated-target function manifest and post-schema hardening preserve these
same ACLs; hardening is tested against seeded unsafe legacy grants so it cannot
silently reopen an unscoped route.

## Local classification and evidence

The source inspector now reports 27 bearer, 3 mixed, 1 per-row scheduler and
2 retired entrypoints: 33 of 34 source paths are locally covered. The remaining
legacy-global path is `plaid-webhook-handler`. Supporting resolver/factory source
hashes accompany the structural entrypoint checks. These checks are not a
complete transitive call-graph proof or evidence of deployed source provenance.

`npm run test:isolation:edge-scopes` runs all hosted security suites, including
actual Calendar handler tests and executable Gmail/scheduler contract tests.
`npm run test:isolation:gmail-receipts` applies the canonical Gmail base migration
and new scoped migration to a disposable socket-only PostgreSQL cluster, then
tests owner mismatches, stale attempts, replay, concurrent claims and permissions.
Neither test accepts a live database URL. Both gates run in hosted CI.

Final local verification for this tranche:

- Full Vitest: 2,629 passed, 52 inherited skips; 141 passing files and 3 skipped.
- Security/Edge scope gate: 396 passed; Gmail disposable PostgreSQL: 30 passed,
  including actual lock barriers and non-superuser function-owner execution.
- Source fence: 18 PostgreSQL and 87 runtime/source tests; subject chain: 182.
- Storage/catalog: 90 Node/PostgreSQL and 152 runtime tests.
- Calendar task sync: 853; recorded Calendar recovery: 332; browser scheduler
  lifecycle: 68; deferred-sync evidence: 3 Node and 6 runtime tests.
- Deno: all four changed entrypoints and the Plaid verifier typechecked;
  Gmail protocol/resolver tests: 12 passed.
- Application `tsconfig.app.json`: clean; production build: passed with existing
  chunking warnings; lint ratchet: passed (859 current errors against 1,077
  inherited errors, not a claim of a lint-clean repository).

These suites overlap; their counts must not be added into a unique test total.

The standalone Plaid verifier is also locally implemented and tested: production
key endpoint only, ES256/P-256, exact raw-byte SHA-256, five-minute JWT age,
bounded key response and five-second fetch/body deadline. It is intentionally
**not connected to the webhook yet**. It does not resolve an owner, persist a
delivery, authorize a child call, or prove production webhook operation.

## Still blocked

- Plaid requires one atomic webhook/child/credential/receipt tranche. Source
  still disagrees on plaintext tokens versus `access_token_secret_id`; the
  advertised Vault RPC definitions are absent from tracked migrations.
- Owner-only Storage protection must replace the current whole-bucket direct
  write denial without exposing selected or explicitly assigned legacy objects.
- The private Calendar operation ledger needs migration/rollback coverage.
- The private approved owner Auth UUID, live schema/catalog parity, provider
  credentials and retirement of old workers remain unverified or unconfigured.

Readiness remains `blocked`, `eligibleForActivation: false`, and
`sourceWriteFreezeConfirmed: false`. Green tests are not deployment or migration
approval, and no private subject is chosen from an email address.
