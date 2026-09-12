# PR35 owner migration reconciliation

Engineering preparation only. No source freeze, live export/import, Storage scope configuration, SQL installation, provider grant, migration, deployment or cutover was performed.

The repair worktree reconciles draft `c10501f316a487cba61adde4fce5cfccb4fa1ac7` with current main `af949cec0b273fb5df585cdcbdcebcc419c61850` through merge `b773d49`. Both `storage-photo` and `ai-bubble-suggest` retain JWT verification. All 35 manifest endpoints now have explicit owner, provider, scheduler or retired admission classification; this source check does not attest live deployments.

## Calendar ledger and original admission

The reviewed catalog now includes the private Calendar schema, all operation columns/constraints/indexes, private helpers, RPCs, privileges and fence triggers. Preflight explicitly queries `mind_manual_calendar.operations`; missing schema is a blocker, never an empty ledger. Source inventory is selected-owner only; the target inventories all private operations. Counts and complete-row hashes cross export, binary snapshot import and rollback revalidation. The private package retains the original identity, claim token, timestamps, outcomes and admission provenance; claim tokens receive credential-level file handling. Unresolved original operations independently block freezing, even if no Edge leases remain.

`calendar-operation-migration-provenance.sql` is an additive, manual install after the original Calendar registry and source fence. Existing operations retain NULL provenance, which means unknown. The scoped claim RPC verifies the current original lease tuple and stores it atomically with a new operation. Replay, read and finalization cannot rewrite that tuple or release its lease. The old unbound claim RPC loses service execution, so the SQL and Calendar handler form a coordinated release. Old unknown ownership/operation outcomes are not repaired by inference.

## Source and target ordering

The source requires the exact configured owner/object registry. Export rechecks that registry and actual fenced phase with no unresolved leases inside its repeatable-read snapshot. These checks supplement the approved maintenance and provider-drain receipts; they do not prove historical signed or privileged Storage writers are stopped.

The empty target cannot configure an Auth owner before that owner exists. Target preflight therefore recognizes exactly one staging state: no Auth users, an open control row, no subjects, no Edge leases and no Storage scope or assignment rows. Import locks and rechecks this state in its transaction, copies Auth/public/private rows, verifies every row hash and the approved Auth subject hash, then configures that exact private subject and Storage assignment list in the same transaction. A failure rolls back both copied data and configuration. Post-import and downstream reset/quarantine guards require exact configured scope. This code prepares a concrete future import; no such action was run.

## Storage and Plaid

Storage restrictive policies cover the selected actor, canonical owner folder, authoritative object owner metadata and exact bucket/path-hash legacy assignments. Existing policies govern unrelated users and objects. Manual configuration is immutable and serialized with admission and authorization; fresh exact scope assertions accompany source/target checks. Historical signed/resumable/S3/service writers still require separate provider evidence.

The repository now sets `plaid-webhook-handler.verify_jwt=false` because Plaid signs its body rather than supplying a Supabase JWT; this setting must deploy together with the verified handler. Plaid verifies the bounded raw webhook body before item-owner lookup or admission. It performs awaited owner-bound sync in-process, uses Vault-only token resolution, and binds terminal status to the exact delivery claim. The manual Plaid SQL must precede the new handlers. Legacy plaintext/Vault pointer disagreements require private operator disposition; there is no plaintext fallback, guessed ownership, automatic token migration or provider activation. Finite transaction snapshots are retained; this is not a cursor/removal synchronization release.

## Later owner gates

- Confirm the private owner Auth UUID and every ambiguous legacy assignment; the one-owner-only policy is already settled.
- Decide shared Auth/FK consequences and unresolved historical-operation disposition using private evidence.
- Review the exact source/target artifact installs, endpoint/runtime versions, provider/historical writer retirement, maintenance window, denial/continuity/byte-stability canaries and rollback plan.
- Authorize the concrete migration/cutover only after those receipts exist. Readiness remains blocked and no activation/freeze flag can be set by local tests.

Local checks: all 466 Node migration/tool tests passed with no skips, including disposable PostgreSQL coverage. Full Vitest passed 3,024 tests, with 52 inherited skips. The focused security suite passed 504 tests. App typecheck, production build, both debt ratchets, whitespace checks and Deno checks of all six affected Edge entrypoints passed. ESLint retains 847 inherited errors and cohesion retains 162 findings; passing ratchets does not mean zero debt.

Both source-fence and Storage readiness commands intentionally exit 2 / BLOCKED. Source admission is classified for 35/35 endpoints; activation and source-freeze flags remain false. Exact commit and hosted-CI receipts are recorded in the PR description after integration. Synthetic database/Vault fixtures and mocked provider requests are not live provider, encryption or migration proof.
