# Guarded storage ingress and exact migration-guard catalogs

Status: implementation and synthetic verification only. Draft PR #35 remains
unmerged and must not auto-deploy. No live policy installation, subject selection,
provider retirement, source freeze, data copy, or cutover is performed by this work.

## Application ingress

In an `owner-isolated` deployment, `PhotoService` sends upload/delete requests
only to `storage-photo`. The shared deployment retains its existing authenticated,
owner-prefixed direct private-bucket path so this draft cannot disrupt unrelated
users before a separately approved cutover. There is no cross-mode fallback or
automatic retry. Private read URL signing remains a Storage read operation. The
gateway is entrypoint 34 in the exact Edge manifest and uses the same non-expiring
admission lease as the other entrypoints. Authorization still verifies the caller
independently.

Uploads accept bounded JPEG, PNG, WebP or GIF bodies (10 MiB maximum), check magic
bytes, and generate an owner-prefixed UUID path server-side. Caller filenames,
foreign owners, overwrite/upsert, arbitrary buckets and arbitrary destinations
are not accepted. Deletes accept one validated current-owner photo path. The
isolated route has no direct-write fallback, automatic retry, or compensating
delete.

The handler consumes the full Storage mutation response and checks its returned
identity before reporting success. Transport failures, redirects, non-success
responses and malformed/ambiguous completion return a server failure, retaining
the outer lease for reconciliation. This is conservative request accounting,
not proof that a remote operation stopped when its response was lost.

## Manual direct-write policy boundary

`supabase/isolation/storage-write-gateway.sql` installs exactly three restrictive
policies on `storage.objects`: `mind_manual_gateway_insert`,
`mind_manual_gateway_update`, and `mind_manual_gateway_delete`. They deny new
`anon`/`authenticated` mutations involving `photos` or `voice-samples`, including
moving objects into or out of these buckets. Existing permissive policies cannot
override the restrictions. Reads and other buckets are not changed. A denied
DELETE can affect zero rows rather than return an authorization error; verify
unchanged objects, not merely an HTTP status.

This policy affects **all users of both buckets**, not only selected migration
subjects. A live release requires an authenticated bucket-exclusivity review and
an explicit old-client disruption/maintenance plan. There is no voice-sample
browser writer in the reviewed application; do not invent a bypass for one.

The artifact locks the control singleton through commit to serialize installation
with admission/transitions, and requires open control, zero admitted leases,
both private buckets, existing Storage RLS, and non-bypassing API roles. It is
install-once and transactional; it does not silently replace existing policies.
It is outside automatic migrations and is never invoked by the test/check tools.

## Why this does not prove a byte freeze

The upstream Storage implementation reviewed at commit
`3a37da57d3984e24eeb15e11e81f7f98879db25d` shows:

