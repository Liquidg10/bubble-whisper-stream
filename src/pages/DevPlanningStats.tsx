import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Target, Clock } from 'lucide-react';

export default function DevPlanningStats() {
  // Mock data - in production this would come from analytics
  const acceptanceRate = 42; // 42% acceptance rate
  const avgCompletionTime = 38; // seconds
  const planToActionRate = 67; // conversion rate

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Planning Mode Statistics</h1>
          <p className="text-muted-foreground">
            MCII-lite flow metrics and acceptance thresholds
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Acceptance Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div data-testid="acceptance-rate" className="text-3xl font-bold">
                  {acceptanceRate}%
                </div>
                <div className="flex items-center gap-1">
                  <Badge 
                    variant={acceptanceRate >= 30 ? "secondary" : "destructive"}
                  >
                    {acceptanceRate >= 30 ? "✅ Above threshold" : "❌ Below threshold"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Minimum: 30% required for production
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Completion Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold">{avgCompletionTime}s</div>
                <Badge variant="secondary">
                  ✅ Under 40s target
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Average MCII flow completion
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Plan → Action
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold">{planToActionRate}%</div>
                <Badge variant="secondary">
                  ✅ Strong conversion
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Plans converted to calendar/subtasks
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Flow Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="font-medium">Wish Completion</div>
                <div className="text-2xl font-bold">94%</div>
              </div>
              <div>
                <div className="font-medium">Outcome Clarity</div>
                <div className="text-2xl font-bold">87%</div>
              </div>
              <div>
                <div className="font-medium">Obstacle ID</div>
                <div className="text-2xl font-bold">76%</div>
              </div>
              <div>
                <div className="font-medium">If-Then Plans</div>
                <div className="text-2xl font-bold">68%</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validation Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span>≥30% Acceptance Rate</span>
                <Badge variant={acceptanceRate >= 30 ? "secondary" : "destructive"}>
                  {acceptanceRate >= 30 ? "PASS" : "FAIL"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>≤40s Average Completion</span>
                <Badge variant={avgCompletionTime <= 40 ? "secondary" : "destructive"}>
                  {avgCompletionTime <= 40 ? "PASS" : "FAIL"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Optional Flow (Skippable)</span>
                <Badge variant="secondary">PASS</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}