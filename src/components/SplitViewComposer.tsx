/**
 * Split View Composer - Phase 3 End-User Polish
 * Side-by-side view composition framework with real-time invariants
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Layout, 
  SplitSquareHorizontal,
  SplitSquareVertical,
  Maximize2,
  Minimize2,
  Settings,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Columns,
  Rows,
  Grid,
  Eye,
  EyeOff
} from 'lucide-react';
import { UnifiedDraftsFeed } from './UnifiedDraftsFeed';
import { PersonalEisenhower } from './PersonalEisenhower';
import { MergeConflictUI } from './MergeConflictUI';

export type ViewType = 'drafts' | 'eisenhower' | 'merge-conflicts' | 'calendar' | 'tasks' | 'notes';

export interface ViewConfiguration {
  id: string;
  type: ViewType;
  title: string;
  position: 'left' | 'right' | 'top' | 'bottom';
  size: number; // percentage 0-100
  visible: boolean;
  refreshInterval?: number; // milliseconds
  lastSync?: Date;
  invariants?: {
    requiredData: string[];
    conflictDetection: boolean;
    autoRefresh: boolean;
  };
}

export interface SplitLayout {
  id: string;
  name: string;
  direction: 'horizontal' | 'vertical';
  views: ViewConfiguration[];
  syncEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SplitViewComposerProps {
  defaultLayout?: SplitLayout;
  onLayoutChange?: (layout: SplitLayout) => void;
  className?: string;
}

export function SplitViewComposer({ defaultLayout, onLayoutChange, className }: SplitViewComposerProps) {
  const [layout, setLayout] = useState<SplitLayout>(defaultLayout || createDefaultLayout());
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [invariantViolations, setInvariantViolations] = useState<string[]>([]);
  const syncIntervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (layout.syncEnabled) {
      startSync();
    } else {
      stopSync();
    }
    
    return () => stopSync();
  }, [layout.syncEnabled]);

  useEffect(() => {
    onLayoutChange?.(layout);
  }, [layout, onLayoutChange]);

  function createDefaultLayout(): SplitLayout {
    return {
      id: 'default-layout',
      name: 'Default Split View',
      direction: 'horizontal',
      views: [
        {
          id: 'view-1',
          type: 'drafts',
          title: 'Drafts Feed',
          position: 'left',
          size: 50,
          visible: true,
          refreshInterval: 30000,
          invariants: {
            requiredData: ['drafts'],
            conflictDetection: true,
            autoRefresh: true
          }
        },
        {
          id: 'view-2',
          type: 'eisenhower',
          title: 'Priority Matrix',
          position: 'right',
          size: 50,
          visible: true,
          refreshInterval: 60000,
          invariants: {
            requiredData: ['tasks', 'priorities'],
            conflictDetection: false,
            autoRefresh: true
          }
        }
      ],
      syncEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  const startSync = () => {
    setSyncInProgress(true);
    
    // Check invariants every 5 seconds
    syncIntervalRef.current = setInterval(() => {
      checkInvariants();
      syncViews();
    }, 5000);
  };

  const stopSync = () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = undefined;
    }
    setSyncInProgress(false);
  };

  const checkInvariants = () => {
    const violations: string[] = [];
    
    layout.views.forEach(view => {
      if (!view.visible || !view.invariants) return;
      
      // Check data consistency across views
      if (view.invariants.conflictDetection) {
        // Simulate conflict detection
        const hasConflicts = Math.random() < 0.1; // 10% chance of conflicts for demo
        if (hasConflicts) {
          violations.push(`Data conflicts detected in ${view.title}`);
        }
      }
      
      // Check refresh staleness
      if (view.lastSync && view.refreshInterval) {
        const staleness = Date.now() - view.lastSync.getTime();
        if (staleness > view.refreshInterval * 2) {
          violations.push(`${view.title} data is stale (${Math.round(staleness / 1000)}s)`);
        }
      }
    });
    
    setInvariantViolations(violations);
  };

  const syncViews = () => {
    // Update last sync times for all views
    setLayout(prev => ({
      ...prev,
      views: prev.views.map(view => ({
        ...view,
        lastSync: new Date()
      })),
      updatedAt: new Date()
    }));
  };

  const updateViewConfiguration = (viewId: string, updates: Partial<ViewConfiguration>) => {
    setLayout(prev => ({
      ...prev,
      views: prev.views.map(view => 
        view.id === viewId 
          ? { ...view, ...updates }
          : view
      ),
      updatedAt: new Date()
    }));
  };

  const addView = (type: ViewType) => {
    const newView: ViewConfiguration = {
      id: `view-${Date.now()}`,
      type,
      title: getViewTitle(type),
      position: layout.direction === 'horizontal' ? 'right' : 'bottom',
      size: Math.floor(100 / (layout.views.length + 1)),
      visible: true,
      refreshInterval: 30000,
      invariants: {
        requiredData: [type],
        conflictDetection: type === 'drafts' || type === 'merge-conflicts',
        autoRefresh: true
      }
    };

    // Adjust existing view sizes
    const adjustedViews = layout.views.map(view => ({
      ...view,
      size: Math.floor(100 / (layout.views.length + 1))
    }));

    setLayout(prev => ({
      ...prev,
      views: [...adjustedViews, newView],
      updatedAt: new Date()
    }));
  };

  const removeView = (viewId: string) => {
    const remainingViews = layout.views.filter(view => view.id !== viewId);
    const adjustedViews = remainingViews.map(view => ({
      ...view,
      size: Math.floor(100 / remainingViews.length)
    }));

    setLayout(prev => ({
      ...prev,
      views: adjustedViews,
      updatedAt: new Date()
    }));
  };

  const getViewTitle = (type: ViewType): string => {
    switch (type) {
      case 'drafts': return 'Drafts Feed';
      case 'eisenhower': return 'Priority Matrix';
      case 'merge-conflicts': return 'Merge Conflicts';
      case 'calendar': return 'Calendar';
      case 'tasks': return 'Tasks';
      case 'notes': return 'Notes';
      default: return 'Unknown View';
    }
  };

  const renderView = (view: ViewConfiguration) => {
    switch (view.type) {
      case 'drafts':
        return <UnifiedDraftsFeed className="h-full" />;
      case 'eisenhower':
        return <PersonalEisenhower className="h-full" />;
      case 'merge-conflicts':
        return <MergeConflictUI className="h-full" />;
      default:
        return (
          <Card className="h-full">
            <CardContent className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <div className="text-lg font-medium">{view.title}</div>
                <div className="text-sm">View not implemented yet</div>
              </div>
            </CardContent>
          </Card>
        );
    }
  };

  const layoutStyles = layout.direction === 'horizontal' 
    ? { display: 'flex', flexDirection: 'row' as const, height: '600px' }
    : { display: 'flex', flexDirection: 'column' as const, height: '600px' };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layout className="h-5 w-5" />
              {layout.name}
              <Badge variant={layout.syncEnabled ? "default" : "secondary"} className="ml-2">
                {layout.syncEnabled ? 'Synced' : 'Manual'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {/* Invariant Violations */}
              {invariantViolations.length > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {invariantViolations.length} issues
                </Badge>
              )}
              
              {/* Sync Status */}
              {syncInProgress && (
                <Badge variant="outline">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Syncing
                </Badge>
              )}
              
              {/* Configuration */}
              <Dialog open={isConfiguring} onOpenChange={setIsConfiguring}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Configure
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Configure Split View Layout</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-6">
                    {/* Layout Settings */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Layout Direction</Label>
                        <Select 
                          value={layout.direction} 
                          onValueChange={(value: 'horizontal' | 'vertical') => 
                            setLayout(prev => ({ ...prev, direction: value, updatedAt: new Date() }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="horizontal">
                              <div className="flex items-center gap-2">
                                <SplitSquareHorizontal className="h-4 w-4" />
                                Horizontal
                              </div>
                            </SelectItem>
                            <SelectItem value="vertical">
                              <div className="flex items-center gap-2">
                                <SplitSquareVertical className="h-4 w-4" />
                                Vertical
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="sync-enabled"
                          checked={layout.syncEnabled}
                          onCheckedChange={(checked) => 
                            setLayout(prev => ({ ...prev, syncEnabled: checked, updatedAt: new Date() }))
                          }
                        />
                        <Label htmlFor="sync-enabled">Enable Auto-Sync</Label>
                      </div>
                    </div>
                    
                    {/* View Configuration */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Views</h3>
                        <Select onValueChange={(value: ViewType) => addView(value)}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Add view..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="drafts">Drafts Feed</SelectItem>
                            <SelectItem value="eisenhower">Priority Matrix</SelectItem>
                            <SelectItem value="merge-conflicts">Merge Conflicts</SelectItem>
                            <SelectItem value="calendar">Calendar</SelectItem>
                            <SelectItem value="tasks">Tasks</SelectItem>
                            <SelectItem value="notes">Notes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-4">
                        {layout.views.map((view) => (
                          <Card key={view.id} className="p-4">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateViewConfiguration(view.id, { visible: !view.visible })}
                                  >
                                    {view.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                  </Button>
                                  <span className="font-medium">{view.title}</span>
                                  <Badge variant="outline">{view.type}</Badge>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeView(view.id)}
                                  disabled={layout.views.length <= 1}
                                >
                                  <Minimize2 className="h-4 w-4" />
                                </Button>
                              </div>
                              
                              <div>
                                <Label>Size: {view.size}%</Label>
                                <Slider
                                  value={[view.size]}
                                  onValueChange={([value]) => 
                                    updateViewConfiguration(view.id, { size: value })
                                  }
                                  max={100}
                                  min={10}
                                  step={5}
                                  className="mt-2"
                                />
                              </div>
                              
                              {view.invariants && (
                                <div className="text-sm">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={view.invariants.conflictDetection}
                                      onCheckedChange={(checked) => 
                                        updateViewConfiguration(view.id, {
                                          invariants: { ...view.invariants!, conflictDetection: checked }
                                        })
                                      }
                                    />
                                    <Label>Conflict Detection</Label>
                                  </div>
                                </div>
                              )}
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                    
                    {/* Invariant Violations */}
                    {invariantViolations.length > 0 && (
                      <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                        <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                          Invariant Violations
                        </h4>
                        <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                          {invariantViolations.map((violation, idx) => (
                            <li key={idx}>• {violation}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Split View Container */}
      <div className="border rounded-lg overflow-hidden" style={layoutStyles}>
        {layout.views
          .filter(view => view.visible)
          .map((view) => (
            <div
              key={view.id}
              style={{
                flex: `0 0 ${view.size}%`,
                minWidth: layout.direction === 'horizontal' ? '300px' : 'auto',
                minHeight: layout.direction === 'vertical' ? '200px' : 'auto',
                borderRight: layout.direction === 'horizontal' ? '1px solid hsl(var(--border))' : 'none',
                borderBottom: layout.direction === 'vertical' ? '1px solid hsl(var(--border))' : 'none'
              }}
              className="overflow-auto"
            >
              {renderView(view)}
            </div>
          ))}
      </div>
    </div>
  );
}