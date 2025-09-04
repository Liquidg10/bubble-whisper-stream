import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  GitMerge, 
  Users, 
  Wifi, 
  WifiOff, 
  Clock,
  AlertTriangle,
  Check,
  X,
  RefreshCw
} from 'lucide-react';
import { enhancedSyncService, SyncConflict } from '@/services/enhancedSyncService';
import { useToast } from '@/hooks/use-toast';

interface SyncStatus {
  isOnline: boolean;
  safeModeEnabled: boolean;
  pendingConflicts: number;
  lastSync: Date | null;
  deviceId: string;
}

export const SyncDashboard: React.FC = () => {
  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    safeModeEnabled: enhancedSyncService.isSafeModeEnabled(),
    pendingConflicts: 0,
    lastSync: null,
    deviceId: ''
  });
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<any[]>([]);

  useEffect(() => {
    const handleConflict = (event: CustomEvent) => {
      const { conflict } = event.detail;
      setConflicts(prev => [...prev, conflict]);
      setSyncStatus(prev => ({ ...prev, pendingConflicts: prev.pendingConflicts + 1 }));
    };

    const handlePresenceUpdate = (event: CustomEvent) => {
      const { state } = event.detail;
      setPresenceUsers(Object.values(state).flat());
    };

    const handleOnlineStatus = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: navigator.onLine }));
    };

    window.addEventListener('sync-conflict', handleConflict as EventListener);
    window.addEventListener('presence-update', handlePresenceUpdate as EventListener);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    return () => {
      window.removeEventListener('sync-conflict', handleConflict as EventListener);
      window.removeEventListener('presence-update', handlePresenceUpdate as EventListener);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  const toggleSafeMode = () => {
    if (syncStatus.safeModeEnabled) {
      enhancedSyncService.disableSafeMode();
    } else {
      enhancedSyncService.enableSafeMode();
    }
    setSyncStatus(prev => ({ ...prev, safeModeEnabled: !prev.safeModeEnabled }));
    
    toast({
      title: `Safe Mode ${syncStatus.safeModeEnabled ? 'Disabled' : 'Enabled'}`,
      description: syncStatus.safeModeEnabled 
        ? 'Conflicts will now auto-resolve' 
        : 'You will review conflicts manually'
    });
  };

  const resolveConflict = async (conflictId: string, resolution: 'local' | 'remote' | 'custom') => {
    try {
      await enhancedSyncService.resolveConflict(conflictId, resolution);
      setConflicts(prev => prev.filter(c => c.id !== conflictId));
      setSyncStatus(prev => ({ ...prev, pendingConflicts: prev.pendingConflicts - 1 }));
      setSelectedConflict(null);
      
      toast({
        title: "Conflict Resolved",
        description: `Applied ${resolution} version`
      });
    } catch (error) {
      toast({
        title: "Resolution Failed",
        description: "Could not resolve conflict",
        variant: "destructive"
      });
    }
  };

  const renderConflictDiff = (conflict: SyncConflict) => {
    const local = JSON.parse(conflict.local_data);
    const remote = JSON.parse(conflict.remote_data);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-50">Local</Badge>
              {conflict.local_timestamp}
            </h4>
            <Card className="p-3 bg-blue-50/50">
              <p className="text-sm">{local.content || 'No content'}</p>
              {local.tags?.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {local.tags.map((tag: any) => (
                    <Badge key={tag.id} variant="secondary" className="text-xs">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50">Remote</Badge>
              {conflict.remote_timestamp}
            </h4>
            <Card className="p-3 bg-green-50/50">
              <p className="text-sm">{remote.content || 'No content'}</p>
              {remote.tags?.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {remote.tags.map((tag: any) => (
                    <Badge key={tag.id} variant="secondary" className="text-xs">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="flex gap-2 justify-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => resolveConflict(conflict.id, 'local')}
            className="bg-blue-50 hover:bg-blue-100"
          >
            <Check className="h-4 w-4 mr-2" />
            Keep Local
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => resolveConflict(conflict.id, 'remote')}
            className="bg-green-50 hover:bg-green-100"
          >
            <Check className="h-4 w-4 mr-2" />
            Keep Remote
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Sync Status Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Sync Status
            </div>
            <div className="flex items-center gap-2">
              {syncStatus.isOnline ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <Wifi className="h-3 w-3 mr-1" />
                  Online
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <WifiOff className="h-3 w-3 mr-1" />
                  Offline
                </Badge>
              )}
              <Button
                size="sm"
                variant={syncStatus.safeModeEnabled ? "default" : "outline"}
                onClick={toggleSafeMode}
              >
                <Shield className="h-4 w-4 mr-2" />
                Safe Mode
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{conflicts.length}</div>
              <div className="text-sm text-muted-foreground">Pending Conflicts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{presenceUsers.length}</div>
              <div className="text-sm text-muted-foreground">Active Users</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">E2EE</div>
              <div className="text-sm text-muted-foreground">Encryption</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">CRDT</div>
              <div className="text-sm text-muted-foreground">Conflict Resolution</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts Section */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Sync Conflicts
              <Badge variant="outline">{conflicts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {syncStatus.safeModeEnabled 
                  ? "Safe Mode is enabled. Review and resolve conflicts manually."
                  : "Conflicts detected. Enable Safe Mode to review before auto-resolution."
                }
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              {conflicts.map((conflict) => (
                <Card key={conflict.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GitMerge className="h-4 w-4" />
                      <span className="font-medium">{conflict.entity_type}</span>
                      <Badge variant="outline" className="text-xs">
                        {conflict.entity_id.substring(0, 8)}...
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(conflict.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {selectedConflict?.id === conflict.id ? (
                    <div className="space-y-4">
                      {renderConflictDiff(conflict)}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedConflict(null)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedConflict(conflict)}
                    >
                      Review Conflict
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Presence Section */}
      {presenceUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {presenceUsers.map((user, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium">
                      Device {user.device_id?.substring(0, 8)}...
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {user.current_view || 'Viewing app'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Force Sync
            </Button>
            <Button variant="outline" size="sm">
              <Shield className="h-4 w-4 mr-2" />
              Backup Data
            </Button>
            <Button variant="outline" size="sm">
              <Users className="h-4 w-4 mr-2" />
              Invite Users
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};