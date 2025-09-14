/**
 * Phase 1: Offline Indicator Component
 * Displays network/sync status with mobile-optimized UI
 */

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Wifi, 
  WifiOff, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { offlineTaskQueue, SyncStatus } from '@/services/offlineTaskQueue';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

export const OfflineIndicator: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    pendingTasks: 0,
    lastSync: Date.now(),
    syncInProgress: false,
    conflictsCount: 0
  });
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Subscribe to sync status updates
    const unsubscribe = offlineTaskQueue.onSyncStatusChange(setSyncStatus);
    
    // Initialize offline task queue
    offlineTaskQueue.initialize();
    
    return unsubscribe;
  }, []);

  const handleManualSync = async () => {
    if (!syncStatus.isOnline) {
      toast({
        title: "No internet connection",
        description: "Please check your connection and try again",
        variant: "destructive"
      });
      return;
    }

    try {
      await offlineTaskQueue.processPendingTasks();
      toast({
        title: "Sync completed",
        description: "All tasks have been synchronized",
      });
    } catch (error) {
      toast({
        title: "Sync failed",
        description: "Some tasks could not be synchronized",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = () => {
    if (!syncStatus.isOnline) {
      return <WifiOff className="h-4 w-4 text-destructive" />;
    }
    
    if (syncStatus.syncInProgress) {
      return <RefreshCw className="h-4 w-4 text-primary animate-spin" />;
    }
    
    if (syncStatus.conflictsCount > 0) {
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
    
    if (syncStatus.pendingTasks > 0) {
      return <CloudOff className="h-4 w-4 text-muted-foreground" />;
    }
    
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  };

  const getStatusText = () => {
    if (!syncStatus.isOnline) return "Offline";
    if (syncStatus.syncInProgress) return "Syncing...";
    if (syncStatus.conflictsCount > 0) return `${syncStatus.conflictsCount} conflicts`;
    if (syncStatus.pendingTasks > 0) return `${syncStatus.pendingTasks} pending`;
    return "Synced";
  };

  const getStatusVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    if (!syncStatus.isOnline || syncStatus.conflictsCount > 0) return "destructive";
    if (syncStatus.pendingTasks > 0) return "secondary";
    return "default";
  };

  const formatLastSync = () => {
    const diff = Date.now() - syncStatus.lastSync;
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  // Don't show indicator if everything is perfect and online
  if (syncStatus.isOnline && syncStatus.pendingTasks === 0 && syncStatus.conflictsCount === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2"
      >
        <Badge
          variant={getStatusVariant()}
          className="cursor-pointer flex items-center gap-1 min-h-[32px] px-3"
          onClick={() => setShowDetails(!showDetails)}
        >
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </Badge>
        
        {syncStatus.isOnline && syncStatus.pendingTasks > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={syncStatus.syncInProgress}
            className="min-h-[32px]"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${syncStatus.syncInProgress ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        )}
      </motion.div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="w-80"
          >
            <Alert>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {syncStatus.isOnline ? 
                    <Cloud className="h-4 w-4 text-primary" /> : 
                    <CloudOff className="h-4 w-4 text-destructive" />
                  }
                </div>
                
                <div className="flex-1">
                  <AlertDescription className="space-y-3">
                    <div>
                      <h4 className="font-medium mb-1">
                        {syncStatus.isOnline ? 'Online Mode' : 'Offline Mode'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {syncStatus.isOnline ? 
                          'Connected to the internet. Tasks will sync automatically.' :
                          'No internet connection. Tasks are saved locally and will sync when connection is restored.'
                        }
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Pending:</span>
                        <span className="ml-1 font-medium">{syncStatus.pendingTasks}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Conflicts:</span>
                        <span className="ml-1 font-medium">{syncStatus.conflictsCount}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Last sync:</span>
                        <span className="ml-1 font-medium">{formatLastSync()}</span>
                      </div>
                    </div>

                    {syncStatus.conflictsCount > 0 && (
                      <Alert className="p-3">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="ml-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">
                              {syncStatus.conflictsCount} sync conflicts need resolution
                            </span>
                            <Button variant="outline" size="sm" className="ml-2">
                              Resolve
                            </Button>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {!syncStatus.isOnline && (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded">
                        <WifiOff className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Working offline - your data is safe
                        </span>
                      </div>
                    )}
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * Hook for components that need sync status
 */
export const useSyncStatus = () => {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    pendingTasks: 0,
    lastSync: Date.now(),
    syncInProgress: false,
    conflictsCount: 0
  });

  useEffect(() => {
    const unsubscribe = offlineTaskQueue.onSyncStatusChange(setStatus);
    return unsubscribe;
  }, []);

  const manualSync = async () => {
    if (status.isOnline) {
      await offlineTaskQueue.processPendingTasks();
    }
  };

  return {
    status,
    manualSync,
    hasConflicts: status.conflictsCount > 0,
    hasPendingTasks: status.pendingTasks > 0,
    isOffline: !status.isOnline
  };
};