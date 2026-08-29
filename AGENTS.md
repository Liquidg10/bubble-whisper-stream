# Mind Manual repository coordination

This repository may be worked by Codex, Claude, ChorOS automations, and humans at the same time. Follow this contract so parallel work stays attributable and releasable.

## Canonical state

- Treat `origin/main` and merged pull-request receipts as canonical. A handoff, patch queue, memory, or stale checkout is routing evidence, not current truth.
- Preserve a dirty or stale primary checkout. Make changes in a clean worktree created from freshly fetched `origin/main` on a narrowly named `codex/<scope>` branch.
- Before editing, record the base SHA and inspect open worktrees, branches, pull requests, and overlapping files.

## Ownership

- One branch owns one bounded tranche. State the files and behavior it owns before editing.
- Do not let two active tranches edit the same file. If overlap appears, designate one integration owner; the other tranche supplies a commit rather than copying patches by hand.
- Rebase or merge current `origin/main` before requesting integration, then rerun the tranche's focused gates.
- Generated state, local credentials, `.env*`, and `supabase/.temp/` never belong to a tranche.

## Truth and release boundaries

- A code path is not a capability without a reachable caller and a durable receipt from the system it claims to affect.
- Keep user decisions, local persistence, queued work, provider execution, and compensation receipts distinct in tests and handoffs.
- A clean build or merged pull request does not authorize database changes, provider mutations, deployment, publication, or branch deletion. Those require the release owner's explicit scope.
- Treat recalled ChorOS context as unverified until reconciled against source and current receipts.

## Required handoff

Every tranche reports:

- base SHA, branch, and final commit SHA;
- files and behavior changed;
- exact focused and release gates with pass/fail counts;
- migrations, provider actions, or production mutations performed (normally none);
- known inherited failures and remaining blockers;
- any capability claim intentionally retired because it lacked a reachable, receipt-backed implementation.

Do not describe an indeterminate, crashed, skipped, mocked, or local-only result as production proof.
