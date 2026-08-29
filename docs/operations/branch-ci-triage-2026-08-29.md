# Branch and CI triage

Captured from `origin/main@5d631cf628d5691d3a4aa1c771456cf3d749812a`
and GitHub PR receipts on 2026-08-29.

## Remote retirement set

Nineteen branches are direct ancestors of `origin/main` and carry no unique
commit history:

```text
codex/acceptance-telemetry-contract
codex/add-memory-bubble-with-image-uri
codex/ai-native-domain-links-v0.1
codex/calendar-oauth-linkage
codex/calendar-oauth-same-tab
codex/canonical-task-contract-v0.1
codex/completion-plumbing-v0.1
codex/create-modules-for-time-horizons-and-functions
codex/fix-canary-dashboard-types
codex/interaction-geometry-v0.1
codex/mind-manual-safety-subset
codex/p1-wp02-browser-dependency-audit
codex/p1-wp03a-onboarding-at-repair
codex/p1-wp03b-capacity-aware-density
codex/startup-runtime-hygiene-v0.1
codex/update-bubblecard-component-image-handling
codex/update-bubblecard-component-styling
copilot/fix-main-unprotect-error
revive-and-fixes-2026-07-14
```

Two more branches are not ancestry-merged because their PRs used a
non-ancestry merge shape, but GitHub records them as merged:

- `codex/ci-gate-hygiene-main` — PR #14, merged
- `punch-list-2026-07-03` — PR #10, merged

Five branches belong to deliberately closed, superseded PRs and remain
retrievable through those PR refs:

- `codex/ci-gate-hygiene-on-adaptive` — PR #13; superseded by #14/#12
- `codex/add-logger-utility-and-replace-console.logs` — PR #7, closed
- `codex/add-timehorizon-enum-and-refactor-usage` — PR #6, closed; canonical
  task contract supersedes this type-only refactor
- `codex/move-utilities-to-atomichelpers.ts` — PR #8, closed
- `codex/update-img-onerror-logging-and-fallback` — PR #3, closed; PR #4 and
  subsequent BubbleCard work supersede it

All 26 are safe to remove from the remote after the full-closure PR is merged.
Local branches and existing user worktrees are intentionally preserved.

## CI disposition

- Release jobs retain least-privilege `contents: read` permissions.
- Checkout, Node setup, and artifact upload use current major v7 actions.
- The runtime is Node 24, satisfying Vite 8's supported engine range.
- Dependency installation remains deterministic through committed
  `package-lock.json` plus `npm ci`.
- Current-route browser and bounded accessibility jobs remain independent, so
  either surface can block release with its own artifacts.
- Scheduled Calendar watch renewal retains a five-minute timeout, serialized
  concurrency, secret-presence gate, and structured failure receipt.
