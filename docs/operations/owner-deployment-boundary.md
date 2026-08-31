# Shared and owner-isolated frontend boundary

This is a main-safe frontend configuration guard, not a backend cutover or an
owner authorization rule. The existing shared deployment remains on its source
project. No actual owner address, Auth UUID, provider grant, credential, data
copy, SQL installation, Edge deployment, or shared callback route is changed.

## Build contract

The existing three public Supabase settings remain required, atomic, and
validated. Two additional optional settings form a separate atomic pair:

| Profile | Required binding |
| --- | --- |
| Both deployment settings absent | Shared mode; project `ekekeywoxvdbfbmqyhjy` only. Existing public, development, and preview origins retain their behavior. |
| `VITE_MIND_MANUAL_DEPLOYMENT_MODE=owner-isolated` and `VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN` | Isolated project `fjxedbaskrbewjunfxaj` only, at exactly the configured canonical origin. |

Partial process overrides are rejected before dotenv merging. Empty, malformed,
unknown, or half-present resolved profiles fail; they never default to shared
mode. An isolated project without an explicit isolated profile also fails.

Isolated origins must be exact HTTPS origins, with no path, credentials, query,
fragment, non-default port, default-port spelling, trailing slash/dot, IP
literal, normalization alias, or localhost hostname. Only the literal local
fixture origins `http://127.0.0.1:4181` and `http://localhost:4181` are excepted.
They remain distinct origins. The known shared public and preview hostnames
are forbidden. These local exceptions are not production OAuth approvals.

The browser entry and SDK read only five explicit public environment fields;
they do not serialize the entire `import.meta.env` object. Public configuration
is not a secret. The guard does not prove ownership of an opaque publishable
key or control of DNS, aliases, hosting, or the account behind a session.

## Startup behavior

The entry point validates the build profile and actual browser origin before
dynamically importing the React app, Supabase SDK, services, or app CSS. The
optional Google Fonts stylesheet is requested only after guarded mounting.
A copied isolated build displays
an accessible, static "App connection paused" message without app startup,
storage access, provider requests, redirect, retry, or source fallback. The SDK
also repeats the origin check before creating a client.

An unrelated import or mount failure displays "App could not start"; it does
not claim that no connection was attempted. Errors and stopped-screen copy do
not reflect keys, URLs, user identifiers, or raw exception content.

Runtime voice WebSocket, developer photo samples, and TTS diagnostics now derive
their backend from the same validated configuration. TTS diagnostics send the
public key as `apikey`; only a validated legacy anon JWT is also a Bearer token.
An opaque publishable key is not misrepresented as a session JWT, and a denied
diagnostic call stays denied without adding a session or falling back to source.

## Verification boundaries

Focused unit tests cover configuration rejection, atomic overrides, canonical
origins, startup ordering, sanitized failure UI, actual SDK construction, and
the three runtime endpoint call paths. Browser tests build the actual app with
synthetic low-privilege settings and intercept every network request. They prove:

- The initial HTML preloads only a side-effect-free bundler helper, not app code
  or CSS. Wrong-origin copies load only the entry/helper scripts.
- Three wrong origins stop with zero app fetches, WebSockets, IndexedDB opens,
  app/CSS imports, or external requests.
- The exact local origin mounts the actual app, opens its real onboarding
  dialog, and remains usable after the dialog is closed, with no source-backend
  request. Synthetic provider responses do not prove live target readiness.
- An unrelated synthetic `VITE_` sentinel is absent from all emitted JavaScript.

Browser verification exposed that a remote font `@import` made Vite's dynamic
app CSS preload reject when the font provider was unavailable. The existing
font URL now loads as an optional, idempotent stylesheet after mounting rather
than as a prerequisite of application CSS. The positive browser test deliberately
aborts that font request and still exercises the actual app. It also waits for
and closes delayed onboarding, which hides the shell from the accessibility
tree, instead of racing the dialog. These are local/offline tests, not live
provider proof. Standard shared UI, storage, and accessibility gates remain
separate from this isolated-build fixture.

The accessibility gate explicitly waits for the real first-run dialog and finite
entrance/theme animations. Removing the old blocking font dependency exposed an
existing race: the initial scan sampled a milestone midway through its opacity
animation, or skipped a dialog that had not opened yet. The unchanged full WCAG
rules run against the settled foreground and shell; no contrast rule or UI
surface is excluded to obtain a pass.

Local verification of this implementation: 120 focused tests, eight actual Vite
CLI rejection cases, six isolated-build browser cases, 2,238 full-suite tests
plus 52 inherited skips, 17 shared UI checks, seven real-browser storage checks,
and 14 accessibility checks passed. The actual app TypeScript check passed;
ESLint debt remains 861 and cohesion debt 203, with both ratchets passing. These
counts are local code evidence, not hosted CI or published-state receipts.

## Remaining owner-only cutover gates

One selected account does not make shared infrastructure account-specific.
Before any live owner move, separately verify the exact private owner Auth UUID,
select and approve genuinely separate hosting/origin, prove Auth/session/RLS and
provider account ownership, and complete fresh denial and rollback canaries.

Draft PR35 still has global Edge admission and bucket-wide Storage effects.
Its private Calendar operation-ledger scope and original-lease reconciliation
are incomplete. Shared Gmail delivery, source renewals, and callbacks must not
be redirected or retired for other users. This guard neither resolves nor
authorizes those operations; PR35 remains draft, unmerged, and undeployed.