- [Ordinary upload](https://github.com/supabase/storage/blob/3a37da57d3984e24eeb15e11e81f7f98879db25d/src/storage/uploader.ts)
  authorizes before writing backend bytes; accepted work may finish later.
- [Signed REST upload](https://github.com/supabase/storage/blob/3a37da57d3984e24eeb15e11e81f7f98879db25d/src/http/routes/object/uploadSignedObject.ts)
  can use a previously issued token through a privileged path.
- [Resumable upload lifecycle](https://github.com/supabase/storage/blob/3a37da57d3984e24eeb15e11e81f7f98879db25d/src/http/routes/tus/lifecycle.ts)
  distinguishes normal and signed authorization; an expiry alone does not prove
  previously accepted backend work drained.
- [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)
  distinguishes user JWTs from generated access keys that bypass user RLS.
- [Copy, move and delete implementation](https://github.com/supabase/storage/blob/3a37da57d3984e24eeb15e11e81f7f98879db25d/src/storage/object.ts)
  crosses database and backend-byte boundaries; a database rollback is not a
  byte restoration receipt.

These are upstream source findings, **not verification of either hosted project's
current Storage version or active writers**. Service credentials and other
privileged writers remain outside user RLS. Inventory and retire/reconcile
historical signed, resumable, S3, service-role, older-worker and in-flight
copy/move/delete work before a live freeze claim. Zero app leases is insufficient.

## Exact catalog contract and baseline ownership

The business baseline continues to own the 13 allowlisted business functions and
32 physical public tables plus the safe view. It does not own migration guards.
The schema exporter now refuses a guarded source (before and after export), and
rejects guard content found in its dump. It never strips triggers or exports an
incomplete guard dependency graph. Retain a reviewed **pre-guard** business
baseline. A source with installed guards cannot regenerate that baseline with
this exporter; that requires a separately reviewed schema-export change.

The rollout dependency order, for a separately approved maintenance window, is:

1. Preserve/review the pre-guard baseline and restore it on the approved target.
2. Review both manual artifacts and their locally generated catalog reference;
   install the matching control schema and storage policy on both projects.
3. Deploy all reviewed Edge artifacts, including the photo gateway, before the
   matching client release. The policy-install-to-client-release gap is a
   maintenance interval: old direct writers will fail. Do not apply this order
   to a shared bucket without explicit disposition.
4. Revalidate exact source/target catalogs, deployed generations, private bucket
   scope, provider/old-writer retirement and live denial/rollback behavior.
5. Only after the remaining subject, identity, scheduler, provider and owner
   gates are resolved may a later approved freeze/cutover procedure run.

`scripts/lib/migration-guard-catalog.mjs` queries structural catalog facts in a
read-only transaction. A checked-in hash-only reference pins the two SQL
artifacts, scope and Edge manifests, query, private schema, relations, static
registries, functions, ACLs/owners, triggers and three Storage policies. Reference
generation is restricted to the disposable local test fixture and must be
reviewed with artifact changes; an operator-supplied golden is not accepted.

Operational control phase/time, selected subject IDs, and lease rows are not
structural catalog parity. They need separate live scope/drain evidence. The
contract does not ignore guard triggers or public function changes: normal
public-table fingerprints remain exact. Only the two exact guard RPC names are
accepted alongside the business manifest **after** guard validation succeeds.
Missing guards on both projects is failure, not parity. Unrelated managed
Storage policies are not pinned by this narrow guard contract.

Source preflight/export, storage copy, import package and pre/post target
validation, OAuth reset, quarantine, rollback-chain scope validation and deferred
sync evidence reject missing, stale or forged guard bindings. The import receipt
itself carries the exact guard binding so an older import/reset pair cannot
bypass downstream validation. No catalog match establishes a source freeze or creates deployment
authority. Privileged DDL remains an operator boundary.

## Local diagnostics and verification

```sh
npm run test:isolation:ingress
npm run test:isolation:subjects
npm run test:isolation:freeze
npm run supabase-storage:readiness
npm run supabase-freeze:readiness
```

Both readiness commands deliberately exit 2 with `status: blocked`. The storage
checker without arguments inspects source wiring and hashes. Its optional
paired `--subject-scope /absolute/private/scope.json` and
`--observations /absolute/private/observations.json` inputs check a strict v1
observation packet: exact subject/boundary binding, the fixed writer roster,
individual receipt hashes/status/count/times, lease observations and ordered
before/after byte-content observations. Inputs must be private regular files.

Malformed, stale, missing, contradictory, reused, differently scoped or
out-of-order observations cannot establish readiness. Even a fully consistent
packet retains `provider_review_unproven` and `owner_window` blockers,
`externalProvenanceVerified: false`, and false activation/freeze flags. Hashes
supplied by a caller are not independent provider attestation. This tool never
connects to a provider, accepts credentials, or executes a live change.

Tests use disposable local PostgreSQL with a private Unix socket/no TCP and
synthetic roles/objects, plus mocked auth/Storage transports. CI uses no live
credentials. Test success is implementation evidence only.

## Tranche verification receipt

Continuation base: `b34b86e427c5eb332b37debffc0b4e5ed5e901b6`, branch
`codex/scoped-migration-freeze`; canonical main rechecked at
`ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`. The final commit and exact-head
hosted check links belong to [draft PR #35](https://github.com/Liquidg10/bubble-whisper-stream/pull/35).

- Complete Node migration/tool tests: 231 passed, zero failed or skipped.
- Complete Vitest suite: 1,078 passed, 52 existing skips across 103 files.
- New focused coverage within those totals: 49 catalog, 30 storage policy/drain,
  11 baseline export, 113 gateway and 24 photo-client tests.
- App typecheck, production build, targeted lint and both debt ratchets pass.
  Existing debt is not eliminated: 884 ESLint errors, 203 cohesion findings,
  existing bundle-size/dynamic-import warnings and the 52 skipped tests remain.
- Independent review caught and closed the policy-install/admission race and
  legacy guard-binding gaps in downstream receipt consumers.
- Both readiness diagnostics remain blocked by design; no live freeze evidence
  or authorization was created. No production mutations or credential access.

Retired claim: a business baseline can be generated safely from a guarded source
by merely allowlisting its public tables. The exporter now refuses that state.
Readiness of this draft is not publication or a hosted integration test.
