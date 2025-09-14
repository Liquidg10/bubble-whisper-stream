/**
 * Calendar Sync Panel
 * 
 * Comprehensive UI for managing calendar-task synchronization,
 * resolving conflicts, and monitoring sync status.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  RotateCw, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Settings,
  GitMerge,
  Users,
  MapPin,
  XCircle
} from 'lucide-react';
import { calendarTaskSyncManager, SyncConflict, CalendarTaskMapping } from '@/services/calendarTaskSyncManager';
import { useTaskStore } from '@/stores/taskStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function CalendarSyncPanel() {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [syncProgress, setSyncProgress] = useState(0);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [mappings, setMappings] = useState<CalendarTaskMapping[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [syncStats, setSyncStats] = useState({
    tasksProcessed: 0,
    eventsProcessed: 0,
    conflictsDetected: 0,
    errors: []
  });

  const { tasks } = useTaskStore();
  const { toast } = useToast();

  useEffect(() => {
    loadSyncData();
  }, []);

  const loadSyncData = () => {
    const pendingConflicts = calendarTaskSyncManager.getPendingConflicts();
    setConflicts(pendingConflicts);
    
    // Load mappings (this would be extended to get from the sync manager)
    const taskMappings: CalendarTaskMapping[] = [];
    tasks.forEach(task => {
      const mapping = calendarTaskSyncManager.getMappingByTaskId(task.id);
      if (mapping) {
        taskMappings.push(mapping);
      }
    });
    setMappings(taskMappings);
  };

  const handleFullSync = async () => {
    setSyncStatus('syncing');
    setSyncProgress(0);
    
    try {
      const progressInterval = setInterval(() => {
        setSyncProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const result = await calendarTaskSyncManager.performFullSync();
      
      clearInterval(progressInterval);
      setSyncProgress(100);
      setSyncStats(result);
      
      toast({
        title: "Sync Complete",
        description: `Processed ${result.tasksProcessed} tasks and ${result.eventsProcessed} events`,
      });
      
      // Reload data after sync
      setTimeout(() => {
        loadSyncData();
        setSyncStatus('idle');
        setSyncProgress(0);
      }, 1000);
      
    } catch (error: any) {
      setSyncStatus('error');
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleResolveConflict = async (
    conflict: SyncConflict, 
    resolution: 'prefer-task' | 'prefer-calendar' | 'merge',
    manualValues?: any
  ) => {
    try {
      const success = await calendarTaskSyncManager.resolveConflict(
        conflict.id, 
        resolution, 
        manualValues
      );
      
      if (success) {
        toast({
          title: "Conflict Resolved",
          description: `Applied ${resolution.replace('-', ' ')} resolution`,
        });
        
        loadSyncData();
        setSelectedConflict(null);
      } else {
        throw new Error('Failed to resolve conflict');
      }
    } catch (error: any) {
      toast({
        title: "Resolution Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getConflictIcon = (conflictType: string) => {
    switch (conflictType) {
      case 'time': return <Clock className="h-4 w-4" />;
      case 'location': return <MapPin className="h-4 w-4" />;
      case 'title': return <AlertTriangle className="h-4 w-4" />;
      default: return <XCircle className="h-4 w-4" />;
    }
  };

  const getSyncDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'task-to-calendar': return <ArrowRight className="h-4 w-4" />;
      case 'calendar-to-task': return <ArrowLeft className="h-4 w-4" />;
      case 'bidirectional': return <GitMerge className="h-4 w-4" />;
      default: return <RotateCw className="h-4 w-4" />;
    }
  };

  const renderConflictResolutionDialog = (conflict: SyncConflict) => {
    const [resolution, setResolution] = useState<'prefer-task' | 'prefer-calendar' | 'merge'>('prefer-task');
    const [manualTitle, setManualTitle] = useState('');
    const [manualTime, setManualTime] = useState('');
    const [manualLocation, setManualLocation] = useState('');

    return (
      <Dialog open={selectedConflict?.id === conflict.id} onOpenChange={() => setSelectedConflict(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getConflictIcon(conflict.conflictType)}
              Resolve {conflict.conflictType} Conflict
            </DialogTitle>
            <DialogDescription>
              Choose how to resolve the conflict between task and calendar data
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Conflict Details */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Task Value
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm font-mono bg-muted p-2 rounded">
                    {conflict.taskValue}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Calendar Value
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm font-mono bg-muted p-2 rounded">
                    {conflict.calendarValue}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Resolution Options */}
            <div className="space-y-4">
              <Label>Resolution Strategy</Label>
              <Select value={resolution} onValueChange={(value: any) => setResolution(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefer-task">Prefer Task Value</SelectItem>
                  <SelectItem value="prefer-calendar">Prefer Calendar Value</SelectItem>
                  <SelectItem value="merge">Merge Intelligently</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Manual Resolution Fields */}
            {resolution === 'merge' && (
              <div className="space-y-4 border p-4 rounded-lg">
                <Label>Merge Strategy</Label>
                <p className="text-sm text-muted-foreground">
                  The system will intelligently combine values from both sources.
                </p>
              </div>
            )}

                {conflict.conflictType === 'time' && (
                  <div className="space-y-2">
                    <Label htmlFor="manual-time">Start Time</Label>
                    <Input
                      id="manual-time"
                      type="datetime-local"
                      value={manualTime}
                      onChange={(e) => setManualTime(e.target.value)}
                    />
                  </div>
                )}

                {conflict.conflictType === 'location' && (
                  <div className="space-y-2">
                    <Label htmlFor="manual-location">Location</Label>
                    <Input
                      id="manual-location"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      placeholder="Enter merged location"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedConflict(null)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  handleResolveConflict(conflict, resolution);
                }}
              >
                Resolve Conflict
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <RotateCw className="h-5 w-5" />
            Calendar Sync Manager
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSyncData}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            
            <Button
              onClick={handleFullSync}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-2"
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              {syncStatus === 'syncing' ? 'Syncing...' : 'Full Sync'}
            </Button>
          </div>
        </div>

        {syncStatus === 'syncing' && (
          <div className="space-y-2">
            <Progress value={syncProgress} className="h-2" />
            <p className="text-sm text-muted-foreground">
              Synchronizing tasks and calendar events...
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conflicts" className="relative">
              Conflicts
              {conflicts.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                  {conflicts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mappings">Mappings</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{mappings.length}</div>
                  <p className="text-xs text-muted-foreground">Active Mappings</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-warning">{conflicts.length}</div>
                  <p className="text-xs text-muted-foreground">Pending Conflicts</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-success">{syncStats.tasksProcessed}</div>
                  <p className="text-xs text-muted-foreground">Tasks Synced</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-info">{syncStats.eventsProcessed}</div>
                  <p className="text-xs text-muted-foreground">Events Synced</p>
                </CardContent>
              </Card>
            </div>

            {conflicts.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You have {conflicts.length} pending sync conflicts that need resolution.
                </AlertDescription>
              </Alert>
            )}

            {syncStats.errors.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Last sync encountered {syncStats.errors.length} errors. Check the logs for details.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="conflicts" className="space-y-4">
            {conflicts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                No sync conflicts detected
              </div>
            ) : (
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {conflicts.map((conflict) => (
                    <Card key={conflict.id} className="border-warning">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {getConflictIcon(conflict.conflictType)}
                            <div className="space-y-1">
                              <h4 className="font-medium">
                                {conflict.conflictType.charAt(0).toUpperCase() + conflict.conflictType.slice(1)} Conflict
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Task: {conflict.taskValue}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Calendar: {conflict.calendarValue}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(conflict.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          
                          <Button
                            size="sm"
                            onClick={() => setSelectedConflict(conflict)}
                          >
                            Resolve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Render conflict resolution dialogs */}
            {conflicts.map(conflict => renderConflictResolutionDialog(conflict))}
          </TabsContent>

          <TabsContent value="mappings" className="space-y-4">
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {mappings.map((mapping) => {
                  const task = tasks.find(t => t.id === mapping.taskId);
                  
                  return (
                    <Card key={`${mapping.taskId}-${mapping.eventId}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getSyncDirectionIcon(mapping.syncDirection)}
                            <div>
                              <h4 className="font-medium">{task?.title || 'Unknown Task'}</h4>
                              <p className="text-sm text-muted-foreground">
                                Last synced: {new Date(mapping.lastSyncedAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {mapping.syncDirection.replace('-', ' ')}
                            </Badge>
                            
                            <Badge 
                              variant={mapping.conflictStatus === 'none' ? 'secondary' : 'destructive'}
                            >
                              {mapping.conflictStatus}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                
                {mappings.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No active sync mappings
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Alert>
              <Settings className="h-4 w-4" />
              <AlertDescription>
                Sync settings are automatically configured based on your calendar integration preferences.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Auto-sync interval</Label>
                <Select defaultValue="15">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <Label>Conflict resolution priority</Label>
                <Select defaultValue="task">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Prefer Task</SelectItem>
                    <SelectItem value="calendar">Prefer Calendar</SelectItem>
                    <SelectItem value="recent">Most Recent</SelectItem>
                    <SelectItem value="manual">Always Ask</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}