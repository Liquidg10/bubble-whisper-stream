# Mind Manual full-closure state inventory

Date: 2026-08-29  
Candidate branch: `codex/full-closure-ops`  
Base: `origin/main@5d631cf628d5691d3a4aa1c771456cf3d749812a`

This inventory separates implemented software, production evidence, deliberate
deferrals, and owner-gated infrastructure. A green build is not treated as a
provider canary or a completed cutover.

## Release candidate result

The current candidate is software-ready for pull-request review:

- fresh foreground `npm ci`: complete; 472 packages audited, 0 vulnerabilities;
- application TypeScript: pass using `tsconfig.app.json`;
- full Vitest: 93 files passed, 3 existing files skipped; 856 passed and 52
  existing skipped assertions; 0 failures;
- bounded pull-request Vitest gate: 47 files and 377 assertions passed;
- Edge/Deno: 11 changed entrypoints checked; 38 assertions passed;
- production build: pass, 4,066 modules;
- current Chromium route gate: 9/9 passed;
- bounded Chromium accessibility gate: 14/14 passed;
- ESLint ratchet: pass, 884 findings versus the inherited 1,077 ceiling;
- assistant-cohesion ratchet: pass, 203 findings at the inherited 203 ceiling;
- dependency audit and diff check: pass.

The build still reports inherited large-chunk and ineffective-dynamic-import
warnings. The current main bundle is about 905 kB gzip. Those warnings are not
hidden or counted as resolved performance work.

## Original ten-item disposition

| Item | Current disposition | Evidence boundary |
| --- | --- | --- |
| #1 Ship queue | **Implemented in candidate** | Local-phone redaction, tighten-only first-recipient handling, authorization boundaries, and release gates are executable. Production deployment remains below. |
| #2 `userAction` semantics | **Merged and regression-covered** | Canonical acceptance outcomes are written and read through the same contract. |
| #3 Calendar A -> B -> C -> D | **Implemented; production read-only flow previously proven** | Entity shape, explicit intent, trust calibration, token-free same-tab callback, encrypted persistence, bounded sync, and watch flow are covered. This is not Calendar write parity. |
| #4 ChorOS gate wiring | **PR open** | Private Decision Trace, Action Confidence Gate, and deterministic Reframe packages are in AgentOS PR #1041 behind disabled flags and a kill switch. Merge requires green CI. |
| #5 Phase-1 package carve | **PR open** | Same PR and package tests; no public registry publication or default activation is claimed. |
| #6 Whole-app disposition | **Revived release candidate** | Build, full test inventory, current browser routes, and accessibility gates are green. |
| #7 Plaid + Auth | **Implemented; Auth toggles already live** | Plaid browser roles lose credential access; metadata view remains owner-scoped. HIBP and one-hour OTP settings were previously verified live. Migration still awaits this release. |
| #8 Branch/CI triage | **Prepared** | Current CI actions and Node runtime are committed; 26 merged/superseded remote branches have a receipt-backed retirement set for after merge. Local worktrees remain untouched. |
| #9 Coordination protocol | **Applied** | Clean current-main worktrees, atomic commits, independent gates, and ChorOS receipts were used. |
| #10 Supabase split | **Toolkit complete; owner-gated** | Exact schema/data/Auth/storage manifests, provider quarantine, canaries, and hash-linked rollback tooling exist. No project has been created and no data copied. |

## Security and provider changes in the candidate

### Ready to deploy

- Generic Google OAuth is authenticated, owner-bound, exact-origin, and
  metadata-only at the browser boundary.
- OAuth credentials accept only strict AES-GCM `oauth:v1` envelopes. Browser
  CRUD and token-column reads are revoked; state consumption is service-only
  and single-use.
- The old generic exchange and unauthenticated global scope-decay paths return
  `410 Gone` instead of retaining compatibility bypasses.
- Gmail compose, sync, refresh, revoke, and watch resolve one owned account on
  the server and never return credentials.
- Gmail watch uses Google Pub/Sub with verified OIDC identity, exact audience
  and subscription binding, durable numeric history cursors, leases,
  idempotency, replay handling, and fail-visible history gaps.
- Plaid credentials are unavailable to browser roles while the owner-scoped
  safe metadata view and narrow deactivate operation remain.
- Cross-device prototype flags are release-locked off. Mock collaboration and
  conflict surfaces are removed; the dormant tables have an exact privilege,
  policy, and Realtime-removal migration.

### Not yet production-proven

- The Gmail Pub/Sub tables, RPCs, function versions, Google topic/IAM/push
  subscription, and real mailbox delivery canary have not been deployed.
- The OAuth/Plaid/cross-device migrations in this candidate have not been
  applied to production.
- The integrated frontend has not yet replaced the published Lovable SHA.
- The isolated Supabase project does not exist.

## Deliberate deferrals

- **Cross-device sync:** deferred until the owner chooses device-only pairing,
  an owner recovery secret, or explicitly consented server escrow. Reopening
  also requires two-device apply, revocation, rotation, conflict, and durable
  receipt proof.
- **Legacy browser diagnostics:** 112 historical Playwright cases remain in a
  separately named diagnostic project because they target removed routes,
  selectors, or unimplemented claims. They are visible but are not release
  evidence. Current release evidence is the 9-case route gate plus the bounded
  accessibility suite.
- **Browser flows without a current product contract:** reminder notification,
  monthly review, offline banner, semantic-result journey, plugin lifecycle,
  voice retry/recovery UI, and a real biometric ceremony remain explicit gaps,
  not simulated passes.

## Production execution order

1. Push this candidate and require both repository workflows to pass on the
   exact PR SHA.
2. Merge the green PR and publish that exact frontend candidate.
3. Deploy strict OAuth/Gmail consumers and tombstones in the documented order.
4. Apply only the reviewed Gmail, OAuth, Plaid, and cross-device migrations;
   do not blanket-push the divergent historical ledger.
5. Deploy authenticated Gmail Pub/Sub watch, configure Google topic/IAM/push
   identity, and run unsigned, wrong-audience, real-delivery, replay, renewal,
   history-gap, and stop canaries.
6. Re-run Calendar and Gmail signed-in owner/cross-user canaries, then require
   the isolated-project source preflight to report `READY` with zero blockers.
7. Stop at **Owner Gate A** immediately before creating the billable Supabase
   project. Present organization, region, final name, recurring cost/plan, and
   database-password secret-store destination.
8. After explicit confirmation, create/configure the target, migrate the one
   Auth identity plus scoped data/storage, quarantine provider state, rebind
   providers, and generate parity/canary/rollback receipts.
9. Stop at **Owner Gate B** immediately before changing Lovable's Supabase URL
   and publishable key or moving final callbacks. Require the exact
   `CUTOVER:<target-ref>:<rollback-prefix>` confirmation token.
10. After cutover proof, delete only the documented merged/superseded remote
    branches and publish the final production receipt.

## Stop rules

- Never expose or log provider tokens, project secrets, or the database
  password in a receipt.
- Never weaken the strict token-envelope checks to make a migration pass.
- Never advertise Gmail push or cross-device sync without real provider/device
  receipts.
- Never treat an HTTP 200, deployment, test, or feature flag as delivery or
  customer proof.
- Preserve the current production rollback values until the observation window
  closes.
