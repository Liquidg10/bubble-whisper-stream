# Mind Manual full-closure implementation order

Date frozen: 2026-08-29  
Canonical source at freeze: `origin/main@5d631cf628d5691d3a4aa1c771456cf3d749812a`

This is the dependency order for closing the original ten-item passoff. It is
deliberately not the old numeric order: provider ingestion and project cutover
must sit behind the safety contracts and a green build.

## Ordered release train

1. **Freeze and isolate.** Record Git, Supabase, Lovable, Google, and ChorOS
   baselines; work only in current-main worktrees; leave stale/dirty checkouts
   untouched.
2. **Close safety contracts.** Land Unit 2 local-phone redaction, Unit 4
   tighten-only first-recipient behavior, the Plaid browser privilege boundary,
   and the two Supabase Auth warnings.
3. **Finish Calendar trust.** Correct the gate entity contract, replace
   hard-coded trust inputs, require explicit intent, fail closed, wire real
   cross-device sync, and add the bounded calibration path.
4. **Replace Gmail watch.** Use Google Pub/Sub push envelopes with verified
   ownership, durable history cursors, replay/idempotency protection, renew, and
   stop behavior. Preserve compose idempotency receipts.
5. **Productize the reusable core.** Package Decision Trace, Action Confidence
   Gate, and deterministic Reframe as internal ChorOS workspace packages. Wire
   them behind existing tighten-only ceilings and a kill switch.
6. **Reconcile operational drift.** Preserve the historical migration ledger,
   generate a current live-schema baseline instead of rewriting history, and
   resolve CI/branch state using ancestry receipts.
7. **Prove the combined candidate.** Run targeted unit suites, app TypeScript,
   production build, bounded legacy suites, Edge/Deno checks, security checks,
   and signed-out/signed-in browser flows. Heavy sandbox-only failures remain
   separately labelled; they do not become application passes.
8. **Merge and deploy the current project.** Merge in dependency order, apply
   migrations, deploy functions, publish Lovable, and run reversible provider
   canaries with durable receipts.
9. **Split Supabase last.** Export only Mind Manual objects, provision an
   isolated project in the existing region, apply the generated baseline,
   transfer configuration/secrets without printing them, redeploy functions,
   update OAuth redirects, and cut the app over only after parity checks.
10. **Close and clean.** Re-run production checks, remove only conclusively
    merged/superseded remote branches, and publish the final state inventory.

## Original queue mapping

| Original item | Resolution in this train |
| --- | --- |
| #1 ship queue | Selected safety units already shipped; remaining Units 2/4 are step 2 |
| #2 `userAction` semantics | Merged in PR #26; retained as a regression gate |
| #3 Calendar A -> B -> C, then D | Step 3 |
| #4 ChorOS gate wiring | Step 5 |
| #5 packaging / Phase-1 carve | Step 5 |
| #6 whole-app disposition | Revived whole app; release candidate, not reference-only |
| #7 Plaid A/B/C + Auth toggles | Steps 2 and 9 |
| #8 branch/CI triage | Steps 6 and 10 |
| #9 coordination protocol | Steps 1 and 10, documented in the release receipts |
| #10 Supabase split | Step 9, intentionally after the candidate is green |

## Release invariants

- No provider success is inferred from code or HTTP availability.
- No automatic external write is allowed when intent, entity completeness, or
  trust evidence is missing.
- No Plaid access token is readable by `anon` or `authenticated` browser roles.
- No migration-history repair is used to hide the legacy ledger mismatch.
- No commerce table or data is copied into the isolated Mind Manual project.
- No production cutover occurs without a reversible rollback value and a
  post-cutover signed-in receipt.
