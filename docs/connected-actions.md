# Connected actions and quiet growth

September 7, 2026. Branch `codex/connected-actions`, base `18898464a067e18cc31bb9037fff475191e9db06`. The implementation worktree was refreshed from canonical main; the stale primary checkout and unrelated draft PR35 are preserved.

## Behavior

Tasks, reminders and events can explicitly help another task, depend on it, or have a tradeoff with it. One source stores the relationship; incoming views are derived. Self-links, duplicates and prerequisite cycles cannot be confirmed. Unavailable, malformed and future records remain reviewable data, with no resolved claim. Legacy outliner step dependencies keep their existing meaning.

Life connections distinguish support from tradeoff. Completing an action contributes to the areas the person chose; reopening reverses that contribution. These are counts of completed work, not estimates of health, worth or life outcomes. Dependency readiness follows saved task state and does not complete or reprioritize tasks automatically. Atomic connections can trace these distinct tasks with semantic labels and line patterns, alongside existing shared-task bonds. Keyboard focus moves to Clear trace and returns to Connections.

The compact Ideas control opens at most three local proposals without taking space from the canvas. Per-source automatic steps are off by default. Opted-in sources use unchecked notes only, pause for unresolved or unfinished prerequisites, and create at most one unfinished child while the bubble space is mounted. Generated children are never automatically enrolled. Source queues, strict metadata writes and saved child identities prevent duplicates in the current runtime and after reload. Undo saves a pause and dismissal before removing the automatic child. Concurrent writes from separate tabs or devices are not claimed transactional.

AI ideas require an explicit request and an authenticated, non-anonymous account. The request sends only the first 300 title characters and 4,000 note characters of the selected bubble to OpenAI. No other tasks, IDs, life connections or private context are sent. At most three validated ideas return for review; they do not create tasks. Closing Grow, changing sources or replacing a request cancels it, and changed-source results cannot be admitted. Local starting ideas remain explicitly local when the provider fails.

## Backend and release scope

The additive `ai-bubble-suggest` Edge function independently authenticates the user, retains gateway JWT verification, bounds request and response bytes, times out provider work, and has no tools, automatic retries, database writes or raw-content logging. It uses the existing `OPENAI_API_KEY` and existing model `gpt-4.1-2025-04-14`, with `store: false`. It is separate from the existing broad-context planning route.

The existing public backend is `ekekeywoxvdbfbmqyhjy`; the isolated fixture project is never a deployment target. Release only this new function before publishing the compatible frontend. No migrations, credentials, provider grants, account changes or data cutover belong to this tranche. Publication receipts must distinguish frontend/local persistence proof, deployed endpoint authentication, and a real authenticated provider response.

## Verification

Focused tests exercise malformed and future persistence, relationship cycles, completion/reopen, confirmed support/tradeoff effects, growth admission and undo, hook cancellation, strict AI input/output and authentication failures. Browser flows use fresh synthetic local records and blocked external traffic, with real IndexedDB readback, desktop and emulated touch, reload, keyboard use and accessibility checks. Production-build and public-release checks remain separate from provider execution. Final source hashes, exact counts, native deployment ID and endpoint version belong in the release receipt.

This continues the opt-in motion, stable controls and reviewed suggestions described in `molecule-interaction-research.md`. Participant testing, physical-device testing and fully spatial 3D remain separate future work.
