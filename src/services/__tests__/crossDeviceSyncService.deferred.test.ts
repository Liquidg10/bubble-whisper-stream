import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flags, isFeatureEnabled } from '@/config/flags';
import {
  CROSS_DEVICE_SYNC_CAPABILITIES,
  CROSS_DEVICE_SYNC_PREREQUISITES,
  crossDeviceSyncService,
} from '@/services/crossDeviceSyncService';

describe('cross-device sync deferred boundary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps every release capability and both feature flags disabled', () => {
    localStorage.setItem('flags.sync', 'true');
    localStorage.setItem('flags.crdtPilot', 'true');

    expect(flags.sync).toBe(false);
    expect(flags.crdtPilot).toBe(false);
    expect(isFeatureEnabled('sync')).toBe(false);
    expect(isFeatureEnabled('crdtPilot')).toBe(false);
    expect(CROSS_DEVICE_SYNC_CAPABILITIES).toMatchObject({
      status: 'deferred',
      reasonCode: 'owner_key_ceremony_required',
      bubbleReplication: false,
      remoteOutbox: false,
      remoteApply: false,
      durableRemoteReceipts: false,
      sharedKeyExchange: false,
      userFacingPairing: false,
      keyRecoveryPolicy: false,
    });
  });

  it('names the complete minimum proof required before activation', () => {
    expect(CROSS_DEVICE_SYNC_PREREQUISITES).toEqual([
      'Owner-approved device pairing and lost-key recovery policy.',
      'Non-exportable per-device private keys and owner data-key envelopes.',
      'Authenticated owner-scoped outbox rows with deterministic causal versions.',
      'A real IndexedDB apply adapter for create, update, and delete operations.',
      'Durable per-operation apply receipts, replay cursors, and idempotency keys.',
      'Two-device tests for bootstrap, offline replay, conflicts, tampering, and revocation.',
    ]);
  });

  it('initializes as a side-effect-free capability probe', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const eventSubscription = vi.spyOn(window, 'addEventListener');

    await expect(crossDeviceSyncService.initialize()).resolves.toBe(
      CROSS_DEVICE_SYNC_CAPABILITIES,
    );

    expect(storageWrite).not.toHaveBeenCalled();
    expect(eventSubscription).not.toHaveBeenCalled();
  });

  it('reports disabled state without inventing devices, queues, conflicts, or receipts', async () => {
    expect(crossDeviceSyncService.getSyncStatus()).toEqual({
      isOnline: false,
      lastSync: null,
      pendingUploads: 0,
      pendingDownloads: 0,
      conflicts: [],
      syncMode: 'disabled',
      capability: CROSS_DEVICE_SYNC_CAPABILITIES,
    });
    await expect(crossDeviceSyncService.getDevices()).resolves.toEqual([]);
  });

  it('fails closed instead of accepting an unreceipted local outbox write', async () => {
    await expect(crossDeviceSyncService.syncEntity()).rejects.toMatchObject({
      name: 'CrossDeviceSyncUnavailableError',
      code: 'owner_key_ceremony_required',
    });
    expect(localStorage.getItem('bubble-sync-queue')).toBeNull();
    expect(localStorage.getItem('bubble-sync-key')).toBeNull();
  });

  it('does not pretend device revocation works without key rotation', async () => {
    await expect(crossDeviceSyncService.revokeDevice()).rejects.toMatchObject({
      code: 'owner_key_ceremony_required',
    });
  });
});
