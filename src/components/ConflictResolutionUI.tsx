/**
 * Conflict Resolution UI - Production CRDT conflict resolution interface
 * Handles real-time sync conflicts with visual diff and merge capabilities
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  GitMerge, 
  AlertTriangle, 
  Check, 
  X, 
  Clock,
  User,
  Smartphone,
  Monitor,
  ChevronRight,
  Zap
} from 'lucide-react';
import { DiffView } from './DiffView';
import { useToast } from '@/hooks/use-toast';

interface ConflictData {
  id: string;
  entityType: 'task' | 'bubble' | 'settings';
  entityId: string;
  conflictType: 'concurrent_edit' | 'delete_vs_edit' | 'property_mismatch';
  localVersion: any;
  remoteVersion: any;
  commonAncestor?: any;
  localDevice: string;
  remoteDevice: string;
  timestamp: number;
  autoMergeAttempted: boolean;
  autoMergeSuccess: boolean;
}

interface ConflictResolutionProps {
  conflicts: ConflictData[];
  onResolve: (conflictId: string, resolution: 'local' | 'remote' | 'merged', mergedData?: any) => void;
  onResolveAll: (resolution: 'local' | 'remote') => void;
}

export const ConflictResolutionUI: React.FC<ConflictResolutionProps> = ({
  conflicts,
  onResolve,
  onResolveAll
}) => {
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [mergedData, setMergedData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  const currentConflict = conflicts.find(c => c.id === selectedConflict);

  useEffect(() => {
    if (conflicts.length > 0 && !selectedConflict) {
      setSelectedConflict(conflicts[0].id);
    }
  }, [conflicts, selectedConflict]);

  const getDeviceIcon = (deviceName: string) => {
    if (deviceName.includes('iPhone') || deviceName.includes('Mobile')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const getConflictTypeDescription = (type: string) => {
    switch (type) {
      case 'concurrent_edit':
        return 'Both devices edited the same item simultaneously';
      case 'delete_vs_edit':
        return 'One device deleted while another edited';
      case 'property_mismatch':
        return 'Different properties were changed on each device';
      default:
        return 'Unknown conflict type';
    }
  };

  const getConflictSeverity = (conflict: ConflictData) => {
    if (conflict.conflictType === 'delete_vs_edit') return 'high';
    if (conflict.autoMergeAttempted && !conflict.autoMergeSuccess) return 'medium';
    return 'low';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'default';
      default: return 'outline';
    }
  };

  const generateSmartMerge = (conflict: ConflictData) => {
    if (!conflict.localVersion || !conflict.remoteVersion) return null;

    const merged = { ...conflict.localVersion };
    
    // Smart merge logic based on conflict type
    if (conflict.conflictType === 'concurrent_edit') {
      // Merge non-conflicting properties
      Object.keys(conflict.remoteVersion).forEach(key => {
        if (conflict.localVersion[key] === conflict.commonAncestor?.[key]) {
          // Local didn't change this property, use remote
          merged[key] = conflict.remoteVersion[key];
        }
        // If both changed the same property, prefer the more recent timestamp
        else if (conflict.remoteVersion[key] !== conflict.commonAncestor?.[key] &&
                 conflict.localVersion[key] !== conflict.commonAncestor?.[key]) {
          // Both changed - this requires manual resolution
          merged[key] = conflict.localVersion[key]; // Default to local
        }
      });
      
      // For timestamps, always use the latest
      if (conflict.remoteVersion.updatedAt > conflict.localVersion.updatedAt) {
        merged.updatedAt = Date.now(); // New timestamp for merged version
      }
    }
    
    return merged;
  };

  const handleResolve = (resolution: 'local' | 'remote' | 'merged') => {
    if (!currentConflict) return;
    
    let resolvedData = undefined;
    if (resolution === 'merged' && mergedData) {
      resolvedData = mergedData;
    }
    
    onResolve(currentConflict.id, resolution, resolvedData);
    
    toast({
      title: "Conflict Resolved",
      description: `Used ${resolution} version${resolution === 'merged' ? ' with smart merge' : ''}.`,
    });
    
    // Move to next conflict
    const currentIndex = conflicts.findIndex(c => c.id === selectedConflict);
    if (currentIndex < conflicts.length - 1) {
      setSelectedConflict(conflicts[currentIndex + 1].id);
    } else {
      setSelectedConflict(null);
    }
  };

  const handleSmartMerge = () => {
    if (!currentConflict) return;
    
    const smartMerged = generateSmartMerge(currentConflict);
    if (smartMerged) {
      setMergedData(smartMerged);
      setActiveTab('merged');
      toast({
        title: "Smart Merge Generated",
        description: "Review the merged version and apply if it looks correct.",
      });
    }
  };

  if (conflicts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">All Synced</h3>
          <p className="text-muted-foreground">
            No sync conflicts detected. All your devices are in sync.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Conflict List */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Conflicts ({conflicts.length})
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => onResolveAll('local')}>
              Use All Local
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-96">
            <div className="space-y-2 p-4">
              {conflicts.map((conflict) => (
                <Card 
                  key={conflict.id}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedConflict === conflict.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedConflict(conflict.id)}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant={getSeverityColor(getConflictSeverity(conflict))}>
                        {conflict.entityType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(conflict.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    <p className="text-sm font-medium truncate">
                      {conflict.entityId}
                    </p>
                    
                    <p className="text-xs text-muted-foreground">
                      {getConflictTypeDescription(conflict.conflictType)}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1">
                        {getDeviceIcon(conflict.localDevice)}
                        <span className="truncate max-w-[60px]">{conflict.localDevice}</span>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        {getDeviceIcon(conflict.remoteDevice)}
                        <span className="truncate max-w-[60px]">{conflict.remoteDevice}</span>
                      </div>
                    </div>
                    
                    {conflict.autoMergeAttempted && (
                      <div className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-warning" />
                        <span className="text-xs text-muted-foreground">
                          Auto-merge {conflict.autoMergeSuccess ? 'succeeded' : 'failed'}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Conflict Details */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Conflict Resolution</CardTitle>
            {currentConflict && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleSmartMerge}>
                  <GitMerge className="h-4 w-4 mr-1" />
                  Smart Merge
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleResolve('local')}>
                  Use Local
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleResolve('remote')}>
                  Use Remote
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {!currentConflict ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Select a conflict to resolve</p>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="local">Local Version</TabsTrigger>
                <TabsTrigger value="remote">Remote Version</TabsTrigger>
                <TabsTrigger value="merged" disabled={!mergedData}>Merged</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      {getDeviceIcon(currentConflict.localDevice)}
                      Local Device
                    </h4>
                    <p className="text-sm text-muted-foreground">{currentConflict.localDevice}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      {getDeviceIcon(currentConflict.remoteDevice)}
                      Remote Device
                    </h4>
                    <p className="text-sm text-muted-foreground">{currentConflict.remoteDevice}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Conflict Type</h4>
                  <p className="text-sm text-muted-foreground">
                    {getConflictTypeDescription(currentConflict.conflictType)}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Timestamp</h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date(currentConflict.timestamp).toLocaleString()}
                  </p>
                </div>
                
                {currentConflict.localVersion && currentConflict.remoteVersion && (
                  <DiffView
                    original={JSON.stringify(currentConflict.localVersion, null, 2)}
                    modified={JSON.stringify(currentConflict.remoteVersion, null, 2)}
                    title="Version Comparison"
                  />
                )}
              </TabsContent>
              
              <TabsContent value="local">
                <ScrollArea className="h-96">
                  <pre className="text-sm bg-muted p-4 rounded">
                    {JSON.stringify(currentConflict.localVersion, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="remote">
                <ScrollArea className="h-96">
                  <pre className="text-sm bg-muted p-4 rounded">
                    {JSON.stringify(currentConflict.remoteVersion, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="merged">
                {mergedData ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Smart Merged Version</h4>
                      <Button onClick={() => handleResolve('merged')}>
                        <Check className="h-4 w-4 mr-1" />
                        Apply Merge
                      </Button>
                    </div>
                    <ScrollArea className="h-80">
                      <pre className="text-sm bg-muted p-4 rounded">
                        {JSON.stringify(mergedData, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      Click "Smart Merge" to generate a merged version
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};