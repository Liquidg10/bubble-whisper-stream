# Cross-device sync: explicit deferred boundary

Date: 2026-08-29  
Audit base: `b546cffeab9b9b42e85176d3fadae49bcefd79b1`

## Verdict

A secure, owner-scoped Phase 1 cannot be completed from the existing contract
without an owner-facing decision about device pairing and lost-key recovery.
Cross-device replication therefore remains unavailable. Local IndexedDB
persistence remains the only shipped bubble-data durability path.

This is a release boundary, not a partial launch. The app must not create an
encrypted outbox row, subscribe to remote changes, display a connected device,
or claim a conflict was remotely resolved until it can produce a durable apply
receipt from a second authorized device.

## Why the inherited schema is insufficient

The existing tables provide useful scaffolding but not a complete protocol:

- `sync_data` can hold ciphertext, an IV, a free-form version, and a device ID,
  but it has no causal-version constraint, idempotency constraint, apply cursor,
  per-device acknowledgment, or authenticated envelope metadata.
- `sync_devices` can hold a public key, but there is no data-key envelope,
  pairing challenge, proof of possession, rotation epoch, or revocation receipt.
- `sync_logs` is a general integration log. It has no sync operation ID,
  source/target device ID, causal version, apply outcome, or uniqueness contract,
  so it cannot prove that another device decrypted and applied an operation.
- The removed browser services generated one AES key per browser and stored
  exportable key material in `localStorage`. A second device could not obtain
  the same key securely. Remote apply methods were empty or event-only, and
  simulated pages/data could report success without a remote mutation.

RLS can keep rows owner-scoped, but RLS alone cannot establish cryptographic
device trust, key recovery, deterministic conflict semantics, or remote apply.

## Owner decision required before implementation

Choose one key ceremony and its lost-all-devices behavior:

1. **Existing-device pairing only.** A trusted device transfers the owner data
   key to a new device after an authenticated QR/short-code challenge. Losing
   every trusted device makes old ciphertext intentionally unrecoverable.
2. **Owner recovery secret.** Pairing remains device-to-device, with an explicit
   recovery phrase/passkey that can re-wrap the owner data key. Product UX must
   explain that losing the secret makes old ciphertext unrecoverable.
3. **Server-assisted escrow.** A server-held recovery mechanism restores access,
   which changes the privacy promise and requires a separate threat-model and
   consent decision.

The implementation must not silently choose among these privacy tradeoffs.

## Minimum future implementation contract

1. Generate a non-exportable device private key in IndexedDB/WebCrypto. Store
   only the public key, proof-of-possession state, and rotation epoch remotely.
2. Add owner data-key envelopes encrypted separately to every active device.
   Pairing must be single-use, expiring, authenticated, and explicitly accepted
   on an already trusted surface (or through the selected recovery ceremony).
3. Give every operation a client-generated idempotency UUID and deterministic
   causal version. Authenticate entity type, entity ID, operation, owner,
   device, version, and key epoch as AES-GCM additional authenticated data.
4. Add a real BubbleStore/IndexedDB adapter that applies `create`, `update`, and
   tombstone `delete` operations atomically. Realtime is a wake-up signal; boot
   and reconnect must backfill from a durable cursor.
5. Add durable per-device apply receipts (or device cursors) tied uniquely to
   operation ID, target device, causal version, key epoch, outcome, and time.
   An upload receipt and an apply receipt must remain distinct.
6. Define deterministic conflict behavior for concurrent vector clocks and
   persist the chosen resolution as a new causally ordered operation.
7. Revocation must rotate the owner data key for future writes, deny new
   envelopes to the revoked device, and record the exact history-access policy.
8. Prove two isolated browser/device contexts: first pairing, backfill, offline
   replay, duplicate delivery, out-of-order delivery, concurrent edits, delete
   tombstones, tampered ciphertext/AAD, revoked-device denial, lost-key path,
   and durable receipt reconciliation.

## Current enforcement

A read-only Management API query against production project
`ekekeywoxvdbfbmqyhjy` on 2026-08-29 confirmed the pre-migration state: all
three prototype tables grant `SELECT` to `anon` and `authenticated`, grant
`INSERT` to `authenticated`, have two RLS policies each, and remain members of
`supabase_realtime`. RLS still filters rows by owner, but the client/realtime
surface is unnecessarily open for a disabled capability. This is the exact
state the migration closes; no production mutation was performed in this work.

- `CROSS_DEVICE_SYNC_CAPABILITIES.status` is `deferred`; all replication
  capability booleans are false and the reason code is
  `owner_key_ceremony_required`.
- `initialize()` is a side-effect-free capability probe. `syncEntity()` and
  `revokeDevice()` fail closed with `CrossDeviceSyncUnavailableError`.
- The `sync` and `crdtPilot` feature flags are false.
- Reachable conflict, collaboration, and multi-device simulation surfaces were
  removed; no production component subscribes to `sync_data`.
- Migration `20260829050000_defer_cross_device_sync.sql` preserves historical
  rows while removing browser privileges, RLS policies, and Realtime
  publication membership for `sync_data`, `sync_devices`, and `sync_conflicts`.
  `sync_logs` remains available to the unrelated Calendar/Gmail receipt paths.

## Reopening gate

Do not flip either feature flag or restore table access based on a green build,
one-browser test, ciphertext upload, or Realtime delivery. Reopen only after the
owner records the key-ceremony choice and every minimum contract above has a
test receipt; production activation additionally requires an isolated
two-device canary and rollback plan.
