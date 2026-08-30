# Default-off reviewed Calendar update release

Date: 2026-08-30. Preparation base: merged Calendar recovery `f9c13d3c2464a317980e85eb9d1f15feb4b25ba9`. Final integration base: merged optional configuration `e855fb61d92f7310076d510155a0ebe26b09cd0c`.
Branch: `codex/release-calendar-reviewed-updates`. Final code SHA is the commit containing this receipt; the pull request and merge record establish the integration SHA.

## Independent release boundary

This tranche extracts the reviewed outbound workflow from `e3a6eaf15098e1e64cafaec96541f09ad0cf9403` and integrates the separately reviewed outcome-inventory commit `384178c1def16f9dfb383df47c4a91395c67c029`, without PR35's always-enforced migration wrapper, database controls or photo gateway. The Calendar entrypoint keeps its existing authenticated `serve(handler)` boundary. Only new imports and reviewed-action routing are added before legacy handling.

One draft-only migration-lease integration test is deliberately not extracted; it remains in PR35 with its dependency. The standalone server suite has 128 tests rather than 129. This release makes **no migration lease, global drain, source freeze or cross-device exactly-once claim**.

## Reachable behavior

Calendar → Sync Management → Updates lets the signed-in owner explicitly refresh eligible saved links, inspect the seven current/proposed fields and exact task/account/event references, then confirm one reviewed update or cancel. Nothing dispatches on mount, timer, import or normal synchronization.

The server remains OFF unless `CALENDAR_REVIEWED_UPDATES_ENABLED` is exactly `true`. Existing OAuth requests remain `calendar.readonly`. No setting, credential, scope or grant changes are included. The new path independently rejects internal callers and verifies the owned account, token and existing cache row. It requires an unexpired explicit write grant; an inferred primary calendar is not accepted.

Only confirmed, organizer-owned, guest-free, nonrecurring timed events up to 24 hours are supported. One bounded GET review precedes at most one conditional PATCH of title, description, location and start/end instants; named zones stay unchanged. No event creation/deletion, guest-array update, token refresh or provider retry is added.

Before dispatch the client durably records a minimal pending receipt. Lost, malformed, stale-generation or cache-uncertain completion remains held across reloads. Provider success is not relabeled unwritten when cache persistence fails. These v1 receipts contain no frozen intent digest or server idempotency attestation: current matching Google values cannot clear an old hold.

The new Outcomes tab explicitly inventories every active-owner browser-journal hold, independent of missing tasks or malformed separate mapping state. A separately typed GET-only observation can show current supported Google event values using read-capable permission. It does not change the journal, cache, task or mapping, and cannot clear/reset/retry a hold. Unavailable inventory is not zero. The real browser lost-response fixture verifies that even matching current fields leave every saved record unchanged. Operation-attested proof-backed recovery remains future work.

## Verification and release procedure

- Independent extraction/security and new outcome reviews passed; final focused Calendar gate: **844/844**, 19 files.
- Actual app TypeScript and actual Calendar Edge entrypoint Deno checks passed.
- Production build and both debt ratchets passed; inherited 861 ESLint errors, 203 cohesion findings and bundle warnings remain.
- Full application suite: **1,804 passed, 52 inherited skips**, 120 passed files / 3 skipped files.
- Bounded unit gate: **1,193/1,193**, 69 files. Current-main Node tool contracts: **45/45**, including 42 optional-configuration cases.
- Built-app current UI: **15/15**; real browser storage/coordination: **7/7**; accessibility: **14/14**.
- Browser-verification helper CLI was unavailable; repository Playwright gates provided built-app evidence. Final live UI inspection remains a release step, not a substitute for provider proof.
- Before merge, rebase current main and wait for both exact-head hosted checks; verify both main-push checks afterward.

Fresh read-only production baseline: `calendar-sync` v30, JWT verification true, activation flag absent. The downloaded entrypoint and its two local dependencies are byte-identical to canonical main. Deployment, if performed, must preserve JWT verification and the absent flag, publish only the verified merged source, and download/compare the deployed source again. This is deployment evidence, not a granted Calendar write capability or a provider canary.

No migration, source-data copy, scheduler change, Google event mutation, credential update, permission grant or activation occurred during preparation. The isolated backend cutover remains separate and owner-gated.
