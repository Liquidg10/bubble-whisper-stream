# Confirmable Life Connections v0.1

Status: implemented behind the development-default `meaningLinks` feature flag.

## Product purpose

Life Connections is the first trustworthy bridge from the canonical Task to
the future Ripple/Molecule lens. It asks:

> What parts of your life does this action support?

It does not create a second task model. Adaptive Bubble still answers what is
realistic now; the same Task's confirmed domain links will later answer why the
action matters.

## Authority boundary

The system may propose. The person decides.

- Opening a task makes no provider call and creates no domain link.
- Local suggestions appear only after `Suggest connections` is activated.
- Suggestions are transient and do not affect readiness, urgency, ordering,
  completion, Ripple, or molecules.
- `Link to …` is the confirmation boundary. It creates a canonical
  `TaskDomainLink` with `userConfirmed: true` and retains its provenance.
- Manual add, per-task rename, relationship reason, optional
  primary/supporting role, remove, and
  inline undo work without a provider.
- A dismiss action does not mutate the Task.
- Reference material receives no automatic local hypothesis, although the user
  may still add a connection.

The starter labels are local suggestion vocabulary, not a user-owned global
domain registry. Accepted links can be renamed per task, and custom per-task
labels and relationship reasons remain user-authored. A global registry for
renaming, merging, or archiving domains everywhere is intentionally deferred.

## Shared implementation

`LifeConnectionsEditor` is embedded in both active detail paths:

- `BubbleDetail` for Bubble/Adaptive/Timeline surfaces;
- `TaskDetail` for List/Kanban/Matrix surfaces.

Both write `Task.domainLinks` through the versioned canonical envelope. The
Bubble path uses a metadata-only patch, and TaskStore now merges projections
back into the original Bubble so audio, images, location, mood, reminders, and
other Bubble-only context are not discarded.

## Accessibility contract

- confirmed and possible states are expressed in text, not color;
- every field has a visible label;
- every action has an explicit accessible name and a 44px target;
- changes are announced politely and expose a persistent inline undo;
- controls reflow to one column on narrow or zoomed layouts;
- no meaning depends on hover, motion, or a visual-only relationship line.

## Intentionally deferred

- No external AI/provider adapter. A future provider must return the same
  transient proposal shape and must require an explicit user request.
- No contribution ledger. Completion cannot update domain contribution until
  an idempotent and reversible event contract exists.
- No Ripple/Molecule renderer. It would be premature to visualize contribution
  before that ledger is proven.
- No reuse of legacy Atomic grouping as meaning truth. Keyword grouping remains
  an experimental layout behavior only.

## Next dependency-ordered slice

Build an idempotent completion/contribution ledger that snapshots only
user-confirmed links, supports complete/undo/re-complete without double count,
and persists the completion change and contribution event atomically. Only then
should the first read-only Ripple/Molecule projection be built.
