/**
 * Sync conflict notification banner.
 *
 * The sync layer has always been able to *detect* cross-device conflicts
 * (crossDeviceSyncService.handleConflict, enhancedSyncService.notifyConflict)
 * and has always had a resolution dialog (ConflictResolutionDialog), but there
 * was no surface connecting the two: `setShowConflictDialog(true)` existed
 * nowhere in the codebase, so the dialog was unreachable for real users
 * (REVIVE Run 124, 2026-07-27). This is the missing announcement + entry point.
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

interface SyncConflictNotificationProps {
  /** Number of unresolved conflicts awaiting the user. */
  count: number;
  /** Open the resolution dialog for the oldest pending conflict. */
  onResolve: () => void;
}

export function SyncConflictNotification({ count, onResolve }: SyncConflictNotificationProps) {
  if (count < 1) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-lg border border-destructive/40 bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <span className="text-sm font-medium">
        {count > 1 ? `Sync conflict detected (${count})` : 'Sync conflict detected'}
      </span>
      <Button size="sm" variant="destructive" onClick={onResolve}>
        Resolve conflict
      </Button>
    </div>
  );
}
