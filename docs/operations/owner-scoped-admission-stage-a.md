# Owner-scoped Edge admission — draft Stage A

Historical Stage A receipt. The local continuation and current classification
are documented in [Stage B](owner-scoped-admission-stage-b.md).

Status: local draft implementation only. Do not deploy, merge as an activation,
install the SQL remotely, configure a subject, drain, fence, or move data from
this receipt.

Stage A replaces global pre-auth admission on 27 user-facing functions. Each of
those functions now verifies the request bearer against the authoritative
Supabase Auth user endpoint before asking the control plane to classify the
verified subject. The request body cannot provide the subject or runtime
generation. The SQL decision is exact and atomic under the phase-transition
lock:

- `unselected`: no lease is created and the verified unrelated user continues;
- `admitted`: the selected owner receives a lease bound to subject, function,
  action and the server runtime generation;
- `blocked`: selected work does not start while draining or fenced.

Release requires the complete original tuple. A mismatched or uncertain release
retains the selected lease. The legacy release RPC is restricted to legacy rows
whose owner/action/generation tuple is null. SQL subject configuration now
accepts exactly one existing Auth UUID, blocks V2 traffic until that owner is
configured, and makes the selection immutable. This prevents an in-flight
unselected request from becoming selected after it started without a lease.

The generation is the server-only `MIND_MANUAL_RUNTIME_GENERATION` deployment
value. It must identify the immutable deployed function generation; it is not a
client header, query parameter, or request-body field. No value has been chosen
or configured by this draft.

`storage-photo` resolves the owner from the bearer before admission and binds
the action to the operation header (`upload` or `delete`). Any other operation
is rejected before admission. Neither its request body nor object path can
select an admission subject or generation.

## Exhaustive entrypoint state

- 27 `owner_scoped_bearer`: the eleven AI functions, `document-scan`,
  `grocery-intelligence`, `plaid-create-link-token`, the twelve existing
  authenticated user routes, and `storage-photo`.
- 5 `legacy_global_blocked`: `calendar-sync`, `calendar-watch`, `gmail-watch`,
  `plaid-webhook-handler`, and `watch-renewal-cron`.
- 2 `retired_unwrapped`: `oauth-google` and `oauth-scope-decay`; these bounded
  tombstones always return 410 and perform no migration admission.

The static readiness inspector requires this exact 27/5/2 classification and
reports one `legacy_global_admission` blocker for each of the five legacy paths.
Consequently the implemented count is 29 of 34 and activation remains false.
The compatibility wrapper and subjectless RPC exist only for those five paths;
they pause globally and every unattributed lease blocks fencing. They must be
replaced by authoritative callback/account resolution, per-row scheduler
admission, and verified Plaid webhook ownership before any deployable tranche.

The manual SQL change invalidated the prior pinned structural catalog. The new
reference was derived from the disposable local PostgreSQL fixture and reviewed
as a narrow change to the source SQL pin, lease relation, and guard functions;
all other component hashes remain unchanged. A hash change alone is never an
acceptable reference update.

No Storage policy, Calendar operation ledger, frontend deployment boundary,
provider configuration, credential, database, or live system was changed here.
