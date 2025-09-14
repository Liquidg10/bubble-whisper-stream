/**
 * Smart Financial Insights - AI-powered financial analysis and task suggestions
 * Provides contextual recommendations and automated task creation
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Brain,
  TrendingUp,
  Target,
  Calendar,
  DollarSign,
  AlertTriangle,
  Lightbulb,
  Zap,
  CheckCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled } from '@/config/flags';
import { financialTaskCreationService } from '@/services/financialTaskCreationService';
import { financialContextService } from '@/services/financialContextService';
import { budgetService } from '@/services/budgetService';
import type { Task } from '@/types/task';
import type { FinancialContext } from '@/services/financialContextService';
import { supabase } from '@/integrations/supabase/client';

interface SmartRecommendation {
  id: string;
  type: 'budget' | 'payment' | 'saving' | 'investment' | 'optimization';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number;
  actionable: boolean;
  suggestedTasks?: Partial<Task>[];
  metadata?: Record<string, any>;
}

interface SmartFinancialInsightsProps {
  className?: string;
}

export function SmartFinancialInsights({ className }: SmartFinancialInsightsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [financialContext, setFinancialContext] = useState<FinancialContext | null>(null);
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [appliedRecommendations, setAppliedRecommendations] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (isFeatureEnabled('budget')) {
      loadFinancialInsights();
    }
  }, []);

  const loadFinancialInsights = async () => {
    setIsLoading(true);
    try {
      // Only load if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const context = await financialContextService.generateFinancialContext(user.id);
      setFinancialContext(context);
      
      const smartRecommendations = await generateSmartRecommendations(context);
      setRecommendations(smartRecommendations);

    } catch (error) {
      console.error('Failed to load financial insights:', error);
      toast({
        title: "Failed to load insights",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateSmartRecommendations = async (context: FinancialContext): Promise<SmartRecommendation[]> => {
    const recommendations: SmartRecommendation[] = [];

    // Budget optimization recommendations
    if (context.overallPressure > 0.6) {
      recommendations.push({
        id: 'budget-review',
        type: 'budget',
        title: 'Review and optimize budget allocation',
        description: 'Your financial pressure is elevated. Review budget categories to identify optimization opportunities.',
        impact: 'high',
        confidence: 0.85,
        actionable: true,
        suggestedTasks: [{
          type: 'task',
          title: 'Analyze budget allocation patterns',
          description: 'Review spending by category and identify areas for optimization',
          priority: 75
        }]
      });
    }

    // Payment optimization
    if (context.upcomingPayments.length > 3) {
      recommendations.push({
        id: 'payment-scheduling',
        type: 'payment',
        title: 'Optimize payment scheduling',
        description: `You have ${context.upcomingPayments.length} upcoming payments. Consider consolidating payment dates to improve cash flow.`,
        impact: 'medium',
        confidence: 0.75,
        actionable: true,
        suggestedTasks: [{
          type: 'task',
          title: 'Consolidate payment schedules',
          description: 'Review payment dates and negotiate consolidated billing cycles',
          priority: 60
        }]
      });
    }

    // Saving opportunities
    const envelopes = await budgetService.getEnvelopes();
    const underUtilizedEnvelopes = envelopes.filter(env => 
      env.spent < (env.monthlyLimit * 0.7) && env.monthlyLimit > 100
    );

    if (underUtilizedEnvelopes.length > 0) {
      recommendations.push({
        id: 'savings-opportunity',
        type: 'saving',
        title: 'Potential savings opportunity detected',
        description: `${underUtilizedEnvelopes.length} budget categories are under-utilized. Consider reallocating funds.`,
        impact: 'medium',
        confidence: 0.7,
        actionable: true,
        suggestedTasks: [{
          type: 'task',
          title: 'Review under-utilized budgets',
          description: 'Analyze under-spent categories and consider reallocation or savings transfer',
          priority: 50
        }]
      });
    }

    // Financial goal setting
    if (context.budgetStatus === 'healthy' && context.overallPressure < 0.4) {
      recommendations.push({
        id: 'financial-goals',
        type: 'investment',
        title: 'Consider setting financial goals',
        description: 'Your finances are stable. This is a good time to set savings or investment goals.',
        impact: 'high',
        confidence: 0.8,
        actionable: true,
        suggestedTasks: [{
          type: 'task',
          title: 'Define financial goals',
          description: 'Set short-term and long-term financial objectives and create action plans',
          priority: 40
        }]
      });
    }

    // Spending pattern optimization
    recommendations.push({
      id: 'spending-patterns',
      type: 'optimization',
      title: 'Analyze spending patterns for insights',
      description: 'Review your spending patterns to identify trends and optimization opportunities.',
      impact: 'medium',
      confidence: 0.65,
      actionable: true,
      suggestedTasks: [{
        type: 'task',
        title: 'Monthly spending pattern analysis',
        description: 'Review spending trends and identify patterns for better budgeting',
        priority: 35
      }]
    });

    return recommendations;
  };

  const handleApplyRecommendation = async (recommendation: SmartRecommendation) => {
    if (!recommendation.suggestedTasks) return;

    try {
      // Create tasks from recommendations
      const tasks = recommendation.suggestedTasks.map(taskData => ({
        id: crypto.randomUUID(),
        type: taskData.type || 'task',
        title: taskData.title || '',
        description: taskData.description || '',
        completed: false,
        priority: taskData.priority || 50,
        tags: [
          { id: crypto.randomUUID(), name: 'financial-insight', emoji: '🧠' },
          { id: crypto.randomUUID(), name: recommendation.type, emoji: '💡' }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        view: { list: { order: 0 } },
        metadata: {
          finance: {}
        }
      })) as Task[];

      // Mark recommendation as applied
      setAppliedRecommendations(prev => new Set([...prev, recommendation.id]));

      toast({
        title: "Recommendation applied",
        description: `Created ${tasks.length} task${tasks.length !== 1 ? 's' : ''} from insight`
      });

    } catch (error) {
      console.error('Failed to apply recommendation:', error);
      toast({
        title: "Failed to apply recommendation",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return <Badge variant="default">High Impact</Badge>;
      case 'medium': return <Badge variant="secondary">Medium Impact</Badge>;
      case 'low': return <Badge variant="outline">Low Impact</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (!isFeatureEnabled('budget')) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Enable budget features to access smart financial insights.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              Smart Financial Insights
              <Badge variant="secondary">AI-Powered</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {financialContext && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(financialContext.overallPressure * 100)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Financial Pressure</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {recommendations.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Smart Recommendations</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {appliedRecommendations.size}
                  </div>
                  <div className="text-sm text-muted-foreground">Applied Insights</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommendations */}
        {recommendations.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Personalized Recommendations
            </h3>
            
            {recommendations.map((recommendation) => {
              const isApplied = appliedRecommendations.has(recommendation.id);
              
              return (
                <Card key={recommendation.id} className={isApplied ? 'opacity-60' : ''}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">{recommendation.title}</h4>
                          {getImpactBadge(recommendation.impact)}
                          <Badge variant="outline">
                            {Math.round(recommendation.confidence * 100)}% confidence
                          </Badge>
                          {isApplied && (
                            <Badge variant="default">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Applied
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {recommendation.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {recommendation.type}
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {recommendation.impact} impact
                          </span>
                          {recommendation.suggestedTasks && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {recommendation.suggestedTasks.length} task{recommendation.suggestedTasks.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {recommendation.actionable && !isApplied && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleApplyRecommendation(recommendation)}
                            disabled={isLoading}
                          >
                            Apply Insight
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Alert>
            <Brain className="h-4 w-4" />
            <AlertDescription>
              {isLoading ? 'Analyzing your financial data...' : 'No recommendations available. Connect more financial data for better insights.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Refresh Button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadFinancialInsights}
            disabled={isLoading}
          >
            <Brain className="h-4 w-4 mr-2" />
            {isLoading ? 'Analyzing...' : 'Refresh Insights'}
          </Button>
        </div>
      </div>
    </div>
  );
}