# Owner-only migration policy enforcement

Local implementation after the owner's 2026-08-30 decision to migrate only
their own account. This policy is not a freeze, data-transfer, credential,
publication, or cutover authorization.

Branch: `codex/owner-only-migration-enforcement`.
Integration base: `70b7f44233e6a06ed4383876715918695e0c027b`, the normal merge of
canonical `9205e18456b3a0e58d385ff75189b1ebbba4f2e9` and still-draft PR35 at
`14aa7cb3bbb17f191b873fe43ea4076b96e0797b`. The PR35 merge exists only in this
isolated local integration branch, not canonical main.

## Enforced contract

- `validateSubjectScope` accepts exactly one canonical selected Auth UUID.
  `validateSubjectScopeBinding` accepts exactly `subjectCount: 1`. These shared
  checks have no flag, environment override, or permissive legacy mode.
- Zero, multiple, duplicate, malformed, and missing subjects are rejected; a
  former batch is never silently narrowed to its first member. Old `ready`,
  `exported_not_imported`, imported, planned, verified, and prepared-recovery
  receipts do not override the one-account policy.
- The existing source/target identity, full scope hash, subject hash, legacy
  assignment hash, private scope-file hash, row predicates, and unfiltered
  target rejection remain mandatory. Cardinality alone does not prove that the
  selected UUID is the owner: private identity verification remains a gate.
- Explicit legacy assignments to an unselected owner remain valid exclusion
  tombstones. Only `subjectIds` selects the migrated account. Neither a sole
  selected account nor a legacy path implies ownership.
- `privateScopedReceiptSnapshot` reads through one non-symlink private regular
  file descriptor, validates scope from those bytes, and retains the same
  detached parsed value and SHA-256. Credentials, raw identifiers, file content,
  and underlying JSON/OS errors are not included in the fixed diagnostics.
- Reset recovery rechecks that receipt's exact bytes and hash after acquiring
  the target lock. The early policy check must not permit a stale prepared
  snapshot to overwrite a newer completed receipt. Changed input is rejected
  before database access and the newly acquired lock is released.

## Reachable command boundaries

| Boundary | Owner-policy check before work |
| --- | --- |
| Source/target preflight | Private scope and optional comparison receipt before linked configuration, database, or provider inventory. |
| Export | Private scope, source receipt, and Auth decision before creating an output package or running fresh preflight/COPY. |
| Import | Embedded private scope before reading the receipt chain; each linked receipt before staging output, binary payloads, target credentials, or preflight. |
| Storage plan/copy/revalidation | Scope, source receipt, and plan/comparison receipt before credentials or network/object-byte access. |
| OAuth reset/recovery | Source/import and any existing prepared-recovery receipt before credentials, target lock, or target database work. |
| Provider quarantine | Import and OAuth-reset receipts before target credentials or database work. |
| Rollback preparation | Private scope and each scoped producer receipt before producing a cutover token; packaged scope and exact chain checks remain mandatory. The canary retains its own separate schema. |
| Deferred-sync verification | Every scoped source/import/storage/reset/quarantine receipt before credentials, database, HTTP probes, or service-test execution. |
| Storage readiness input | The same private scope loader; readiness still cannot authorize activation. |

## Verification

Tests use synthetic users/files, offline HTTP transport, and disposable local
PostgreSQL clusters. No production rows, private operator manifest, linked
database, provider credential, or real object bytes are used.

```sh
npm ci
npm run test:isolation:subjects
node --test scripts/__tests__/owner-only-migration-entrypoints.test.mjs
node --test --test-concurrency=1 scripts/__tests__/*.test.mjs
node scripts/reset-isolated-supabase-oauth-credentials.mjs --self-test
npm run typecheck
```

The dedicated entrypoint regressions invoke the real operator commands with
synthetic stale batch inputs and blocked external ports. They require the
specific owner-only rejection, not an arbitrary earlier error. Private-file
tests separately cover exact bytes/hash snapshots, symlink rejection, file
permissions, and content-free diagnostics. Existing real PostgreSQL tests cover
unselected-user continuity, strict target contents, binary COPY rollback, and
the same locked transaction guards used by downstream commands.

Local results on this implementation:

- Fresh foreground dependency install completed; package audit reported zero
  vulnerabilities at that install, not a production security assessment.
- Existing subject gate: 127 passed, zero failed/skipped. Added real-command
  entrypoint file: 55 passed, zero failed/skipped. That file is now included in
  the explicit `test:isolation:subjects` command used by draft CI.
- Full Node suite with sequential test files: 378 passed across 21 suites,
  zero failed/skipped, including all disposable PostgreSQL gates.
- Actual app TypeScript check, targeted script ESLint, OAuth-reset offline
  self-test, and Git whitespace check passed.
- The first all-files parallel attempt failed to initialize temporary databases
  because the host disk was full. The sequential rerun passed; that first
  attempt is not counted as application failure or successful database proof.
- Independent review found and closed the reset-receipt replacement race;
  the real-command regression replaces the prepared path at lock acquisition
  using synthetic-only values, preserves the newer receipt, and proves rejection
  occurs before database access. No review blocker remains in this tranche.

## Still separate and blocked

This tranche does not change Edge admission, guard SQL, Storage policies,
frontend binding, provider routing, or any activation gate. In particular:

- Draft PR35 still pauses all 34 Edge functions and restricts direct writes to
  both Storage buckets for all browser users; selected database row fencing
  does not make those wider effects account-specific.
- The public frontend still has one deployment-wide backend. Do not redirect
  other users to the one-account target. An owner-specific frontend/origin and
  its Auth/OAuth/session boundaries require separate implementation and proof.
- Existing shared Gmail delivery, Calendar renewals, and other source callbacks
  must not be repointed or retired merely because one account is copied.
- Calendar's new private operation ledger still requires explicit migration
  scope, guard/drain, export/import, rollback, privacy, and original-lease
  reconciliation design. It is not silently added to the old public allowlist.
- The exact owner UUID, legacy-object ownership, shared Auth/commerce effects,
  runtime/writer retirement, denial/byte-stability canaries, maintenance scope,
  rollback, and final action-time cutover authority remain unverified here.

No database installation, source freeze, provider mutation, data transfer,
deployment, publication, or external write is part of this implementation.
