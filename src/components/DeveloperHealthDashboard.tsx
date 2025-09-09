/**
 * Developer Health Dashboard - Comprehensive system health monitoring
 * Integrates all developer checks and bug detection systems
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  Clock, 
  Database, 
  Key, 
  Undo, 
  Gauge, 
  RefreshCw, 
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import { flagGatingValidator, type FlagGatingReport } from '@/services/flagGatingValidator';
import { WatchHealthPanel } from '@/components/WatchHealthPanel';
import { syncTokenValidator, type SyncTokenValidationReport } from '@/services/syncTokenValidator';
import { idempotencyService, type IdempotencyReport } from '@/services/idempotencyService';
import { undoValidator, type UndoValidationReport } from '@/services/undoValidator';
import { voiceMetricsService } from '@/services/voiceMetricsService';
import { toast } from 'sonner';

export function DeveloperHealthDashboard() {
  const [flagReport, setFlagReport] = useState<FlagGatingReport | null>(null);
  const [syncReport, setSyncReport] = useState<SyncTokenValidationReport | null>(null);
  const [idempotencyReport, setIdempotencyReport] = useState<IdempotencyReport | null>(null);
  const [undoReport, setUndoReport] = useState<UndoValidationReport | null>(null);
  const [performanceBudget, setPerformanceBudget] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const runAllChecks = async () => {
    setLoading(true);
    try {
      // Run all validation checks
      const [flagResult, syncResult, idempotencyResult, undoResult, perfResult] = await Promise.all([
        flagGatingValidator.runComprehensiveValidation(),
        syncTokenValidator.validateSyncTokens(),
        Promise.resolve(idempotencyService.getReport()),
        undoValidator.runComprehensiveValidation(),
        Promise.resolve(voiceMetricsService.checkPerformanceBudget()),
      ]);

      setFlagReport(flagResult);
      setSyncReport(syncResult);
      setIdempotencyReport(idempotencyResult);
      setUndoReport(undoResult);
      setPerformanceBudget(perfResult);
      setLastUpdate(new Date());
      
      toast.success('Health checks completed');
    } catch (error) {
      console.error('Error running health checks:', error);
      toast.error('Some health checks failed');
    } finally {
      setLoading(false);
    }
  };

  const exportAllReports = () => {
    const allReports = {
      timestamp: Date.now(),
      flagGating: flagReport,
      syncTokens: syncReport,
      idempotency: idempotencyReport,
      undoValidation: undoReport,
      performanceBudget: performanceBudget,
    };

    const dataStr = JSON.stringify(allReports, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `developer-health-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Health report exported');
  };

  useEffect(() => {
    runAllChecks();
  }, []);

  const getHealthScore = () => {
    if (!flagReport || !syncReport || !idempotencyReport || !undoReport || !performanceBudget) {
      return 0;
    }

    let score = 100;
    
    // Flag violations (-10 each)
    score -= flagReport.violations.length * 10;
    
    // Sync token issues (-15 each)
    score -= syncReport.tokenIssues * 15;
    
    // Idempotency violations (-20 each)
    score -= idempotencyReport.violations.length * 20;
    
    // Undo test failures (-25 each)
    score -= undoReport.failedTests * 25;
    
    // Performance budget violations (-5 each)
    score -= performanceBudget.violations.length * 5;
    
    return Math.max(0, score);
  };

  const healthScore = getHealthScore();
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Developer Health Dashboard</CardTitle>
              <Badge variant={healthScore >= 90 ? 'default' : healthScore >= 70 ? 'secondary' : 'destructive'}>
                Health Score: {healthScore}%
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={runAllChecks}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Run All Checks
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportAllReports}
              >
                <Download className="h-4 w-4 mr-1" />
                Export Report
              </Button>
            </div>
          </div>
          {lastUpdate && (
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getScoreColor(healthScore)}`}>
                {healthScore}%
              </div>
              <div className="text-xs text-muted-foreground">Health Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {flagReport?.violations.length || 0}
              </div>
              <div className="text-xs text-muted-foreground">Flag Violations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {syncReport?.tokenIssues || 0}
              </div>
              <div className="text-xs text-muted-foreground">Sync Issues</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {undoReport?.failedTests || 0}
              </div>
              <div className="text-xs text-muted-foreground">Undo Failures</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {performanceBudget?.violations.length || 0}
              </div>
              <div className="text-xs text-muted-foreground">Perf Issues</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Reports */}
      <Tabs defaultValue="flags" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="flags">Flag Gating</TabsTrigger>
          <TabsTrigger value="watches">Watch Health</TabsTrigger>
          <TabsTrigger value="sync">Sync Tokens</TabsTrigger>
          <TabsTrigger value="idempotency">Idempotency</TabsTrigger>
          <TabsTrigger value="undo">Undo Tests</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="flags">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Flag Gating Validation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {flagReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-semibold">{Object.keys(flagReport.activeFlags).length}</div>
                      <div className="text-sm text-muted-foreground">Total Flags</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold">{Object.values(flagReport.activeFlags).filter(Boolean).length}</div>
                      <div className="text-sm text-muted-foreground">Active Flags</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-red-600">{flagReport.violations.length}</div>
                      <div className="text-sm text-muted-foreground">Violations</div>
                    </div>
                  </div>
                  
                  {flagReport.violations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-red-600">Violations Found:</h4>
                      {flagReport.violations.map((violation, i) => (
                        <div key={i} className="border-l-4 border-red-500 pl-4 py-2">
                          <div className="font-medium">{violation.flag}</div>
                          <div className="text-sm text-muted-foreground">{violation.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {violation.type} • {new Date(violation.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">No flag report available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="watches">
          <WatchHealthPanel />
        </TabsContent>

        <TabsContent value="sync">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Sync Token Validation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {syncReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-semibold">{syncReport.totalAccounts}</div>
                      <div className="text-sm text-muted-foreground">Accounts</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-red-600">{syncReport.tokenIssues}</div>
                      <div className="text-sm text-muted-foreground">Token Issues</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-yellow-600">{syncReport.duplicateEvents}</div>
                      <div className="text-sm text-muted-foreground">Duplicates</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold">{syncReport.goneSimulations.length}</div>
                      <div className="text-sm text-muted-foreground">410 Tests</div>
                    </div>
                  </div>
                  
                  {syncReport.statuses.filter(s => s.issues.length > 0).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold">Accounts with Issues:</h4>
                      {syncReport.statuses.filter(s => s.issues.length > 0).map((status) => (
                        <div key={status.calendarAccountId} className="border rounded p-3">
                          <div className="font-medium">{status.accountEmail}</div>
                          <div className="text-sm text-muted-foreground">
                            {status.eventsCount} events • Status: {status.syncStatus}
                          </div>
                          <div className="text-sm text-red-600">
                            {status.issues.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">No sync report available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="idempotency">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Idempotency Validation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {idempotencyReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-semibold">{idempotencyReport.totalKeys}</div>
                      <div className="text-sm text-muted-foreground">Total Keys</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold">{idempotencyReport.activeKeys}</div>
                      <div className="text-sm text-muted-foreground">Active</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-red-600">{idempotencyReport.violations.length}</div>
                      <div className="text-sm text-muted-foreground">Violations</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-yellow-600">{idempotencyReport.expiredKeys}</div>
                      <div className="text-sm text-muted-foreground">Expired</div>
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const result = await idempotencyService.testDoubleSubmitPrevention();
                      toast.success(`Test completed: ${result.passed ? 'PASSED' : 'FAILED'}`);
                      await runAllChecks();
                    }}
                  >
                    Test Double-Submit Prevention
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">No idempotency report available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="undo">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Undo className="h-5 w-5" />
                Undo Validation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {undoReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-semibold">{undoReport.totalTests}</div>
                      <div className="text-sm text-muted-foreground">Total Tests</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-green-600">{undoReport.passedTests}</div>
                      <div className="text-sm text-muted-foreground">Passed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-red-600">{undoReport.failedTests}</div>
                      <div className="text-sm text-muted-foreground">Failed</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-semibold">Compensation Actions:</h4>
                    {undoReport.compensationActions.map((action, i) => (
                      <div key={i} className="flex items-center justify-between border rounded p-3">
                        <div>
                          <div className="font-medium">{action.type}</div>
                          <div className="text-sm text-muted-foreground">{action.details}</div>
                        </div>
                        {action.verified ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">No undo report available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Performance Budget
              </CardTitle>
            </CardHeader>
            <CardContent>
              {performanceBudget ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {performanceBudget.passed ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {performanceBudget.passed ? 'All budgets met' : `${performanceBudget.violations.length} violations`}
                    </span>
                  </div>
                  
                  {performanceBudget.violations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-red-600">Budget Violations:</h4>
                      {performanceBudget.violations.map((violation: string, i: number) => (
                        <div key={i} className="border-l-4 border-red-500 pl-4 py-2">
                          <div className="text-sm">{violation}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-sm text-muted-foreground">
                    <Info className="h-4 w-4 inline mr-1" />
                    Performance budget: ≤1.0s time-to-first-chip, ≤500ms avg time, ≥85% success rate
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">No performance data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}