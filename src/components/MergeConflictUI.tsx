/**
 * User-Visible Merge UI - Phase 2 Architecture
 * Handles horizon collisions, merge conflicts, and provides audit trail
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  GitMerge, 
  AlertTriangle, 
  Clock, 
  User, 
  Monitor,
  ArrowRight,
  Undo2,
  Eye,
  CheckCircle2,
  XCircle,
  Info
} from 'lucide-react';
import { dualWriteMigrationSystem, type MigrationState } from '@/services/dualWriteMigrationSystem';
import { decisionTracer } from '@/services/decisionTracer';

export interface MergeConflict {
  id: string;
  bubbleId: string;
  field: string;
  localValue: any;
  remoteValue: any;
  timestamp: number;
  source: 'horizon_collision' | 'concurrent_edit' | 'migration_conflict';
  resolved: boolean;
  resolution?: {
    chosenValue: any;
    reasoning: string;
    resolvedBy: 'user' | 'auto';
    resolvedAt: number;
  };
}

export interface HorizonCollision {
  bubbleId: string;
  previousHorizon: string;
  newHorizon: string;
  mergedProperties: Record<string, any>;
  timestamp: number;
  autoResolved: boolean;
}

interface MergeConflictUIProps {
  conflicts?: MergeConflict[];
  onResolveConflict?: (conflictId: string, resolution: any) => void;
  className?: string;
}

export function MergeConflictUI({ conflicts: externalConflicts, onResolveConflict, className }: MergeConflictUIProps) {
  const [conflicts, setConflicts] = useState<MergeConflict[]>(externalConflicts || []);
  const [horizonCollisions, setHorizonCollisions] = useState<HorizonCollision[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [auditTrail, setAuditTrail] = useState<any[]>([]);
  const [showMergedBanner, setShowMergedBanner] = useState(false);

  useEffect(() => {
    // Load existing conflicts from migration system
    loadConflictsFromMigrationSystem();
    loadAuditTrail();

    // Check if we should show merged banner
    const hasRecentMerges = horizonCollisions.some(c => 
      Date.now() - c.timestamp < 300000 // 5 minutes
    );
    setShowMergedBanner(hasRecentMerges);
  }, []);

  const loadConflictsFromMigrationSystem = () => {
    const migrations = dualWriteMigrationSystem.getAllMigrations();
    const allConflicts: MergeConflict[] = [];

    migrations.forEach(migration => {
      migration.conflicts.forEach(conflict => {
        allConflicts.push({
          id: `${migration.bubbleId}-${conflict.field}-${conflict.timestamp}`,
          bubbleId: migration.bubbleId,
          field: conflict.field,
          localValue: conflict.bubbleValue,
          remoteValue: conflict.taskValue,
          timestamp: conflict.timestamp,
          source: 'migration_conflict',
          resolved: conflict.resolved
        });
      });
    });

    setConflicts(allConflicts);
  };

  const loadAuditTrail = () => {
    // Get decision traces related to merges
    const traces = decisionTracer.getTraces()
      .filter(trace => trace.action.includes('merge') || trace.action.includes('conflict'))
      .slice(0, 50); // Last 50 merge-related decisions
    
    setAuditTrail(traces);
  };

  const resolveConflict = (conflictId: string, chosenValue: any, reasoning: string) => {
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict) return;

    const resolution = {
      chosenValue,
      reasoning,
      resolvedBy: 'user' as const,
      resolvedAt: Date.now()
    };

    // Update conflict state
    setConflicts(prev => prev.map(c => 
      c.id === conflictId 
        ? { ...c, resolved: true, resolution }
        : c
    ));

    // Record decision
    decisionTracer.trace({
      action: 'conflict_resolved_manual',
      input: { conflictId, field: conflict.field, chosenValue },
      confidence: 1.0,
      reasoning: `User manually resolved conflict: ${reasoning}`,
      metadata: { bubbleId: conflict.bubbleId, resolutionTime: Date.now() }
    });

    // Callback to parent
    onResolveConflict?.(conflictId, resolution);
  };

  const autoResolveConflict = (conflictId: string) => {
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict) return;

    // Simple auto-resolution logic: prefer more recent value
    const chosenValue = conflict.timestamp > Date.now() - 60000 
      ? conflict.remoteValue 
      : conflict.localValue;

    const resolution = {
      chosenValue,
      reasoning: 'Auto-resolved using recency heuristic',
      resolvedBy: 'auto' as const,
      resolvedAt: Date.now()
    };

    setConflicts(prev => prev.map(c => 
      c.id === conflictId 
        ? { ...c, resolved: true, resolution }
        : c
    ));

    decisionTracer.trace({
      action: 'conflict_resolved_auto',
      input: { conflictId, field: conflict.field, chosenValue },
      confidence: 0.7,
      reasoning: 'Auto-resolved based on timestamp recency',
      metadata: { bubbleId: conflict.bubbleId }
    });
  };

  const simulateHorizonCollision = () => {
    const collision: HorizonCollision = {
      bubbleId: `bubble-${Date.now()}`,
      previousHorizon: 'today',
      newHorizon: 'week',
      mergedProperties: {
        priority: 75,
        tags: ['work', 'merged'],
        size: 0.8
      },
      timestamp: Date.now(),
      autoResolved: true
    };

    setHorizonCollisions(prev => [collision, ...prev]);
    setShowMergedBanner(true);

    // Auto-hide banner after 10 seconds
    setTimeout(() => setShowMergedBanner(false), 10000);
  };

  const getConflictIcon = (source: MergeConflict['source']) => {
    switch (source) {
      case 'horizon_collision':
        return <ArrowRight className="h-4 w-4 text-blue-600" />;
      case 'concurrent_edit':
        return <Monitor className="h-4 w-4 text-yellow-600" />;
      case 'migration_conflict':
        return <GitMerge className="h-4 w-4 text-purple-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSourceLabel = (source: MergeConflict['source']) => {
    switch (source) {
      case 'horizon_collision':
        return 'Horizon Merge';
      case 'concurrent_edit':
        return 'Concurrent Edit';
      case 'migration_conflict':
        return 'Migration';
      default:
        return 'Unknown';
    }
  };

  const unresolvedConflicts = conflicts.filter(c => !c.resolved);
  const resolvedConflicts = conflicts.filter(c => c.resolved);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Merged Banner */}
      {showMergedBanner && (
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <GitMerge className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>Merged:</strong> Items have been automatically combined based on horizon changes. 
              <button 
                className="text-blue-600 underline ml-1"
                onClick={() => setSelectedConflict(horizonCollisions[0]?.bubbleId || null)}
              >
                View details
              </button>
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowMergedBanner(false)}
            >
              ×
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={simulateHorizonCollision}>
          <GitMerge className="h-4 w-4 mr-2" />
          Simulate Merge
        </Button>
        {unresolvedConflicts.length > 0 && (
          <Button variant="default" size="sm" onClick={() => {
            unresolvedConflicts.forEach(conflict => autoResolveConflict(conflict.id));
          }}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Auto-Resolve All ({unresolvedConflicts.length})
          </Button>
        )}
      </div>

      <Tabs defaultValue="conflicts" className="w-full">
        <TabsList>
          <TabsTrigger value="conflicts">
            Conflicts 
            {unresolvedConflicts.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {unresolvedConflicts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="horizon">Horizon Merges</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        {/* Conflicts Tab */}
        <TabsContent value="conflicts" className="space-y-4">
          {unresolvedConflicts.length > 0 ? (
            <div className="space-y-3">
              {unresolvedConflicts.map(conflict => (
                <Card key={conflict.id} className="border-red-200 dark:border-red-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-base">
                      <div className="flex items-center gap-2">
                        {getConflictIcon(conflict.source)}
                        <span>Conflict in {conflict.field}</span>
                        <Badge variant="outline">{getSourceLabel(conflict.source)}</Badge>
                      </div>
                      <Badge variant="destructive">Unresolved</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Bubble: <code className="font-mono text-xs">{conflict.bubbleId.substring(0, 8)}...</code>
                      <span className="mx-2">•</span>
                      <Clock className="h-3 w-3 inline mr-1" />
                      {new Date(conflict.timestamp).toLocaleString()}
                    </div>

                    {/* Value Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-sm">Local Value</span>
                        </div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                          {JSON.stringify(conflict.localValue, null, 2)}
                        </pre>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-2"
                          onClick={() => resolveConflict(conflict.id, conflict.localValue, 'User chose local value')}
                        >
                          Choose This
                        </Button>
                      </div>

                      <div className="p-3 border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Monitor className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-sm">Remote Value</span>
                        </div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                          {JSON.stringify(conflict.remoteValue, null, 2)}
                        </pre>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-2"
                          onClick={() => resolveConflict(conflict.id, conflict.remoteValue, 'User chose remote value')}
                        >
                          Choose This
                        </Button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => autoResolveConflict(conflict.id)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Auto-Resolve
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        View Full Context
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
                <p className="text-muted-foreground">No unresolved conflicts</p>
                {resolvedConflicts.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {resolvedConflicts.length} conflicts resolved
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Horizon Merges Tab */}
        <TabsContent value="horizon" className="space-y-4">
          {horizonCollisions.length > 0 ? (
            <div className="space-y-3">
              {horizonCollisions.map((collision, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-base">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-blue-600" />
                        <span>{collision.previousHorizon} → {collision.newHorizon}</span>
                      </div>
                      <Badge variant={collision.autoResolved ? "default" : "secondary"}>
                        {collision.autoResolved ? 'Auto-Merged' : 'Manual'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Bubble: <code className="font-mono text-xs">{collision.bubbleId.substring(0, 8)}...</code>
                        <span className="mx-2">•</span>
                        <Clock className="h-3 w-3 inline mr-1" />
                        {new Date(collision.timestamp).toLocaleString()}
                      </div>
                      
                      <div className="text-sm">
                        <strong>Merged Properties:</strong>
                        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                          {JSON.stringify(collision.mergedProperties, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <GitMerge className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No horizon merges detected</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Merge Decision History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {auditTrail.map((trace, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {trace.action.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(trace.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{trace.reasoning}</p>
                      {trace.metadata && (
                        <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                          {JSON.stringify(trace.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(trace.confidence * 100)}%
                    </Badge>
                  </div>
                ))}
                
                {auditTrail.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    No merge decisions recorded yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}