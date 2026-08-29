# CI gate boundaries

The blocking pull-request gates are intentionally bounded to claims the current
application can prove locally:

- TypeScript compilation of the application project and production build.
- No increase in inherited ESLint or assistant-cohesion findings.
- A bounded Vitest unit/integration surface covering services, task and voice
  controls, the fail-closed cross-device boundary, and provider authorization
  helpers.
- Automated WCAG checks for onboarding plus the current Canvas, List, Kanban,
  and Matrix surfaces in light and dark modes.
- Current-route rendering, keyboard-help operation, reduced-motion operation,
  mobile horizontal-overflow, and honest 404 behavior.

The ratchet baselines do not make inherited debt compliant. `npm run lint` and
`npm run lint:cohesion` remain strict debt-reporting commands; the CI variants
fail any new or increased finding bucket while allowing cleanup to proceed in
scoped changes.

The broader files under `tests/a11y/` and `tests/e2e/gates/` remain diagnostic
inventory. Many encode historical routes, selectors, or unimplemented product
claims and are not release evidence until individually reconciled with the
current product. The `chromium-e2e` Playwright project intentionally selects
only `current-ui-smoke.spec.ts`; historical browser inventory is isolated under
the explicitly named `chromium-e2e-legacy` project and
`npm run test:e2e:legacy`.

Vitest collects only `src/**/*.test.{ts,tsx}`. Browser specs under
`tests/**/*.spec.ts` are Playwright-owned and must not be counted as jsdom unit
or integration results. The legacy no-op intelligence "E2E" harness was
retired; the coverage and explicit browser gaps it represented are recorded in
`docs/testing/intelligence-integration-coverage.md`. Large collection checks
assert structural render bounds instead of host-dependent stopwatch budgets.

These gates do not authorize deployment, provider changes, feature-flag
changes, or user-data mutation.
