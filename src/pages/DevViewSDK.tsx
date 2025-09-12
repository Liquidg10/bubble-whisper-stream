/**
 * DevViewSDK - Development test page for ViewSDK contracts and event bus
 * 
 * Tests ViewSDK interfaces, event bus functionality, and view adapter integration.
 * Provides controls for testing task events, view coordination, and adapter behavior.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BubbleViewAdapter } from '@/views/BubbleViewAdapter';
import { AtomicViewAdapter } from '@/views/AtomicViewAdapter';
import { ViewBus, useViewBusSubscription, type ViewBusEvents } from '@/views/bus';
import { isFeatureEnabled } from '@/config/flags';
import { useTaskStoreSync } from '@/stores/taskStore';
import { useBubbleStore } from '@/stores/bubbleStore';
import { generateId } from '@/lib/utils';

interface EventLogEntry {
  id: string;
  timestamp: number;
  type: keyof ViewBusEvents;
  data: any;
}

export default function DevViewSDK() {
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [activeView, setActiveView] = useState<'bubble' | 'atomic'>('bubble');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const taskStore = useTaskStoreSync();
  const bubbleStore = useBubbleStore();

  // Subscribe to all ViewBus events for logging
  useViewBusSubscription('task.updated', (event) => {
    addEventLog('task.updated', event);
  });

  useViewBusSubscription('task.moved', (event) => {
    addEventLog('task.moved', event);
  });

  useViewBusSubscription('view.changed', (event) => {
    addEventLog('view.changed', event);
  });

  useViewBusSubscription('selection.changed', (event) => {
    addEventLog('selection.changed', event);
  });

  const addEventLog = (type: keyof ViewBusEvents, data: any) => {
    const entry: EventLogEntry = {
      id: generateId(),
      timestamp: Date.now(),
      type,
      data
    };
    setEventLog(prev => [entry, ...prev].slice(0, 50)); // Keep last 50 events
  };

  const clearEventLog = () => {
    setEventLog([]);
  };

  const initializeTestData = () => {
    bubbleStore.clearAllBubbles();
    
    const testBubbles = [
      {
        id: generateId(),
        content: 'Bubble View Test Task',
        type: 'Task' as const,
        x: 200,
        y: 150,
        size: 0.6,
        priority: 60,
        tags: [{ id: 'bubble', name: 'bubble', emoji: '🫧' }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: generateId(),
        content: 'Atomic View Test Task',
        type: 'Task' as const,
        x: 400,
        y: 200,
        size: 0.7,
        priority: 70,
        tags: [{ id: 'atomic', name: 'atomic', emoji: '⚛️' }],
        metadata: { horizon: 'today' },
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: generateId(),
        content: 'Multi-View Task',
        type: 'Thought' as const,
        x: 300,
        y: 250,
        size: 0.5,
        priority: 50,
        tags: [{ id: 'multi', name: 'multi', emoji: '🔄' }],
        metadata: { horizon: 'week' },
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    testBubbles.forEach(bubble => bubbleStore.addBubble(bubble));
  };

  const resetTestData = () => {
    bubbleStore.clearAllBubbles();
    clearEventLog();
    setSelectedTaskId(null);
  };

  const handleBubbleSelect = (bubbleId: string) => {
    setSelectedTaskId(bubbleId);
  };

  const formatEventData = (type: keyof ViewBusEvents, data: any) => {
    switch (type) {
      case 'task.updated':
        return `Task: ${data.task.title} (${data.source.viewId})`;
      case 'task.moved':
        return `Task: ${data.taskId} (${data.source.viewId}) ${JSON.stringify(data.fromView)} → ${JSON.stringify(data.toView)}`;
      case 'view.changed':
        return `View: ${data.viewId} (${data.mode}) - ${data.changeType}`;
      case 'selection.changed':
        return `View: ${data.viewId} +${data.selected.length} -${data.deselected.length}`;
      default:
        return JSON.stringify(data);
    }
  };

  const getEventBadgeVariant = (type: keyof ViewBusEvents) => {
    switch (type) {
      case 'task.updated': return 'default';
      case 'task.moved': return 'secondary';
      case 'view.changed': return 'outline';
      case 'selection.changed': return 'destructive';
      default: return 'default';
    }
  };

  if (!isFeatureEnabled('viewSdk')) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>ViewSDK Development</CardTitle>
            <CardDescription>
              ViewSDK feature flag is disabled. Enable `flags.viewSdk` to test ViewSDK functionality.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ViewSDK Development & Testing</CardTitle>
          <CardDescription>
            Test ViewSDK contracts, event bus functionality, and view adapter integration.
            ViewSDK provides unified interfaces for all view implementations.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Test Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={initializeTestData} variant="default">
              Initialize Test Data
            </Button>
            <Button onClick={resetTestData} variant="outline">
              Reset Test Data
            </Button>
            <Button onClick={clearEventLog} variant="secondary">
              Clear Event Log
            </Button>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Badge variant={bubbleStore.bubbles.length > 0 ? 'default' : 'secondary'}>
              {bubbleStore.bubbles.length} Tasks
            </Badge>
            <Badge variant={taskStore.tasks.length > 0 ? 'default' : 'secondary'}>
              {taskStore.tasks.length} Task Store
            </Badge>
            <Badge variant={ViewBus.getSubscriptionCount() > 0 ? 'default' : 'secondary'}>
              {ViewBus.getSubscriptionCount()} Subscriptions
            </Badge>
            <Badge variant={eventLog.length > 0 ? 'default' : 'secondary'}>
              {eventLog.length} Events
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* View Adapters */}
        <Card>
          <CardHeader>
            <CardTitle>View Adapters</CardTitle>
            <CardDescription>
              Test BubbleViewAdapter and AtomicViewAdapter with ViewSDK integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'bubble' | 'atomic')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="bubble">Bubble View</TabsTrigger>
                <TabsTrigger value="atomic">Atomic View</TabsTrigger>
              </TabsList>
              
              <TabsContent value="bubble" className="mt-4">
                <div className="h-64 border rounded-lg bg-background overflow-hidden">
                  <BubbleViewAdapter
                    viewId="dev-bubble"
                    onBubbleSelect={handleBubbleSelect}
                    className="w-full h-full"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Drag bubbles to test task.moved events. Click to test selection.changed events.
                </p>
              </TabsContent>
              
              <TabsContent value="atomic" className="mt-4">
                <div className="h-64 border rounded-lg bg-background overflow-hidden">
                  <AtomicViewAdapter
                    viewId="dev-atomic"
                    onBubbleSelect={handleBubbleSelect}
                    className="w-full h-full"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Move molecules between shells to test horizon changes and task.moved events.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Event Log */}
        <Card>
          <CardHeader>
            <CardTitle>Event Bus Log</CardTitle>
            <CardDescription>
              Real-time log of ViewBus events from view adapters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              {eventLog.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No events yet. Interact with view adapters to see events.
                </p>
              ) : (
                <div className="space-y-2">
                  {eventLog.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-sm">
                      <Badge 
                        variant={getEventBadgeVariant(entry.type)}
                        className="text-xs shrink-0"
                      >
                        {entry.type}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          {formatEventData(entry.type, entry.data)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* SDK Status */}
      <Card>
        <CardHeader>
          <CardTitle>ViewSDK Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium">Active Views</div>
              <div className="text-muted-foreground">
                {ViewBus.getActiveEventTypes().includes('view.changed') ? activeView : 'none'}
              </div>
            </div>
            <div>
              <div className="font-medium">Selected Task</div>
              <div className="text-muted-foreground">
                {selectedTaskId ? selectedTaskId.slice(0, 8) + '...' : 'none'}
              </div>
            </div>
            <div>
              <div className="font-medium">Event Types</div>
              <div className="text-muted-foreground">
                {ViewBus.getActiveEventTypes().length} active
              </div>
            </div>
            <div>
              <div className="font-medium">Task Sync</div>
              <div className="text-muted-foreground">
                {bubbleStore.bubbles.length === taskStore.tasks.length ? '✓ synced' : '✗ mismatched'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Bubble View Adapter Tests:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Drag bubbles to trigger task.moved events with position deltas</li>
              <li>• Click bubbles to trigger selection.changed events</li>
              <li>• Observe task.updated events when bubble properties change</li>
            </ul>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-medium mb-2">Atomic View Adapter Tests:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Move molecules between shells to trigger task.moved events with horizon changes</li>
              <li>• Click molecules to trigger selection.changed events</li>
              <li>• Observe view.changed events when switching between adapters</li>
            </ul>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-medium mb-2">Expected Event Flow:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• view.changed (activated) when adapter mounts</li>
              <li>• task.moved when positions/horizons change</li>
              <li>• selection.changed when clicking elements</li>
              <li>• task.updated when task properties change</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}