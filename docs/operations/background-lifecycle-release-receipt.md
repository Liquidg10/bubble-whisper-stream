# Background lifecycle release tranche

Date: 2026-08-30. Base: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
Branch: `codex/release-background-lifecycle`. Final code SHA is the commit containing this receipt; the pull request and merge record are the integration receipt.

## Scope and ownership

This tranche extracts only the four lifecycle services and five regression files from reviewed draft commit `5959646b0de88304110f9042bd75f1ee3d604d14`, plus a focused package script. Independent review verified those nine files exactly match that source. The existing normal unit CI already includes them.

- OAuth background startup/shutdown is idempotent and generation-bound.
- Refreshes and watch renewals coalesce concurrent work and retain admitted-account bookkeeping across stop/restart.
- Late asynchronous scans cannot dispatch work after their generation stops.
- Watch-health automatic maintenance uses the shared renewal coordinator.
- Uncertain provider responses hold automatic retries for this browser session; provider credentials are not accepted as refresh receipts or logged.

No SQL, Edge handler, storage gateway, provider scope, environment configuration or migration workflow is changed. Draft PR35's always-enforced migration controls and photo ingress are deliberately excluded.

## Validation before integration

- Foreground dependency install: successful, audit reports zero vulnerabilities.
- Focused scheduler regression: **68/68**, 5 files.
- Normal bounded unit gate: **481/481**, 55 files.
- Full Vitest: **960 passed, 52 inherited skips**, 101 passed files and 3 skipped files.
- App TypeScript, production build, whitespace check: successful.
- ESLint debt ratchet: **884 current / 1077 inherited baseline**, no increased buckets.
- Assistant cohesion ratchet: **203 / 203**, no increased buckets.
- Independent response-contract review: existing Calendar/Gmail watch handlers return `success: true`; refresh returns matching account ID and expiry.

Hosted exact-head quality/accessibility and current-UI checks must pass before merge; main-push checks must pass afterward. Build retains inherited bundle-size/dynamic-import warnings. No claim is made that inherited skipped tests ran.

## Explicit limits

These are session-local lifecycle protections, not durable provider reconciliation, cross-tab exclusion, auth-owner isolation, or proof that all writers have drained. Existing App mount behavior is unchanged. The explicit 410 recovery helper remains a separate operator path and is not claimed as a reachable user feature. No production database, provider credentials, permission grants, calendar data, scheduler settings or cutover state were changed during preparation. Publication is a separate release step after merged-source verification.
