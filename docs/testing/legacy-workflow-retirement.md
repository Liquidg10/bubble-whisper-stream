# Legacy workflow retirement

The Vitest files `src/test/e2e/complete-production-workflows.test.tsx` and
`src/test/e2e/complete-workflows.test.tsx` were retired on 2026-08-29. They
mounted the application in jsdom, so they were integration tests rather than
end-to-end browser tests. More importantly, nine of their sixteen assertions
targeted controls or behavior that the current application does not expose.
Keeping those assertions red did not describe a regression; changing selectors
until they turned green would have fabricated product evidence.

Two unique current behaviors were retained and made explicit in
`src/test/integration/local-app-workflows.test.tsx`: local bubble
create/edit/delete persistence and the biometric-lock *preference*. The new
tests assert the storage calls they isolate. They do not label local persistence
as cross-device sync or a persisted boolean as a biometric authentication
ceremony.

## Coverage disposition

| Historical claim | Honest current disposition |
| --- | --- |
| Onboarding, text, voice, photo, search, and timeline as one journey | Retired as an over-broad implementation script. Text persistence is covered by `src/test/integration/local-app-workflows.test.tsx`; current voice ownership by `src/components/__tests__/VoiceIntentCapture.accessibility.test.tsx`; current routes and canvas navigation by `tests/e2e/current-ui-smoke.spec.ts`. There is no single browser journey covering all six surfaces. |
| Text capture with no invented AI-analysis switch | Preserved and strengthened as the create step in `src/test/integration/local-app-workflows.test.tsx`, including an asserted storage call. |
| CBT route and generated reframe | The historical route/control contract is absent. The shipped CBT component flow, suggestions, save, TTS, and cancellation are covered by `src/components/__tests__/CBTThoughtCheck.test.tsx` and `src/ai/cbt/__tests__/*.test.ts`. |
| Large-dataset render/search timing in jsdom | Replaced by bounded structural coverage in `src/test/performance/load-testing.test.tsx` and real-browser viewport-capacity coverage in `tests/e2e/current-ui-smoke.spec.ts`. Host-clock thresholds around mocked data are not performance evidence. |
| Keyboard navigation | Replaced by real-browser keyboard coverage in `tests/e2e/current-ui-smoke.spec.ts` and focused renderer interaction coverage in `src/experimental/iridescent/__tests__/BubbleRenderer.accessibility.test.tsx`. |
| Reduced motion | Replaced by real-browser emulation in `tests/e2e/current-ui-smoke.spec.ts` and focused renderer coverage in `src/experimental/iridescent/__tests__/BubbleRenderer.accessibility.test.tsx`. |
| Voice network error plus Retry button | Retired. The script mocked `modalityService.transcribeVoice`, but the current header capture owns `MediaRecorder` and Supabase invocation through `VoiceIntentCapture`. Recording ownership is covered; an honest current error/retry UI test remains a gap. |
| Storage error plus Clear cache button | Retired because neither recovery control exists. Fail-closed store behavior is covered by `src/services/__tests__/bubbleStore.persistence.test.ts`; user-facing recovery remains a product/test gap. |
| Bubble create, edit, sync, and delete | Renamed and preserved as local create/edit/delete persistence in `src/test/integration/local-app-workflows.test.tsx`. The old test never exercised cross-device sync. |
| Mood capture automatically causing a personalized glimmer | The historical mood controls are absent. Glimmer gating, generation, display, dismissal, quiet hours, announcements, TTS, and caps are covered by `src/components/__tests__/GlimmerNotificationSystem.test.tsx`; a current browser trigger journey remains a gap. |
| Semantic search returning two inferred emotional matches | Retired. Its vector-search module was auto-mocked and the current header search has a different contract. A real current semantic-results browser test remains a gap. |
| Week/month temporal-layer controls | Retired because those controls are not in the current surface. Temporal inference is covered by `src/services/__tests__/temporalReasoningService.test.ts`; a current timeline browser contract remains a gap. |
| Install and toggle a Grocery Helper plugin in Settings | Retired because the claimed plugin-manager UI is absent. This must not be represented by asserting against a hand-built plugin object; a current executable plugin lifecycle test remains a gap. |
| Enable biometric protection | Preserved narrowly as persistence of `settings.biometricLock` in `src/test/integration/local-app-workflows.test.tsx`. No WebAuthn/native biometric gate is implemented, so the test makes no protection claim. |
| Responsiveness with 100 bubbles | Replaced by `src/test/performance/load-testing.test.tsx`, renderer capacity/accessibility tests, and the real-browser capacity case in `tests/e2e/current-ui-smoke.spec.ts`. An arbitrary jsdom wall-clock threshold was removed. |

## Runner boundary

- Vitest owns jsdom unit, component, and integration tests under
  `src/**/*.test.{ts,tsx}`.
- Playwright's `chromium-e2e` project owns the current browser release gate in
  `tests/e2e/current-ui-smoke.spec.ts`.
- Playwright's separately named `chromium-e2e-legacy` project owns historical
  diagnostics; those specs are not current release evidence.
