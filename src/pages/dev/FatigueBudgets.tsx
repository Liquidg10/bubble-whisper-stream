/**
 * P14 - Cognitive Load Governor Dev Route
 * Monitor nudge budgets, cooldowns, and fatigue protection
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Shield, Clock, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DomainBudget {
  domain: string;
  maxPerDay: number;
  used: number;
  cooldownUntil?: number;
  lastDismissal?: number;
  overNudgeCount: number;
}

interface FatigueMetrics {
  totalNudges: number;
  dismissalRate: number;
  overNudgeRate: number;
  avgCooldown: number;
  protectionEvents: number;
}

const DEFAULT_BUDGETS: DomainBudget[] = [
  { domain: 'task_suggestions', maxPerDay: 8, used: 0, overNudgeCount: 0 },
  { domain: 'cbt_insights', maxPerDay: 3, used: 0, overNudgeCount: 0 },
  { domain: 'planning_nudges', maxPerDay: 2, used: 0, overNudgeCount: 0 },
  { domain: 'celebrations', maxPerDay: 6, used: 0, overNudgeCount: 0 },
  { domain: 'reminders', maxPerDay: 12, used: 0, overNudgeCount: 0 },
  { domain: 'contextual_hints', maxPerDay: 5, used: 0, overNudgeCount: 0 }
];

export function FatigueBudgets() {
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<DomainBudget[]>(DEFAULT_BUDGETS);
  const [metrics, setMetrics] = useState<FatigueMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFatigueData();
  }, []);

  const loadFatigueData = async () => {
    try {
      // Load current budgets
      const today = new Date().toDateString();
      const budgetKey = `fatigue-budgets-${today}`;
      const stored = localStorage.getItem(budgetKey);
      
      if (stored) {
        setBudgets(JSON.parse(stored));
      }

      // Load metrics
      const metricsStored = localStorage.getItem('fatigue-metrics');
      if (metricsStored) {
        setMetrics(JSON.parse(metricsStored));
      } else {
        // Initialize metrics
        const initialMetrics: FatigueMetrics = {
          totalNudges: 0,
          dismissalRate: 0,
          overNudgeRate: 0,
          avgCooldown: 0,
          protectionEvents: 0
        };
        setMetrics(initialMetrics);
      }

    } catch (error) {
      console.error('Failed to load fatigue data:', error);
      toast({
        title: 'Failed to load fatigue data',
        description: 'Using default budgets',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getBudgetStatus = (budget: DomainBudget): 'safe' | 'warning' | 'exceeded' | 'cooldown' => {
    const now = Date.now();
    
    if (budget.cooldownUntil && now < budget.cooldownUntil) {
      return 'cooldown';
    }
    
    if (budget.used >= budget.maxPerDay) {
      return 'exceeded';
    }
    
    if (budget.used >= budget.maxPerDay * 0.8) {
      return 'warning';
    }
    
    return 'safe';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'safe': return 'text-primary';
      case 'warning': return 'text-yellow-600';
      case 'exceeded': return 'text-destructive';
      case 'cooldown': return 'text-blue-600';
      default: return 'text-on-surface-variant';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'safe': return <Shield className="h-4 w-4 text-primary" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'exceeded': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'cooldown': return <Clock className="h-4 w-4 text-blue-600" />;
      default: return null;
    }
  };

  const simulateNudge = (domain: string) => {
    setBudgets(prev => prev.map(budget => {
      if (budget.domain === domain) {
        const newUsed = budget.used + 1;
        const status = getBudgetStatus({ ...budget, used: newUsed });
        
        // Trigger cooldown if exceeded
        let cooldownUntil = budget.cooldownUntil;
        let overNudgeCount = budget.overNudgeCount;
        
        if (status === 'exceeded') {
          cooldownUntil = Date.now() + (30 * 60 * 1000); // 30 min cooldown
          overNudgeCount += 1;
        }
        
        return { ...budget, used: newUsed, cooldownUntil, overNudgeCount };
      }
      return budget;
    }));

    toast({
      title: `Nudge sent: ${domain}`,
      description: 'Budget consumption updated',
      duration: 2000
    });
  };

  const resetBudgets = () => {
    setBudgets(DEFAULT_BUDGETS);
    
    const today = new Date().toDateString();
    localStorage.removeItem(`fatigue-budgets-${today}`);
    
    toast({
      title: 'Budgets reset',
      description: 'All domain budgets restored to daily limits',
      duration: 3000
    });
  };

  const getRemainingCooldown = (budget: DomainBudget): string => {
    if (!budget.cooldownUntil) return '';
    
    const remaining = budget.cooldownUntil - Date.now();
    if (remaining <= 0) return '';
    
    const minutes = Math.ceil(remaining / (60 * 1000));
    return `${minutes}m`;
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

  const totalBudgetUsed = budgets.reduce((sum, b) => sum + b.used, 0);
  const totalBudgetMax = budgets.reduce((sum, b) => sum + b.maxPerDay, 0);
  const protectedDomains = budgets.filter(b => getBudgetStatus(b) === 'exceeded').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Fatigue Budgets</h1>
          <p className="text-on-surface-variant">Monitor nudge budgets and cognitive load protection</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {totalBudgetUsed}/{totalBudgetMax} today
          </Badge>
          {protectedDomains > 0 && (
            <Badge variant="destructive">
              {protectedDomains} domains protected
            </Badge>
          )}
        </div>
      </div>

      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span>Total Budget Consumption</span>
            <span className="text-sm text-on-surface-variant">
              {((totalBudgetUsed / totalBudgetMax) * 100).toFixed(1)}%
            </span>
          </div>
          <Progress value={(totalBudgetUsed / totalBudgetMax) * 100} className="h-2" />
          
          {metrics && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-1">
                <div className="text-sm text-on-surface-variant">Over-nudge Rate</div>
                <div className="text-lg font-medium">{(metrics.overNudgeRate * 100).toFixed(1)}%</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-on-surface-variant">Protection Events</div>
                <div className="text-lg font-medium">{metrics.protectionEvents}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain Budgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {budgets.map(budget => {
          const status = getBudgetStatus(budget);
          const usagePercent = (budget.used / budget.maxPerDay) * 100;
          
          return (
            <Card key={budget.domain}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="capitalize">
                    {budget.domain.replace('_', ' ')}
                  </span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(status)}
                    <Badge variant="outline" className={getStatusColor(status)}>
                      {budget.used}/{budget.maxPerDay}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress 
                  value={Math.min(usagePercent, 100)} 
                  className="h-2"
                />
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-on-surface-variant">
                    {status === 'cooldown' && `Cooldown: ${getRemainingCooldown(budget)}`}
                    {status === 'exceeded' && 'Budget exceeded'}
                    {status === 'warning' && 'Approaching limit'}
                    {status === 'safe' && 'Available'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => simulateNudge(budget.domain)}
                    disabled={status === 'cooldown'}
                    className="h-6 px-2 text-xs"
                  >
                    Test Nudge
                  </Button>
                </div>
                
                {budget.overNudgeCount > 0 && (
                  <div className="text-xs text-destructive">
                    Over-nudge events: {budget.overNudgeCount}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={resetBudgets} variant="outline">
            Reset All Budgets
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}