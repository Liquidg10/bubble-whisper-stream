/**
 * Phase 4: /dev/offline-lab
 * Airplane mode simulation tool for testing offline scenarios
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Wifi, WifiOff, Clock, Database, AlertTriangle } from 'lucide-react';

interface NetworkCondition {
  id: string;
  name: string;
  latency: number;
  bandwidth: number;
  packetLoss: number;
}

const NETWORK_CONDITIONS: NetworkCondition[] = [
  { id: 'online', name: 'Online', latency: 20, bandwidth: 1000, packetLoss: 0 },
  { id: 'slow-3g', name: 'Slow 3G', latency: 400, bandwidth: 400, packetLoss: 0 },
  { id: 'fast-3g', name: 'Fast 3G', latency: 150, bandwidth: 1600, packetLoss: 0 },
  { id: 'wifi', name: 'WiFi', latency: 50, bandwidth: 30000, packetLoss: 0 },
  { id: 'offline', name: 'Offline', latency: 0, bandwidth: 0, packetLoss: 100 },
];

interface ConflictScenario {
  id: string;
  name: string;
  description: string;
  conflictType: 'concurrent-edit' | 'offline-online' | 'multi-device';
}

const CONFLICT_SCENARIOS: ConflictScenario[] = [
  {
    id: 'concurrent-edit',
    name: 'Concurrent Task Edit',
    description: 'Two users edit same task simultaneously',
    conflictType: 'concurrent-edit'
  },
  {
    id: 'offline-sync',
    name: 'Offline → Online Sync',
    description: 'Changes made offline sync when coming online',
    conflictType: 'offline-online'
  },
  {
    id: 'multi-device',
    name: 'Multi-Device Conflict',
    description: 'Same user on phone + desktop editing',
    conflictType: 'multi-device'
  }
];

export function OfflineLab() {
  const [networkCondition, setNetworkCondition] = useState<NetworkCondition>(NETWORK_CONDITIONS[0]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [queuedOperations, setQueuedOperations] = useState<string[]>([]);
  const [activeScenario, setActiveScenario] = useState<ConflictScenario | null>(null);
  const [crdt_conflicts, setCrdtConflicts] = useState(0);

  useEffect(() => {
    // Simulate CRDT state monitoring
    const interval = setInterval(() => {
      if (activeScenario) {
        setCrdtConflicts(prev => prev + Math.floor(Math.random() * 2));
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeScenario]);

  const simulateOfflineOperation = () => {
    const operation = `Task edit @ ${new Date().toLocaleTimeString()}`;
    setQueuedOperations(prev => [...prev, operation]);
  };

  const triggerConflictScenario = (scenario: ConflictScenario) => {
    setActiveScenario(scenario);
    setCrdtConflicts(0);
    // Simulate conflict detection after delay
    setTimeout(() => {
      setCrdtConflicts(1);
    }, 2000);
  };

  const clearQueue = () => {
    setQueuedOperations([]);
  };

  const stopScenario = () => {
    setActiveScenario(null);
    setCrdtConflicts(0);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isOfflineMode ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
            Network Simulation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Offline Mode</span>
            <Switch
              checked={isOfflineMode}
              onCheckedChange={setIsOfflineMode}
            />
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <span className="text-sm font-medium">Network Conditions</span>
            <div className="grid grid-cols-2 gap-2">
              {NETWORK_CONDITIONS.map((condition) => (
                <Button
                  key={condition.id}
                  variant={networkCondition.id === condition.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNetworkCondition(condition)}
                  disabled={isOfflineMode}
                >
                  {condition.name}
                </Button>
              ))}
            </div>
          </div>

          {!isOfflineMode && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Latency: {networkCondition.latency}ms</div>
              <div>Bandwidth: {networkCondition.bandwidth}kbps</div>
              <div>Packet Loss: {networkCondition.packetLoss}%</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Operation Queue
            <Badge variant="secondary">{queuedOperations.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={simulateOfflineOperation} size="sm">
              Simulate Edit
            </Button>
            <Button onClick={clearQueue} variant="outline" size="sm">
              Clear Queue
            </Button>
          </div>

          <div className="space-y-2 max-h-32 overflow-y-auto">
            {queuedOperations.length === 0 ? (
              <div className="text-sm text-muted-foreground">No queued operations</div>
            ) : (
              queuedOperations.map((op, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <Clock className="h-3 w-3" />
                  {op}
                  <Badge variant="outline" className="text-xs">Queued</Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Conflict Scenarios
            {crdt_conflicts > 0 && (
              <Badge variant="destructive">{crdt_conflicts} conflicts</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            {CONFLICT_SCENARIOS.map((scenario) => (
              <div key={scenario.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium text-sm">{scenario.name}</div>
                  <div className="text-xs text-muted-foreground">{scenario.description}</div>
                </div>
                <Button
                  size="sm"
                  variant={activeScenario?.id === scenario.id ? "destructive" : "outline"}
                  onClick={() => 
                    activeScenario?.id === scenario.id ? stopScenario() : triggerConflictScenario(scenario)
                  }
                >
                  {activeScenario?.id === scenario.id ? "Stop" : "Trigger"}
                </Button>
              </div>
            ))}
          </div>

          {activeScenario && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium">Active: {activeScenario.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Monitoring CRDT merge behavior...
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}