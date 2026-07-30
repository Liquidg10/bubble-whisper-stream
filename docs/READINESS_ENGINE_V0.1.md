# Readiness Engine v0.1

## Product boundary

Readiness answers one question:

> What can I realistically do now?

It does not decide what matters across a person's life. Ripple/Molecule uses
separately confirmed domain links. It does not replace the canonical Task or
create another prioritization store.

The engine is a pure function. It reads a Task plus current context and returns
an explainable snapshot without persistence, network calls, learning, or
mutation.

## Inputs

Persisted on the canonical Task:

- energy requirement: `low | medium | high | flexible`;
- optional positive `estimatedMinutes`;
- user-controlled `actionability: actionable | reference`;
- explicit urgency: `0 | 1 | 2 | 3`;
- explicit priority: `0..100`;
- optional user readiness override.

Supplied as current context:

- current energy: `low | medium | high`;
- optional available minutes;
- optional temporary `capacityRatio` from `0..1`;
- explicit per-task blocks and their plain-language reasons;
- evaluation time.

Current energy and capacity are not written back onto the Task.

## Public result

Every evaluation returns:

- a public band: `now | possible | later | blocked | unknown`;
- `computed` or `user` source;
- a normalized score used only for stable ordering inside a band;
- four factor receipts with value, weight, availability, and explanation;
- a plain-language summary;
- a JSON-safe input snapshot.

The score is not a grade and should not be presented as personal worth,
success, or failure.

## Deterministic scoring

| Factor | Weight | Missing input |
|---|---:|---|
| Energy fit | 0.40 | neutral `0.5` |
| Time fit | 0.25 | neutral `0.5` |
| Explicit urgency | 0.20 | neutral `0.5` |
| Explicit priority | 0.15 | neutral `0.5` |

Bands:

- `now`: score at least `0.72`;
- `possible`: score at least `0.45`;
- `later`: score below `0.45`;
- `blocked`: an explicit block exists;
- `unknown`: the item is complete or not currently actionable.

The default actionable kinds are `task`, `reminder`, and `event`. Other kinds
default to reference. A persisted user decision overrides that default without
changing the original kind or attachment.

## User control and drift

An active user override wins over computed fit and an explicit block. It may
include a reason and expiry. Once it expires, evaluation naturally returns to
the current context, allowing a task to drift back without failure framing.

Completion remains terminal: a completed item returns `unknown` because
readiness no longer applies.

## Stable ordering

`rankTasksByReadiness` returns every input exactly once. It orders incomplete
items by public band, then score, and preserves the caller's order for exact
ties. Completed items remain available at the end rather than disappearing.

## Explicit non-goals

- no renderer or animation changes;
- no automatic current-energy inference;
- no keyword-derived urgency;
- no hidden user-preference learning;
- no AI-imposed life-domain meaning;
- no invented recurrence behavior while the canonical Task has no recurrence
  contract;
- no persistence side effects;
- no publish or deploy.

The older `prioritizer.ts` remains separate because it guesses importance from
content/tags, adds recency, and learns from corrections. Those semantics are
not part of this accepted readiness contract.

## Representative scenario gate

`src/services/__tests__/readinessScenarios.test.ts` covers:

1. low-energy short-task ordering;
2. high urgency with poor current fit;
3. an expiring “not now” override;
4. an explicit block with a readable reason;
5. a photo that needs an actionability decision.

All five calculations pass. The follow-on contracts persist actionability on
the canonical Task and expose motion-independent urgency/reachability semantics
through `src/services/adaptiveBubbleContract.ts`. The active iridescent
renderer now consumes that projection in the separately authorized
accessibility-first slice documented in
`docs/ADAPTIVE_BUBBLE_RENDERER_V0.1.md`.
