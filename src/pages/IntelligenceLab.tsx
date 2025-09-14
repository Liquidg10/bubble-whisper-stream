/**
 * Intelligence Lab - Advanced AI Features Hub
 * Consolidates predictive intelligence, behavioral insights, and experimental AI features
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PredictiveIntelligencePanel } from '@/components/intelligence/PredictiveIntelligencePanel';
import { Brain, Sparkles, TrendingUp, AlertTriangle } from 'lucide-react';
import { isFeatureEnabled } from '@/config/flags';
import { shouldShowFeature } from '@/utils/gradualRollout';

export function IntelligenceLab() {
  const intelligenceEnabled = isFeatureEnabled('cbtAssist');
  const behaviorAnalysisEnabled = shouldShowFeature('behaviorAnalysis');
  const predictiveEnabled = shouldShowFeature('predictiveIntelligence');

  if (!intelligenceEnabled) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center py-12">
            <Brain className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h1 className="text-2xl font-bold mb-4">Intelligence Lab</h1>
            <p className="text-muted-foreground">
              Advanced AI features are currently disabled. Enable 'cbtAssist' to access the lab.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="h-8 w-8" />
              Intelligence Lab
            </h1>
            <p className="text-muted-foreground">
              Advanced AI capabilities for productivity optimization and behavioral insights
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Experimental
            </Badge>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Predictive Intelligence */}
          <Card className="col-span-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Predictive Intelligence
                {predictiveEnabled && (
                  <Badge variant="outline" className="text-xs">
                    Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Anticipatory suggestions and proactive insights based on your patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {predictiveEnabled ? (
                <PredictiveIntelligencePanel />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <p>Predictive Intelligence is not available in your rollout cohort</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Behavioral Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Behavioral Analysis
                {behaviorAnalysisEnabled && (
                  <Badge variant="outline" className="text-xs">
                    Beta
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Deep insights into productivity patterns and optimization opportunities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {behaviorAnalysisEnabled ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold text-primary">86%</div>
                      <div className="text-sm text-muted-foreground">Task Completion Rate</div>
                    </div>
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold text-primary">2.4h</div>
                      <div className="text-sm text-muted-foreground">Avg Focus Session</div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Behavioral insights help optimize your workflow patterns
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <p>Behavioral Analysis is not available in your rollout cohort</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feature Discovery */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Feature Discovery
              </CardTitle>
              <CardDescription>
                Discover new capabilities as they become available
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
                  <span className="text-sm">Burnout Prevention</span>
                  <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                </div>
                <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
                  <span className="text-sm">Context Engine</span>
                  <Badge variant="secondary" className="text-xs">Beta</Badge>
                </div>
                <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
                  <span className="text-sm">Smart Scheduling</span>
                  <Badge variant="outline" className="text-xs">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Help Section */}
        <Card>
          <CardHeader>
            <CardTitle>How to Use Intelligence Lab</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Predictive Intelligence</h4>
                <p className="text-muted-foreground">
                  Review suggestions daily and provide feedback to improve accuracy
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Behavioral Insights</h4>
                <p className="text-muted-foreground">
                  Use pattern analysis to optimize your work habits and energy levels
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Privacy</h4>
                <p className="text-muted-foreground">
                  All analysis happens locally. You can pause or disable features anytime
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}