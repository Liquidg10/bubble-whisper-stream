# CI gate boundaries

The blocking pull-request gates are intentionally bounded to claims the current
application can prove locally:

- TypeScript compilation and production build.
- No increase in inherited ESLint or assistant-cohesion findings.
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
current product.

These gates do not authorize deployment, provider changes, feature-flag
changes, or user-data mutation.
