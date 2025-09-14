/**
 * /dev/fatigue-budgets - Nudge budget & cooldown monitoring
 * Displays per-domain budgets and "Not now" cooldowns
 * Prevents over-nudging and tracks fatigue metrics
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from 'recharts';
import { Clock, AlertTriangle, RefreshCw, Pause, Play, RotateCcw } from 'lucide-react';

interface DomainBudget {
  domain: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  cooldownUntil?: number;
  lastNudge?: number;
  dismissCount: number;
  acceptCount: number;
}

interface CooldownStatus {
  domain: string;
  reason: string;
  until: number;
  duration: number;
  canOverride: boolean;
}

interface FatigueMetrics {
  overallFatigueScore: number;
  domainsAtLimit: number;
  avgAcceptanceRate: number;
  dismissStreaks: Record<string, number>;
  peakUsageHour: number;
}

export default function DevFatigueBudgets() {
  const [budgets, setBudgets] = useState<DomainBudget[]>([]);
  const [cooldowns, setCooldowns] = useState<CooldownStatus[]>([]);
  const [metrics, setMetrics] = useState<FatigueMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [globalPause, setGlobalPause] = useState(false);

  // Default budget configuration (Enhanced for P0 with calendar)
  const DEFAULT_BUDGETS: Record<string, number> = {
    'cbt-assist': 3,
    'auto-write': 5,
    'planning': 2,
    'joy-celebration': 8,
    'context-nudge': 4,
    'productivity-coach': 3,
    'glimmer': 6,
    'reminder-adjust': 4,
    'calendar-suggestions': 4,
    'masonry-reorder': 3,
    'auto-reschedule': 2
  };

  const loadBudgets = () => {
    try {
      const stored = localStorage.getItem('fatiguebudgets');
      const budgetData = stored ? JSON.parse(stored) : {};
      
      const today = new Date().toDateString();
      const todayData = budgetData[today] || {};

      const budgetList: DomainBudget[] = Object.entries(DEFAULT_BUDGETS).map(([domain, limit]) => {
        const domainData = todayData[domain] || {};
        return {
          domain,
          dailyLimit: limit,
          used: domainData.used || 0,
          remaining: Math.max(0, limit - (domainData.used || 0)),
          cooldownUntil: domainData.cooldownUntil,
          lastNudge: domainData.lastNudge,
          dismissCount: domainData.dismissCount || 0,
          acceptCount: domainData.acceptCount || 0
        };
      });

      setBudgets(budgetList);
      return budgetList;
    } catch (error) {
      console.error('Failed to load fatigue budgets:', error);
      return [];
    }
  };

  const loadCooldowns = (budgetList: DomainBudget[]) => {
    const now = Date.now();
    const activeCooldowns: CooldownStatus[] = [];

    budgetList.forEach(budget => {
      if (budget.cooldownUntil && budget.cooldownUntil > now) {
        activeCooldowns.push({
          domain: budget.domain,
          reason: budget.used >= budget.dailyLimit ? 'Daily limit reached' : 'User dismissed',
          until: budget.cooldownUntil,
          duration: budget.cooldownUntil - now,
          canOverride: budget.dismissCount < 3 // Allow override if not repeatedly dismissed
        });
      }
    });

    setCooldowns(activeCooldowns);
  };

  const calculateMetrics = (budgetList: DomainBudget[]): FatigueMetrics => {
    const totalNudges = budgetList.reduce((sum, b) => sum + b.used, 0);
    const totalAccepts = budgetList.reduce((sum, b) => sum + b.acceptCount, 0);
    const totalDismiss = budgetList.reduce((sum, b) => sum + b.dismissCount, 0);
    
    const domainsAtLimit = budgetList.filter(b => b.remaining === 0).length;
    const avgAcceptanceRate = totalNudges > 0 ? totalAccepts / totalNudges : 0;
    
    // Calculate fatigue score (0-100, higher = more fatigued)
    const limitUtilization = budgetList.reduce((sum, b) => sum + (b.used / b.dailyLimit), 0) / budgetList.length;
    const dismissRatio = totalNudges > 0 ? totalDismiss / totalNudges : 0;
    const overallFatigueScore = Math.min(100, (limitUtilization * 50) + (dismissRatio * 50));

    const dismissStreaks: Record<string, number> = {};
    budgetList.forEach(budget => {
      if (budget.dismissCount > 0) {
        dismissStreaks[budget.domain] = budget.dismissCount;
      }
    });

    return {
      overallFatigueScore,
      domainsAtLimit,
      avgAcceptanceRate,
      dismissStreaks,
      peakUsageHour: new Date().getHours() // Simplified
    };
  };

  const refreshData = () => {
    setLoading(true);
    try {
      const budgetList = loadBudgets();
      loadCooldowns(budgetList);
      const metricsData = calculateMetrics(budgetList);
      setMetrics(metricsData);
      
      // Check global pause state
      const paused = localStorage.getItem('globalNudgePause') === 'true';
      setGlobalPause(paused);
    } catch (error) {
      console.error('Failed to refresh fatigue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleGlobalPause = () => {
    const newState = !globalPause;
    setGlobalPause(newState);
    localStorage.setItem('globalNudgePause', newState.toString());
    
    if (newState) {
      // Set cooldown for all domains for 1 hour
      const oneHourFromNow = Date.now() + (60 * 60 * 1000);
      const stored = localStorage.getItem('fatiguebudgets') || '{}';
      const budgetData = JSON.parse(stored);
      const today = new Date().toDateString();
      
      if (!budgetData[today]) budgetData[today] = {};
      
      Object.keys(DEFAULT_BUDGETS).forEach(domain => {
        if (!budgetData[today][domain]) budgetData[today][domain] = {};
        budgetData[today][domain].cooldownUntil = oneHourFromNow;
      });
      
      localStorage.setItem('fatiguebudgets', JSON.stringify(budgetData));
      refreshData();
    }
  };

  const resetBudgets = () => {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('fatiguebudgets') || '{}';
    const budgetData = JSON.parse(stored);
    
    // Clear today's data
    delete budgetData[today];
    localStorage.setItem('fatiguebudgets', JSON.stringify(budgetData));
    
    // Clear global pause
    localStorage.removeItem('globalNudgePause');
    
    refreshData();
  };

  const overrideCooldown = (domain: string) => {
    const stored = localStorage.getItem('fatiguebudgets') || '{}';
    const budgetData = JSON.parse(stored);
    const today = new Date().toDateString();
    
    if (budgetData[today] && budgetData[today][domain]) {
      delete budgetData[today][domain].cooldownUntil;
      localStorage.setItem('fatiguebudgets', JSON.stringify(budgetData));
      refreshData();
    }
  };

  const getBudgetColor = (used: number, limit: number) => {
    const percentage = used / limit;
    if (percentage >= 1) return 'hsl(var(--destructive))';
    if (percentage >= 0.8) return 'hsl(var(--warning))';
    if (percentage >= 0.6) return 'hsl(var(--secondary))';
    return 'hsl(var(--primary))';
  };

  const getFatigueColor = (score: number) => {
    if (score >= 80) return 'destructive';
    if (score >= 60) return 'secondary';
    if (score >= 40) return 'outline';
    return 'default';
  };

  const formatDomain = (domain: string) => {
    return domain.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  const prepareBudgetChartData = () => {
    return budgets.map(budget => ({
      domain: formatDomain(budget.domain),
      used: budget.used,
      remaining: budget.remaining,
      limit: budget.dailyLimit,
      utilization: Math.round((budget.used / budget.dailyLimit) * 100)
    }));
  };

  const prepareAcceptanceData = () => {
    return budgets.filter(b => b.used > 0).map(budget => ({
      domain: formatDomain(budget.domain),
      acceptanceRate: budget.used > 0 ? Math.round((budget.acceptCount / budget.used) * 100) : 0,
      dismissCount: budget.dismissCount
    }));
  };

  useEffect(() => {
    refreshData();
    
    // Refresh every minute to update cooldown timers
    const interval = setInterval(refreshData, 60000);
    return () => clearInterval(interval);
  }, []);

  const chartData = prepareBudgetChartData();
  const acceptanceData = prepareAcceptanceData();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Fatigue Budget Monitor</h1>
            <p className="text-muted-foreground">
              Per-domain nudge budgets and cooldown tracking (includes calendar suggestions)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={globalPause ? "destructive" : "outline"}
              onClick={toggleGlobalPause}
              className="gap-2"
            >
              {globalPause ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {globalPause ? 'Resume All' : 'Pause All'}
            </Button>
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="destructive"
              onClick={resetBudgets}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Today
            </Button>
          </div>
        </div>

        {globalPause && (
          <Alert>
            <Pause className="h-4 w-4" />
            <AlertDescription>
              All nudges are globally paused. Use "Resume All" to re-enable.
            </AlertDescription>
          </Alert>
        )}

        {/* Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">Fatigue Score</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{Math.round(metrics?.overallFatigueScore || 0)}</p>
                    <Badge variant={getFatigueColor(metrics?.overallFatigueScore || 0)}>
                      {metrics?.overallFatigueScore ? 
                        (metrics.overallFatigueScore >= 80 ? 'High' :
                         metrics.overallFatigueScore >= 60 ? 'Medium' :
                         metrics.overallFatigueScore >= 40 ? 'Low' : 'Minimal') : 'Minimal'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium">At Limit</p>
                  <p className="text-2xl font-bold">{metrics?.domainsAtLimit || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-green-500" />
                <div>
                  <p className="text-sm font-medium">Accept Rate</p>
                  <p className="text-2xl font-bold">
                    {Math.round((metrics?.avgAcceptanceRate || 0) * 100)}%
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
                  <p className="text-sm font-medium">Active Cooldowns</p>
                  <p className="text-2xl font-bold">{cooldowns.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Cooldowns */}
        {cooldowns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Active Cooldowns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cooldowns.map((cooldown, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{formatDomain(cooldown.domain)}</p>
                    <p className="text-sm text-muted-foreground">
                      {cooldown.reason} • {formatDuration(cooldown.duration)} remaining
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Cooling Down</Badge>
                    {cooldown.canOverride && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => overrideCooldown(cooldown.domain)}
                      >
                        Override
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Budget Usage Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Daily Budget Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="domain" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      value, 
                      name === 'used' ? 'Used' : 'Remaining'
                    ]}
                  />
                  <Bar dataKey="used" fill="hsl(var(--primary))" />
                  <Bar dataKey="remaining" fill="hsl(var(--muted))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acceptance Rates</CardTitle>
            </CardHeader>
            <CardContent>
              {acceptanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={acceptanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="domain" angle={-45} textAnchor="end" height={80} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value) => [`${value}%`, 'Acceptance Rate']} />
                    <Bar dataKey="acceptanceRate" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No nudges sent today yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Individual Budget Details */}
        <Card>
          <CardHeader>
            <CardTitle>Budget Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {budgets.map((budget, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium min-w-[120px]">
                      {formatDomain(budget.domain)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {budget.used} / {budget.dailyLimit}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {budget.acceptCount > 0 && (
                      <Badge variant="outline">
                        {Math.round((budget.acceptCount / budget.used) * 100)}% accepted
                      </Badge>
                    )}
                    {budget.remaining === 0 && (
                      <Badge variant="destructive">Limit Reached</Badge>
                    )}
                    {budget.cooldownUntil && budget.cooldownUntil > Date.now() && (
                      <Badge variant="secondary">Cooling Down</Badge>
                    )}
                  </div>
                </div>
                <Progress 
                  value={(budget.used / budget.dailyLimit) * 100} 
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}