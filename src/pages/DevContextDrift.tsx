/**
 * /dev/context-drift - Context Engine monitoring & drift detection
 * Tracks weight changes and acceptance rates over time
 * Provides soft rollback to stable configurations
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, RotateCcw, AlertTriangle, RefreshCw } from 'lucide-react';
import { contextEngineService } from '@/services/contextEngineService';
import { precisionDriftTracker, PrecisionSnapshot, PrecisionDriftMetrics } from '@/services/precisionDriftTracker';
import { unifiedRollbackService, UnifiedSnapshot } from '@/services/unifiedRollbackService';
import { backgroundCalibrationService, CalibrationTask } from '@/services/backgroundCalibrationService';
import { isFeatureEnabled } from '@/config/flags';

interface WeightSnapshot {
  timestamp: number;
  weights: Record<string, number>;
  acceptanceRate: number;
  totalDecisions: number;
}

interface ExtendedDriftMetrics extends DriftMetrics {
  precisionMetrics?: PrecisionDriftMetrics;
  combinedHealth?: number;
}

interface DriftMetrics {
  weekOverWeekDelta: number;
  acceptanceChange: number;
  volatilityScore: number;
  driftSeverity: 'stable' | 'minor' | 'moderate' | 'high';
}

export default function DevContextDrift() {
  const [currentWeights, setCurrentWeights] = useState<Record<string, number>>({});
  const [snapshots, setSnapshots] = useState<WeightSnapshot[]>([]);
  const [driftMetrics, setDriftMetrics] = useState<ExtendedDriftMetrics | null>(null);
  const [lastStableSnapshot, setLastStableSnapshot] = useState<WeightSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoTracking, setAutoTracking] = useState(true);
  
  // P8 - Enhanced state for unified monitoring
  const [unifiedSnapshots, setUnifiedSnapshots] = useState<UnifiedSnapshot[]>([]);
  const [precisionSnapshots, setPrecisionSnapshots] = useState<PrecisionSnapshot[]>([]);
  const [calibrationTasks, setCalibrationTasks] = useState<CalibrationTask[]>([]);
  const [isDriftGuardEnabled] = useState(() => isFeatureEnabled('contextDriftGuard'));

  const DRIFT_THRESHOLDS = {
    minor: 0.05,    // 5% change
    moderate: 0.15, // 15% change
    high: 0.25      // 25% change
  };

  const loadCurrentWeights = async () => {
    try {
      const weights = await contextEngineService.getSignalWeights();
      setCurrentWeights(Object.fromEntries(weights));
    } catch (error) {
      console.error('Failed to load current weights:', error);
    }
  };

  const loadSnapshots = () => {
    try {
      const stored = localStorage.getItem('contextDriftSnapshots');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSnapshots(parsed);
        
        // Find last stable snapshot (< 5% drift)
        const stable = parsed.find((s: WeightSnapshot) => 
          calculateWeightDrift(s.weights, currentWeights) < DRIFT_THRESHOLDS.minor
        );
        setLastStableSnapshot(stable || parsed[parsed.length - 1]);
      }
    } catch (error) {
      console.error('Failed to load drift snapshots:', error);
    }
  };

  const saveSnapshot = async (isStable = false) => {
    setLoading(true);
    try {
      const weights = await contextEngineService.getSignalWeights();
      const decisions = getRecentDecisions();
      
      const snapshot: WeightSnapshot = {
        timestamp: Date.now(),
        weights: Object.fromEntries(weights),
        acceptanceRate: calculateAcceptanceRate(decisions),
        totalDecisions: decisions.length
      };

      const newSnapshots = [...snapshots, snapshot].slice(-14); // Keep 14 days
      setSnapshots(newSnapshots);
      localStorage.setItem('contextDriftSnapshots', JSON.stringify(newSnapshots));

      if (isStable) {
        setLastStableSnapshot(snapshot);
        localStorage.setItem('lastStableContextSnapshot', JSON.stringify(snapshot));
      }
    } catch (error) {
      console.error('Failed to save snapshot:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateWeightDrift = (oldWeights: Record<string, number>, newWeights: Record<string, number>): number => {
    const commonKeys = Object.keys(oldWeights).filter(key => key in newWeights);
    if (commonKeys.length === 0) return 0;

    const totalDrift = commonKeys.reduce((sum, key) => {
      return sum + Math.abs(oldWeights[key] - newWeights[key]);
    }, 0);

    return totalDrift / commonKeys.length;
  };

  const calculateDriftMetrics = (): DriftMetrics | null => {
    if (snapshots.length < 2) return null;

    const current = snapshots[snapshots.length - 1];
    const previous = snapshots[snapshots.length - 2];
    
    const weightDelta = calculateWeightDrift(previous.weights, current.weights);
    const acceptanceChange = current.acceptanceRate - previous.acceptanceRate;
    
    // Calculate volatility over last 7 days
    const recentSnapshots = snapshots.slice(-7);
    const volatility = recentSnapshots.length > 1 ? 
      recentSnapshots.reduce((sum, snapshot, idx) => {
        if (idx === 0) return 0;
        return sum + calculateWeightDrift(recentSnapshots[idx - 1].weights, snapshot.weights);
      }, 0) / (recentSnapshots.length - 1) : 0;

    let severity: DriftMetrics['driftSeverity'] = 'stable';
    if (weightDelta > DRIFT_THRESHOLDS.high) severity = 'high';
    else if (weightDelta > DRIFT_THRESHOLDS.moderate) severity = 'moderate';
    else if (weightDelta > DRIFT_THRESHOLDS.minor) severity = 'minor';

    return {
      weekOverWeekDelta: weightDelta,
      acceptanceChange,
      volatilityScore: volatility,
      driftSeverity: severity
    };
  };

  const getRecentDecisions = () => {
    // Get decisions from last 7 days from localStorage decision traces
    try {
      const traces = localStorage.getItem('decisionTraces');
      if (!traces) return [];
      
      const parsed = JSON.parse(traces);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      return parsed.filter((trace: any) => trace.timestamp > sevenDaysAgo);
    } catch {
      return [];
    }
  };

  const calculateAcceptanceRate = (decisions: any[]): number => {
    if (decisions.length === 0) return 0;
    const accepted = decisions.filter(d => d.userAction === 'accept').length;
    return accepted / decisions.length;
  };

  // P8 - Enhanced restore with selective options
  const restoreStableWeights = async (options?: { context?: boolean; precision?: boolean }) => {
    if (!isDriftGuardEnabled) {
      // Legacy behavior for when drift guard is disabled
      if (!lastStableSnapshot) return;
      
      setLoading(true);
      try {
        await contextEngineService.updateSignalWeights(new Map(Object.entries(lastStableSnapshot.weights)));
        await loadCurrentWeights();
        await saveSnapshot(true); // Mark as new stable point
      } catch (error) {
        console.error('Failed to restore stable weights:', error);
      } finally {
        setLoading(false);
      }
      return;
    }
    
    setLoading(true);
    try {
      const success = await unifiedRollbackService.restoreToStable({
        restoreContext: options?.context ?? true,
        restorePrecision: options?.precision ?? true,
        reason: 'Manual rollback from drift dashboard'
      });
      
      if (success) {
        await loadUnifiedData();
        await loadCurrentWeights();
      }
    } catch (error) {
      console.error('Failed to restore stable configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetAllWeights = async () => {
    setLoading(true);
    try {
      await contextEngineService.resetSignalWeights();
      await loadCurrentWeights();
      await saveSnapshot(true);
    } catch (error) {
      console.error('Failed to reset weights:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'moderate': return 'secondary';
      case 'minor': return 'outline';
      default: return 'default';
    }
  };

  const formatChartData = () => {
    return snapshots.map((snapshot, idx) => ({
      day: `Day ${idx + 1}`,
      date: new Date(snapshot.timestamp).toLocaleDateString(),
      acceptanceRate: Math.round(snapshot.acceptanceRate * 100),
      decisions: snapshot.totalDecisions,
      avgWeight: Object.values(snapshot.weights).reduce((sum, w) => sum + w, 0) / Object.keys(snapshot.weights).length
    }));
  };

  const formatWeightData = () => {
    return Object.entries(currentWeights).map(([signal, weight]) => ({
      signal: signal.replace(/([A-Z])/g, ' $1').trim(),
      weight: Math.round(weight * 100),
      originalKey: signal
    }));
  };

  // P8 - Load unified snapshots and precision data
  const loadUnifiedData = async () => {
    if (!isDriftGuardEnabled) return;
    
    try {
      const unified = unifiedRollbackService.loadUnifiedSnapshots();
      const precision = precisionDriftTracker.loadSnapshots();
      
      setUnifiedSnapshots(unified);
      setPrecisionSnapshots(precision);
    } catch (error) {
      console.error('Failed to load unified drift data:', error);
    }
  };

  // P8 - Enhanced snapshot with unified tracking
  const saveUnifiedSnapshot = async (isStable = false) => {
    if (!isDriftGuardEnabled) return saveSnapshot(isStable);
    
    setLoading(true);
    try {
      // Create and save unified snapshot
      const unifiedSnapshot = await unifiedRollbackService.createUnifiedSnapshot();
      unifiedRollbackService.saveUnifiedSnapshot(unifiedSnapshot, isStable);
      
      // Also save individual precision snapshot
      const precisionSnapshot = await precisionDriftTracker.createSnapshot();
      precisionDriftTracker.saveSnapshot(precisionSnapshot);
      
      // Reload data
      await loadUnifiedData();
      await loadCurrentWeights();
      
    } catch (error) {
      console.error('Failed to save unified snapshot:', error);
    } finally {
      setLoading(false);
    }
  };


  // P8 - Background calibration controls
  const startBackgroundCalibration = async (type: 'context' | 'precision' | 'combined') => {
    try {
      let taskId: string;
      switch (type) {
        case 'context':
          taskId = await backgroundCalibrationService.startContextRecalibration();
          break;
        case 'precision':
          taskId = await backgroundCalibrationService.startPrecisionRecalibration();
          break;
        case 'combined':
          taskId = await backgroundCalibrationService.startCombinedRecalibration();
          break;
      }
      console.log(`Started ${type} calibration: ${taskId}`);
    } catch (error) {
      console.error('Failed to start background calibration:', error);
    }
  };

  useEffect(() => {
    loadCurrentWeights();
    loadSnapshots();
    
    // P8 - Load unified data if feature enabled
    if (isDriftGuardEnabled) {
      loadUnifiedData();
    }
    
    // Auto-track daily if enabled
    if (autoTracking) {
      const lastSnapshot = snapshots[snapshots.length - 1];
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      
      if (!lastSnapshot || lastSnapshot.timestamp < oneDayAgo) {
        if (isDriftGuardEnabled) {
          saveUnifiedSnapshot();
        } else {
          saveSnapshot();
        }
      }
    }
  }, []);

  // P8 - Subscribe to calibration task updates
  useEffect(() => {
    if (!isDriftGuardEnabled) return;
    
    const unsubscribe = backgroundCalibrationService.subscribe(setCalibrationTasks);
    return unsubscribe;
  }, [isDriftGuardEnabled]);

  useEffect(() => {
    if (snapshots.length > 0) {
      const metrics = calculateDriftMetrics();
      
      // P8 - Add precision metrics if available
      if (isDriftGuardEnabled && precisionSnapshots.length > 0) {
        const precisionMetrics = precisionDriftTracker.calculateDriftMetrics(precisionSnapshots);
        const combinedHealth = unifiedSnapshots.length > 0 ? 
          unifiedSnapshots[unifiedSnapshots.length - 1].combined.overallHealth : 0;
        
        setDriftMetrics({
          ...metrics,
          precisionMetrics,
          combinedHealth
        });
      } else {
        setDriftMetrics(metrics);
      }
    }
  }, [snapshots, currentWeights, precisionSnapshots, unifiedSnapshots, isDriftGuardEnabled]);

  const chartData = formatChartData();
  const weightData = formatWeightData();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {isDriftGuardEnabled ? 'Unified System Drift Monitor' : 'Context Engine Drift Monitor'}
            </h1>
            <p className="text-muted-foreground">
              {isDriftGuardEnabled 
                ? 'Track Context Engine and Auto-Write precision with unified rollback'
                : 'Track signal weight changes and acceptance rates over time'
              }
            </p>
            {isDriftGuardEnabled && (
              <Badge variant="outline" className="mt-2">
                Drift Guard Enabled
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => isDriftGuardEnabled ? saveUnifiedSnapshot() : saveSnapshot()}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Capture Snapshot
            </Button>
            <Button
              variant="outline"
              onClick={() => restoreStableWeights()}
              disabled={loading || !lastStableSnapshot}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Restore Stable
            </Button>
          </div>
        </div>

        {/* P8 - Enhanced Drift Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                {driftMetrics?.weekOverWeekDelta && driftMetrics.weekOverWeekDelta > 0 ? (
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-green-500" />
                )}
                <div>
                  <p className="text-sm font-medium">Weight Drift</p>
                  <p className="text-2xl font-bold">
                    {driftMetrics ? Math.round(driftMetrics.weekOverWeekDelta * 100) : 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-blue-500" />
                <div>
                  <p className="text-sm font-medium">Acceptance Rate</p>
                  <p className="text-2xl font-bold">
                    {driftMetrics ? Math.round((snapshots[snapshots.length - 1]?.acceptanceRate || 0) * 100) : 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Volatility</p>
                  <p className="text-2xl font-bold">
                    {driftMetrics ? Math.round(driftMetrics.volatilityScore * 100) : 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {isDriftGuardEnabled ? 'Combined Health' : 'Drift Severity'}
                  </p>
                  {isDriftGuardEnabled && driftMetrics?.combinedHealth !== undefined ? (
                    <p className="text-2xl font-bold">
                      {Math.round(driftMetrics.combinedHealth * 100)}%
                    </p>
                  ) : (
                    <Badge variant={driftMetrics ? getSeverityColor(driftMetrics.driftSeverity) : 'default'}>
                      {driftMetrics?.driftSeverity || 'stable'}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* P8 - Enhanced Alerts */}
        {driftMetrics?.driftSeverity === 'high' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              High drift detected ({Math.round(driftMetrics.weekOverWeekDelta * 100)}%). 
              Consider restoring stable configuration or starting background recalibration.
            </AlertDescription>
          </Alert>
        )}

        {/* P8 - Precision Drift Alert */}
        {isDriftGuardEnabled && driftMetrics?.precisionMetrics?.featureDriftSeverity === 'high' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Auto-Write precision drift detected in {driftMetrics.precisionMetrics.mostDriftingFeature}. 
              Accuracy dropped by {Math.round(Math.abs(driftMetrics.precisionMetrics.weekOverWeekAccuracy) * 100)}%.
            </AlertDescription>
          </Alert>
        )}

        {/* P8 - Background Calibration Status */}
        {isDriftGuardEnabled && calibrationTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Background Calibration Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {calibrationTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium capitalize">{task.type.replace('_', ' ')} Calibration</p>
                    <p className="text-sm text-muted-foreground">{task.status}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={task.progress} className="w-20" />
                    <span className="text-sm">{task.progress}%</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Acceptance Rate Trend (14 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip 
                      formatter={(value, name) => [`${value}%`, 'Acceptance Rate']}
                      labelFormatter={(label) => chartData.find(d => d.day === label)?.date}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="acceptanceRate" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available. Capture snapshots to see trends.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Signal Weights</CardTitle>
            </CardHeader>
            <CardContent>
              {weightData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={weightData} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="signal" type="category" width={120} />
                    <Tooltip formatter={(value) => [`${value}%`, 'Weight']} />
                    <Bar dataKey="weight" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No weight data available.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Snapshot History */}
        <Card>
          <CardHeader>
            <CardTitle>Snapshot History</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshots.length > 0 ? (
              <div className="space-y-3">
                {snapshots.slice(-5).reverse().map((snapshot, idx) => (
                  <div key={snapshot.timestamp} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">
                        {new Date(snapshot.timestamp).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {snapshot.totalDecisions} decisions, {Math.round(snapshot.acceptanceRate * 100)}% accepted
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {lastStableSnapshot?.timestamp === snapshot.timestamp && (
                        <Badge variant="default">Stable</Badge>
                      )}
                      <Badge variant="outline">
                        {Object.keys(snapshot.weights).length} signals
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No snapshots captured yet. Click "Capture Snapshot" to start tracking.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-tracking</p>
                <p className="text-sm text-muted-foreground">
                  Automatically capture daily snapshots
                </p>
              </div>
              <Button
                variant={autoTracking ? "default" : "outline"}
                onClick={() => setAutoTracking(!autoTracking)}
              >
                {autoTracking ? "Enabled" : "Disabled"}
              </Button>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Reset All Weights</p>
                <p className="text-sm text-muted-foreground">
                  Restore factory defaults and capture as stable
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={resetAllWeights}
                disabled={loading}
              >
                Reset to Defaults
              </Button>
            </div>

            {/* P8 - Background Calibration Controls */}
            {isDriftGuardEnabled && (
              <div className="space-y-3 pt-3 border-t">
                <p className="font-medium">Background Calibration</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => startBackgroundCalibration('context')}
                    disabled={loading}
                  >
                    Recalibrate Context
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => startBackgroundCalibration('precision')}
                    disabled={loading}
                  >
                    Recalibrate Precision
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => startBackgroundCalibration('combined')}
                    disabled={loading}
                  >
                    Combined Recalibration
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}