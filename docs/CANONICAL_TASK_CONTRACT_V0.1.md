# Canonical Task Contract v0.1

Status: implemented behind the existing Task adapter boundary.

## Product invariant

Bubble OS has one Task entity and multiple projections. Adaptive Bubble,
Ripple/Molecule, List, Kanban, Matrix, Pinboard, Calendar, and Email may store
layout-specific metadata, but they may not create their own task identity,
completion state, or prioritization record.

## Persistence owner

For v0.1, BubbleStore and its IndexedDB `BubbleUniverse` record remain the
single persisted owner. A versioned `Bubble.metadata.canonicalTask` envelope
stores Task-only semantics:

- exact Task kind, including `photo` and `event`;
- completion;
- due/start/end;
- optional effort/time estimate;
- user-controlled actionability while preserving original kind;
- energy fit;
- urgency;
- readiness state/explanation snapshot;
- domain links and their user-confirmation status;
- exact view metadata;
- exact Task domain metadata.

The top-level Bubble fields remain the compatibility representation used by
the current Bubble canvas and existing local storage.

## Migration path

Migration is lazy and non-destructive:

1. Existing Bubble records without an envelope are read through legacy
   fallbacks.
2. No bulk startup rewrite occurs.
3. The next Task-backed create or update writes schema version `1`.
4. Direct Bubble-side changes to completion, position, size, tags, calendar,
   or metadata take precedence over an older envelope when read.
5. Legacy Atomic horizon tags remain available. Adapter-generated transport
   tags are marked and removed again from the canonical Task projection.

This approach avoids two stores and avoids rewriting user data merely because
the app was opened.

## Completion invariant

For every Task-backed write:

```text
Task.completed
  = Bubble.completed
  = Bubble.metadata.canonicalTask.completed
```

Reads prefer an explicit top-level Bubble completion value so a direct Bubble
interaction cannot be hidden by a stale envelope.

Contribution events and Ripple/Molecule state are intentionally not part of
v0.1. They require a later idempotent event-ledger slice.

## Meaning and consent

`Task.domainLinks` may contain user-created, imported, locally suggested, or
assistant-suggested links. Provenance is retained as `user | rule | assistant |
import`; proposal grounding is kept separate from an optional user-authored
relationship reason. Downstream Ripple/Molecule behavior must use only links
where `userConfirmed === true`.

The confirmable Life Connections editor is documented in
`docs/CONFIRMABLE_LIFE_CONNECTIONS_V0.1.md`. Its proposals remain transient;
only an explicit Link action creates or confirms a canonical link.

The legacy keyword classifier may continue to position the experimental
Atomic view, but it does not populate canonical domain links.

## Action-fit placeholders

The contract now has typed fields for:

- `energyFit`: `low | medium | high | flexible`;
- `estimatedMinutes`: optional positive task effort/time estimate;
- `actionability`: `actionable | reference`, persisted separately from `type`;
- `urgency`: `0 | 1 | 2 | 3`;
- `readiness`: a band, source, score, factor receipts, explanation, optional
  expiring override, and normalized input snapshot;
- `domainLinks`: editable multi-domain links with confirmation and provenance.

The follow-on pure readiness engine is documented in
`docs/READINESS_ENGINE_V0.1.md`. No new UI is introduced by either slice.

## Verification gates

The contract suite must prove:

- completion survives Task ↔ Bubble conversion;
- existing legacy metadata survives lazy migration;
- all Task-only fields survive JSON serialization/reload;
- projection changes do not erase core semantics;
- assistant-inferred domains do not become confirmed links;
- zero timestamps, coordinates, and size are preserved;
- current adapter error fallbacks remain valid.
