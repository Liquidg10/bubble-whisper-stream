# Glimmer non-obstruction release receipt

## Scope

This is a frontend layout correction based on canonical main
`9205e18456b3a0e58d385ff75189b1ebbba4f2e9`, on
`codex/glimmer-nonblocking-layout`. It does not include the migration-freeze
draft, change provider configuration, modify data contracts, disable a feature,
or authorize publication.

Both Glimmer components now render in normal document flow after the shell's
existing full-height route container. The legacy store-backed component still
mounts only on `/`; the shell generator remains available on its existing
routes. Neither card has fixed positioning or elevated stacking. The legacy
dismiss button gains an accessible name, without changing its action.

The task viewport, Atomic geometry, modal implementations, generation, speech,
announcements, persistence and enabled settings are unchanged. Messages add
scrollable content rather than covering controls or shrinking the canvas.
The explicit trade-off is discoverability: reading a card may require scrolling
the main content. The messages remain available and dismissible.

## Verification on the initial main-based change

- Actual app TypeScript check and production build passed.
- Focused component tests: 14 passed. Their paths are included in the existing
  `test:unit:ci` command so hosted CI runs the placement and mount-scope checks.
- Full Vitest suite: 2,150 passed, 52 inherited skips, across 128 passing and
  three skipped files.
- Current UI browser suite: 20 passed, including three new active-card cases.
- Accessibility suite: 14 passed on the original main test tree. This run does
  not claim to fix the independently identified first-run scan timing race.
- Focused new test lint and `git diff --check` passed.
- Independent production-diff and test review found no blocker.

The browser artifact was built with synthetic public backend settings and
served only on local port 4186. Active-card fixtures abort every non-loopback
request. A direct browser check showed meaningful home/List content, no runtime
page errors and no framework error overlay. No user browser or signed-in
account was used.

## Active-card evidence and limitations

The three new browser cases keep Glimmers enabled and deliberately active while
exercising onboarding and List keyboard help at 320px and 1280px; all five
mobile Atomic controls; task navigation; footer navigation; and the root-only
legacy mount scope. Geometry checks place both cards below the Atomic viewport.
All five domain targets pass real center hit tests and Playwright pointer
actionability checks. Only afterward do the tests dismiss each card and verify
the corresponding IndexedDB row. The Atomic height stays unchanged.

The legacy card is seeded both in IndexedDB and a synthetic Zustand backup.
The existing store does not reload Glimmer rows from IndexedDB at startup, so
this proves an already-populated saved-message state, not cold-start recovery.
The fixture uses the legacy `Friend` tone for that card and lets the actual
shell service generate current `supportive` messages. It does not claim the
legacy/current tone vocabularies have been reconciled.

An initial fixture assertion expecting exactly three generated/stored rows
exposed an inherited generation race: overlapping checks can exceed the daily
cap before writes settle. The final fixture observes genuine generated rows
without asserting exact-one generation and uses the existing cap to prevent
additional legacy generation. No generation, cap, or storage fix is included
in this layout tranche. The first failure artifacts were retained locally.

Dependencies were reused through a local symlink only after confirming identical
dependency declarations and a byte-identical lockfile. No dependency or lockfile
change is part of this release.
