# Adaptive Bubble Renderer v0.1

## Scope

This slice connects the active iridescent Bubble canvas to
`projectAdaptiveBubbles`. It does not add another store, change the canonical
Task contract, infer context, persist current capacity, publish, or deploy.

BubbleStore/IndexedDB remains the single persisted owner. The renderer derives
canonical Tasks through `bubbleToTask` and consumes the pure readiness
projection.

## Behavior

- Density selection uses readiness order rather than BubbleStore array order.
- Current energy and available time are explicit, transient user inputs.
  Unset values stay neutral in the readiness engine.
- Every rendered bubble is a keyboard-focusable button.
- Every bubble exposes the projection's complete accessible summary.
- Readiness is always visible as text.
- Moderate and high urgency remain a separate persistent text badge.
- The `All tasks` navigator keeps every projected Task reachable even when
  density, focus, declutter, position, or viewport hide a visual bubble.
- The navigator preserves the same readiness order and exposes readiness plus
  urgency as visible text.
- Existing canvas selection, detail opening, drag, merge, zoom, focus,
  declutter, density, and photo rendering paths remain connected.

## Reduced motion

Float animation and pointer-following specular motion are disabled when either:

- the app's reduced-motion setting is enabled; or
- the operating system requests `prefers-reduced-motion: reduce`.

Readiness, urgency, accessible names, task ordering, and the `All tasks`
navigator are unchanged when motion is disabled.

## Deliberate limits

- The current-context controls do not persist and do not silently learn.
- Saved Bubble x/y/size remain the visual layout. This slice does not claim a
  final behavioral mapping for distance, size, speed, or ripple.
- Readiness labels and thresholds remain provisional pending lived-use review.
- The renderer does not edit Task energy fit, urgency, actionability, blocks,
  or readiness overrides.
- No Ripple/Molecule behavior is introduced.

## Verification

`src/experimental/iridescent/__tests__/BubbleRenderer.accessibility.test.tsx`
proves:

1. low density selects from readiness order rather than storage order;
2. every Task remains available through the `All tasks` navigator;
3. urgent-but-not-ready remains `later` with visible high-urgency text;
4. bubble activation works from the keyboard;
5. app and operating-system reduced-motion preferences disable float motion;
6. the narrow renderer surface has no axe-core violations in jsdom, with the
   color-contrast rule excluded because jsdom cannot calculate rendered color
   contrast.
