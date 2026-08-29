/**
 * Cross-device replication release boundary.
 *
 * Mind Manual is local-first today. The previous service created a device-local
 * AES key, subscribed to `sync_data`, and queued encrypted records without a
 * trusted way for another device to obtain the same key or apply/acknowledge a
 * change. That is an outbox prototype, not sync. Keep this module deliberately
 * side-effect free until the owner chooses a pairing and recovery ceremony.
 */

export const CROSS_DEVICE_SYNC_PREREQUISITES = Object.freeze([
  'Owner-approved device pairing and lost-key recovery policy.',
  'Non-exportable per-device private keys and owner data-key envelopes.',
  'Authenticated owner-scoped outbox rows with deterministic causal versions.',
  'A real IndexedDB apply adapter for create, update, and delete operations.',
  'Durable per-operation apply receipts, replay cursors, and idempotency keys.',
  'Two-device tests for bootstrap, offline replay, conflicts, tampering, and revocation.',
] as const);

export const CROSS_DEVICE_SYNC_CAPABILITIES = Object.freeze({
  status: 'deferred' as const,
  reasonCode: 'owner_key_ceremony_required' as const,
  bubbleReplication: false,
  remoteOutbox: false,
  remoteApply: false,
  durableRemoteReceipts: false,
  sharedKeyExchange: false,
  userFacingPairing: false,
  keyRecoveryPolicy: false,
  reason:
    'Cross-device replication is unavailable until device pairing and lost-key recovery are explicitly designed and approved.',
  prerequisites: CROSS_DEVICE_SYNC_PREREQUISITES,
});

export type CrossDeviceSyncCapability = typeof CROSS_DEVICE_SYNC_CAPABILITIES;

export interface SyncStatus {
  isOnline: false;
  lastSync: null;
  pendingUploads: 0;
  pendingDownloads: 0;
  conflicts: [];
  syncMode: 'disabled';
  capability: CrossDeviceSyncCapability;
}

export class CrossDeviceSyncUnavailableError extends Error {
  readonly code = CROSS_DEVICE_SYNC_CAPABILITIES.reasonCode;

  constructor() {
    super(CROSS_DEVICE_SYNC_CAPABILITIES.reason);
    this.name = 'CrossDeviceSyncUnavailableError';
  }
}

class CrossDeviceSyncService {
  /**
   * Read-only initialization probe. It performs no auth lookup, channel
   * subscription, key generation, local queue write, or remote mutation.
   */
  async initialize(): Promise<CrossDeviceSyncCapability> {
    return CROSS_DEVICE_SYNC_CAPABILITIES;
  }

  /**
   * Replication writes fail closed. A local queue entry is not accepted because
   * it cannot currently produce a remote apply receipt.
   */
  async syncEntity(): Promise<never> {
    throw new CrossDeviceSyncUnavailableError();
  }

  getSyncStatus(): SyncStatus {
    return {
      isOnline: false,
      lastSync: null,
      pendingUploads: 0,
      pendingDownloads: 0,
      conflicts: [],
      syncMode: 'disabled',
      capability: CROSS_DEVICE_SYNC_CAPABILITIES,
    };
  }

  async getDevices(): Promise<[]> {
    return [];
  }

  async revokeDevice(): Promise<never> {
    throw new CrossDeviceSyncUnavailableError();
  }
}

export const crossDeviceSyncService = new CrossDeviceSyncService();
