# Optional activation configuration inventory

Status: local tool/test implementation only; no runtime configuration changed.
Starting base: `ed73e9bfba8a8b0116343cdfe40e330ff6a6b7fe`.
Rebased/tested integration base: `f9c13d3c2464a317980e85eb9d1f15feb4b25ba9`
(merged Calendar recovery PR #37, following lifecycle PR #36).
Branch: `codex/release-optional-config`.

## Contract

`supabase/isolation/mind-manual-secrets.txt` remains the unchanged required
user-managed secret manifest. The new separate names-only
`mind-manual-optional-config.txt` contains exactly
`CALENDAR_REVIEWED_UPDATES_ENABLED`. This flag belongs to the separately reviewed
Calendar update candidate, whose handler remains OFF unless its value is exactly
`true`; this tranche does not add, deploy or activate that handler.

Preflight validates that both name sets are nonempty, unique, syntactically valid,
disjoint, and contain no platform-managed names. Required names remain required.
Unknown user-managed names still block the isolated target. Other products' names
are recorded but do not block the shared source, preserving its existing boundary.

Optional configuration may be absent or present. Its receipt contains only name
and presence, with `valuesIncluded: false` and `activationVerified: false`. No
configuration value is fetched, parsed, logged or copied. Presence neither proves
that a feature is enabled nor grants permission to enable it. Missing optional
configuration does not require adding a secret with a `false` value.

The preflight receipt binds exact required-manifest bytes through `secretsSha256`
and exact optional-manifest bytes through `optionalConfigSha256`. Source/target
comparison rejects missing, malformed, inherited or mismatching bindings. Old
source receipts without the optional binding cannot be compared successfully
against new preflights. The existing exporter also compares the entire freshly
generated manifest binding before packaging, so the changed contract requires
fresh source receipts. This does not retroactively certify old migration chains.

## Verification and boundaries

- New offline contract tests: **42/42 passed**.
- All current-main Node receipt/tool tests: **45/45 passed**, zero skips/failures.
- Script syntax, import-safe test loading, CLI help and whitespace checks passed.
- The hosted accessibility/quality workflow now runs the optional-config gate.
- No app, Edge entrypoint, OAuth permission, environment, live provider, database,
  credential, source freeze, data-copy or publication action is included.

Run `npm run test:isolation:config` for the focused gate. The fixtures contain only
synthetic names and hashes; they perform no network calls or live preflight.
Full app gates and exact-head hosted CI belong to the integrating release.
