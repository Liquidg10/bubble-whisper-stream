# Intelligence integration coverage

`src/test/e2e/intelligence-integration.test.ts` was retired on 2026-08-29. It
was not an end-to-end test: every navigation and interaction method was a
constant no-op, `exists()` always returned `true`, and `getText()` always
returned an empty string. Its historical pass/fail count therefore provided no
product evidence.

## Verified automated coverage

| Capability | Real executable coverage |
| --- | --- |
| Adaptive reminder explanation and overwhelm signal | `src/services/__tests__/adaptiveReminderService.test.ts` |
| Context confidence and "because" explanations | `src/services/__tests__/contextEngineService.test.ts` |
| CBT step flow, suggestions, save contract, TTS, and cancellation | `src/components/__tests__/CBTThoughtCheck.test.tsx` and `src/ai/cbt/__tests__/*.test.ts` |
| Glimmer feature gates, generation, display, dismissal, quiet hours, screen-reader announcement, TTS, and frequency caps | `src/components/__tests__/GlimmerNotificationSystem.test.tsx` |
| Self-model cold-start contract | `src/services/__tests__/selfModelV2Service.test.ts` |
| Current browser routes, canvas interaction, viewport capacity, keyboard behavior, and reduced motion | `tests/e2e/current-ui-smoke.spec.ts` under Playwright |

## Explicit gaps

There is currently no honest browser test proving the historical harness's
claimed reminder-notification workflow, monthly-review workflow, or offline
banner workflow. Several selectors used by that file never existed in the
application. Those scenarios must be added to Playwright only after the
corresponding current UI and persisted-state contracts exist; they must not be
simulated by a no-op Vitest adapter.

Runner ownership is deliberate:

- Vitest: `src/**/*.test.{ts,tsx}` (jsdom unit/component/integration tests).
- Playwright release gate: `tests/e2e/current-ui-smoke.spec.ts` in the
  `chromium-e2e` project.
- Playwright historical diagnostics: the separately named
  `chromium-e2e-legacy` project; these are not current release evidence.
- Deno: `supabase/functions/**/*.test.ts`.
