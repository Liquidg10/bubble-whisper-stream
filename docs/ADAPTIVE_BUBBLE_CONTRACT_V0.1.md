# Adaptive Bubble Semantic Contract v0.1

## Scope

This is the pure projection contract consumed by the Adaptive Bubble renderer.
The contract itself does not render, animate, filter, persist, publish, or
deploy anything.

`projectAdaptiveBubbles` consumes canonical Tasks plus current readiness context
and returns each Task exactly once in the readiness engine's stable order.

## Required semantics

Every projected Task includes:

- the canonical Task;
- its explainable readiness result;
- a text readiness label;
- a text urgency label;
- `mustRemainReachable: true`;
- `requiresPersistentUrgencyCue` for urgency `2` or `3`;
- `motionIndependent: true`;
- a complete accessible summary.

An urgent task may remain `later`, `blocked`, or `unknown`. Urgency does not
rewrite readiness. It remains a separate persistent semantic signal.

## Renderer invariants

Every Adaptive Bubble renderer must:

1. consume this projection instead of slicing BubbleStore order;
2. preserve reachability for every projected Task through canvas or an
   equivalent “show all” surface;
3. expose urgency through text/semantics, never only size, color, position, or
   motion;
4. expose the complete accessible summary to assistive technology;
5. preserve identical meaning when motion is reduced or disabled;
6. avoid creating another task store or prioritization model.

## Verification

`src/services/__tests__/adaptiveBubbleContract.test.ts` proves:

- an urgent-but-not-ready task remains `later` while carrying persistent
  high-urgency semantics;
- every canonical Task is returned exactly once;
- every result is reachable, motion-independent, and text-described.

`src/experimental/iridescent/__tests__/BubbleRenderer.accessibility.test.tsx`
proves that the active renderer consumes those semantics for ordering,
reachability, urgency text, keyboard activation, and reduced motion.
