# Molecule interaction polish

Continuation of the deployed living-molecules release, September 6, 2026 (America/Chicago). Base: `6deb10fbdfe5d84e1b7b88a05d3064edd46635fd`; branch: `codex/molecule-interaction-polish`. The existing clean implementation worktree was reused, preserving the stale primary checkout and unrelated Supabase state. The PR and release receipt record the final commit and publication.

## Behavior

Atomic drag release now uses the final pointer position, including a release that arrives without another move event. The visible target names Today, Week or Later before release. Escape, Cancel move, pointer cancellation and lost capture end a drag without saving it; the trailing native click is suppressed so cancelling does not open the task. A new pointer interaction remains usable. The Tasks navigator supports search and fits the available canvas height.

Horizon changes use the latest canonical bubble and await the existing strict storage write. A task is marked as saving across all its linked particles; additional moves on that task are blocked until the write settles. Success and Undo appear after persistence. A rejected move or Undo restores the previous shell and provides failure feedback. The change is scoped to AtomicView; the global store API and provider behavior are unchanged. Same-orbit placement and nucleus positions now use the separate browser layout contract described in `saved-spatial-layouts.md`.

Life connections offers a searchable choice of existing confirmed areas and starter areas. Reusing or typing a known label retains its existing area ID, including imported punctuation. Renamed labels remain searchable aliases. Pending suggestions do not become reusable custom areas, and a new link does not copy another bubble's reason or role. Ambiguous names require an explicit choice with distinct visible and accessible labels. Hover contrast in the touched editor uses matched foreground and muted-surface colors.

Grow accepts captured thoughts as well as unfinished tasks. A reviewed addition creates a separate task and retains the original thought. Unfinished checklists in notes take precedence over lists in captured text; checked copies suppress stale unchecked copies. Drafts distinguish the person's own notes from local templates. Admission, durable dismissal, deduplication, retry, undo and source/child navigation remain in place. Selected inherited life-area IDs are preserved exactly. Reference material, memories, moods and completed bubbles are not automatically converted into actions.

## Verification approach

Focused unit tests cover final release coordinates, capture/cancel/trailing-click behavior, pending and rejected persistence, Undo failure, canonical shared-task updates, searchable hidden tasks, area ID/alias reuse, ambiguous choices, thought source preservation, checked-note precedence and duplicate child prevention.

Browser checks use fresh anonymous contexts, actual UI capture/editing and real IndexedDB readback. Native Chromium mouse and emulated touch inputs exercise non-unit zoom, grab offsets, a final-up-only desktop endpoint, sampled release radii, cancellation, subsequent ordinary activation, electron keyboard arrows, navigator alternatives and reload. Life-area reuse verifies unchanged canonical task and nucleus counts with increased shared-task bonds. Thought growth checks source type/content and family persistence. The same flows run against an isolated production build without feature overrides. External/provider traffic is blocked; these are frontend and local-persistence receipts, not provider execution or physical-device usability evidence.

## Release boundary

This tranche changes no database migration, Edge function, credentials, provider grants, account ownership or data cutover. Draft PR 35 remains unrelated and unmerged. No packages or baseline debt allowances are changed. Atomic's existing 19-area capacity, experimental status and participant-usability validation limits remain documented in `docs/living-molecules-handoff.md`.

Final gate counts and publication evidence are recorded in the PR and the completion receipt.
