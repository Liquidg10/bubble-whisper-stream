/**
 * P8 - Context Drift Detection Dev Route
 * Monitor Context Engine weight drift and provide rollback functionality
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ContextWeights {
  temporal: number;
  behavioral: number;
  environmental: number;
  semantic: number;
  timestamp: number;
}

interface DriftAnalysis {
  totalDrift: number;
  criticalDrift: boolean;
  changedWeights: Array<{
    dimension: keyof Omit<ContextWeights, 'timestamp'>;
    oldValue: number;
    newValue: number;
    change: number;
  }>;
}

export function ContextDrift() {
  const { toast } = useToast();
  const [currentWeights, setCurrentWeights] = useState<ContextWeights | null>(null);
  const [historicalWeights, setHistoricalWeights] = useState<ContextWeights[]>([]);
  const [driftAnalysis, setDriftAnalysis] = useState<DriftAnalysis | null>(null);
  const [lastStableSnapshot, setLastStableSnapshot] = useState<ContextWeights | null>(null);
  const [loading, setLoading] = useState(true);

  // Load weights and history
  useEffect(() => {
    loadContextData();
  }, []);

  const loadContextData = async () => {
    try {
      // Load current weights (simulated - replace with actual Context Engine API)
      const weights: ContextWeights = {
        temporal: 0.75,
        behavioral: 0.68,
        environmental: 0.82,
        semantic: 0.71,
        timestamp: Date.now()
      };
      setCurrentWeights(weights);

      // Load historical data (last 14 days)
      const stored = localStorage.getItem('context-weight-history');
      const history: ContextWeights[] = stored ? JSON.parse(stored) : [];
      setHistoricalWeights(history);

      // Load stable snapshot
      const snapshot = localStorage.getItem('context-stable-snapshot');
      if (snapshot) {
        setLastStableSnapshot(JSON.parse(snapshot));
      } else {
        // Create initial snapshot
        const initialSnapshot = { ...weights };
        setLastStableSnapshot(initialSnapshot);
        localStorage.setItem('context-stable-snapshot', JSON.stringify(initialSnapshot));
      }

      // Analyze drift
      if (history.length > 0) {
        const drift = analyzeDrift(weights, history);
        setDriftAnalysis(drift);
      }

    } catch (error) {
      console.error('Failed to load context data:', error);
      toast({
        title: 'Failed to load context data',
        description: 'Using fallback values',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const analyzeDrift = (current: ContextWeights, history: ContextWeights[]): DriftAnalysis => {
    if (history.length === 0) {
      return { totalDrift: 0, criticalDrift: false, changedWeights: [] };
    }

    // Compare with 7 days ago
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const baselineWeights = history.find(w => Math.abs(w.timestamp - weekAgo) < (24 * 60 * 60 * 1000)) || history[0];

    const dimensions = ['temporal', 'behavioral', 'environmental', 'semantic'] as const;
    const changedWeights = dimensions.map(dim => ({
      dimension: dim,
      oldValue: baselineWeights[dim],
      newValue: current[dim],
      change: current[dim] - baselineWeights[dim]
    })).filter(change => Math.abs(change.change) > 0.05); // 5% threshold

    const totalDrift = Math.sqrt(
      dimensions.reduce((sum, dim) => 
        sum + Math.pow(current[dim] - baselineWeights[dim], 2), 0
      )
    );

    return {
      totalDrift,
      criticalDrift: totalDrift > 0.15, // 15% drift threshold
      changedWeights
    };
  };

  const createSnapshot = () => {
    if (!currentWeights) return;

    const snapshot = { ...currentWeights };
    setLastStableSnapshot(snapshot);
    localStorage.setItem('context-stable-snapshot', JSON.stringify(snapshot));

    toast({
      title: 'Snapshot created',
      description: 'Current weights saved as stable baseline',
      duration: 3000
    });
  };

  const restoreWeights = async () => {
    if (!lastStableSnapshot) {
      toast({
        title: 'No snapshot available',
        description: 'Create a snapshot first',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Restore weights (simulated - replace with actual Context Engine API)
      setCurrentWeights({ ...lastStableSnapshot, timestamp: Date.now() });

      // Save restoration to history
      const history = [...historicalWeights, { ...lastStableSnapshot, timestamp: Date.now() }];
      setHistoricalWeights(history);
      localStorage.setItem('context-weight-history', JSON.stringify(history));

      toast({
        title: 'Weights restored',
        description: 'Context Engine restored to stable configuration',
        duration: 3000
      });

      // Re-analyze drift
      const drift = analyzeDrift(currentWeights!, history);
      setDriftAnalysis(drift);

    } catch (error) {
      console.error('Failed to restore weights:', error);
      toast({
        title: 'Restore failed',
        description: 'Could not restore context weights',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-variant rounded w-1/3"></div>
          <div className="h-32 bg-surface-variant rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Context Drift Monitor</h1>
          <p className="text-on-surface-variant">Track Context Engine weight changes and stability</p>
        </div>
        {driftAnalysis?.criticalDrift && (
          <Badge variant="destructive" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Critical Drift Detected
          </Badge>
        )}
      </div>

      {/* Current Weights */}
      <Card>
        <CardHeader>
          <CardTitle>Current Context Weights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentWeights && Object.entries(currentWeights)
            .filter(([key]) => key !== 'timestamp')
            .map(([dimension, weight]) => (
              <div key={dimension} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="capitalize font-medium">{dimension}</span>
                  <span className="text-sm text-on-surface-variant">
                    {(weight * 100).toFixed(1)}%
                  </span>
                </div>
                <Progress value={weight * 100} className="h-2" />
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Drift Analysis */}
      {driftAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Drift Analysis (7-day)
              {driftAnalysis.criticalDrift ? (
                <TrendingDown className="h-5 w-5 text-destructive" />
              ) : (
                <TrendingUp className="h-5 w-5 text-primary" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Total Drift</span>
              <Badge variant={driftAnalysis.criticalDrift ? 'destructive' : 'secondary'}>
                {(driftAnalysis.totalDrift * 100).toFixed(1)}%
              </Badge>
            </div>

            {driftAnalysis.changedWeights.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Significant Changes</h4>
                {driftAnalysis.changedWeights.map(change => (
                  <div key={change.dimension} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{change.dimension}</span>
                    <span className={`flex items-center gap-1 ${
                      change.change > 0 ? 'text-primary' : 'text-destructive'
                    }`}>
                      {change.change > 0 ? '+' : ''}{(change.change * 100).toFixed(1)}%
                      {change.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Stability Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button onClick={createSnapshot} variant="outline">
            Create Snapshot
          </Button>
          <Button 
            onClick={restoreWeights} 
            variant={driftAnalysis?.criticalDrift ? 'default' : 'outline'}
            className="flex items-center gap-2"
            disabled={!lastStableSnapshot}
          >
            <RotateCcw className="h-4 w-4" />
            Restore to Last Stable
          </Button>
        </CardContent>
      </Card>

      {/* History Chart (simplified) */}
      <Card>
        <CardHeader>
          <CardTitle>Weight History (14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-end justify-between gap-1">
            {historicalWeights.slice(-14).map((weights, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-1">
                {Object.entries(weights)
                  .filter(([key]) => key !== 'timestamp')
                  .map(([dim, weight], dimIndex) => (
                    <div
                      key={dim}
                      className={`w-full rounded-sm ${
                        dimIndex === 0 ? 'bg-primary/60' :
                        dimIndex === 1 ? 'bg-secondary/60' :
                        dimIndex === 2 ? 'bg-accent/60' : 'bg-muted/60'
                      }`}
                      style={{ height: `${weight * 100}%` }}
                    />
                  ))}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-on-surface-variant mt-2">
            <span>14 days ago</span>
            <span>Today</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}