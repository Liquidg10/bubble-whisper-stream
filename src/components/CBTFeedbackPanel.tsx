/**
 * PROMPT 8: CBT Feedback Dev Panel - Display feedback metrics and learning stats
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { cbtFeedbackService } from '@/services/cbtFeedbackService';
import { cbtLearningService } from '@/services/cbtLearningService';
import type { FeedbackMetrics } from '@/services/cbtFeedbackService';
import type { DistortionType } from '@/ai/cbt/types';

export function CBTFeedbackPanel() {
  const [metrics, setMetrics] = useState<FeedbackMetrics | null>(null);
  const [learningStats, setLearningStats] = useState<any>(null);
  const [recentAdjustments, setRecentAdjustments] = useState<any[]>([]);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    try {
      const feedbackMetrics = cbtFeedbackService.getFeedbackMetrics();
      const stats = cbtLearningService.getLearningStats();
      const adjustments = cbtFeedbackService.getRecentAdjustments();
      
      setMetrics(feedbackMetrics);
      setLearningStats(stats);
      setRecentAdjustments(adjustments);
    } catch (error) {
      console.error('[CBT Feedback Panel] Failed to load data:', error);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all CBT learning preferences and feedback history?')) {
      cbtLearningService.resetPreferences();
      cbtFeedbackService.clearHistory();
      refreshData();
    }
  };

  if (!metrics || !learningStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🧠 CBT Feedback & Learning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading feedback data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          🧠 CBT Feedback & Learning
          <div className="flex gap-2">
            <Button onClick={refreshData} variant="outline" size="sm">
              Refresh
            </Button>
            <Button onClick={handleReset} variant="destructive" size="sm">
              Reset
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Overall Metrics */}
        <div>
          <h4 className="font-semibold mb-3">📊 Overall Feedback</h4>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{metrics.totalFeedback}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{metrics.helpfulCount}</div>
              <div className="text-sm text-muted-foreground">Helpful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{metrics.declineCount}</div>
              <div className="text-sm text-muted-foreground">Declined</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">
                {(metrics.successRate * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Per-Distortion Breakdown */}
        <div>
          <h4 className="font-semibold mb-3">🎯 Per-Distortion Metrics</h4>
          <div className="space-y-3">
            {Object.entries(metrics.perDistortionMetrics).map(([distortionType, data]) => {
              const total = data.helpful + data.declined;
              if (total === 0) return null;

              return (
                <div key={distortionType} className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{distortionType}</Badge>
                      {data.adjustmentCount > 0 && (
                        <Badge variant="secondary">
                          Adjusted {data.adjustmentCount}x
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Threshold: {data.currentThreshold.toFixed(2)} 
                      {data.currentThreshold !== data.defaultThreshold && 
                        ` (was ${data.defaultThreshold.toFixed(2)})`
                      }
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-green-600 font-medium">{data.helpful} helpful</div>
                    </div>
                    <div>
                      <div className="text-orange-600 font-medium">{data.declined} declined</div>
                    </div>
                    <div>
                      <Progress 
                        value={data.successRate * 100} 
                        className="h-2"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {(data.successRate * 100).toFixed(1)}% success
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Recent Threshold Adjustments */}
        {recentAdjustments.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">⚡ Recent Threshold Adjustments</h4>
            <div className="space-y-2">
              {recentAdjustments.map((adjustment, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{adjustment.distortionType}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(adjustment.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div>
                      {adjustment.oldThreshold.toFixed(2)} → {adjustment.newThreshold.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {adjustment.reason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Feedback Events */}
        {metrics.recentFeedback.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">📝 Recent Feedback</h4>
            <div className="space-y-2">
              {metrics.recentFeedback.slice(-5).reverse().map((event) => (
                <div key={event.id} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={event.feedbackType === 'helpful' ? 'default' : 'secondary'}
                    >
                      {event.feedbackType}
                    </Badge>
                    <span className="text-muted-foreground">
                      {event.distortionTypes.join(', ')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
          <p><strong>Learning Algorithm:</strong></p>
          <p>• After 3 declines for a distortion type → raise confidence threshold by 0.05</p>
          <p>• Max 3 adjustments per type, 7-day cooling period between adjustments</p>
          <p>• Thresholds range from 0.75 (min) to 0.95 (max)</p>
        </div>
      </CardContent>
    </Card>
  );
}