import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, RotateCcw, AlertTriangle } from 'lucide-react';

export default function DevContextDrift() {
  const [isReset, setIsReset] = useState(false);

  const handleRollback = () => {
    setIsReset(true);
    setTimeout(() => setIsReset(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Context Drift Monitoring</h1>
          <p className="text-muted-foreground">
            Context Engine weight tracking and drift detection
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                Drift Chart
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div data-testid="drift-chart" className="space-y-4">
                <div className="h-48 bg-muted rounded flex items-center justify-center">
                  📊 Context Weight Drift (Last 14 days)
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium">Current Drift</div>
                    <div className="text-lg font-bold">8.2%</div>
                  </div>
                  <div>
                    <div className="font-medium">Threshold</div>
                    <div className="text-lg font-bold">15%</div>
                  </div>
                </div>
                <Badge variant="secondary">✅ Within limits</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Rollback Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button 
                  onClick={handleRollback}
                  variant="outline"
                  data-testid="rollback-button"
                  disabled={isReset}
                  className="w-full"
                >
                  {isReset ? 'Restoring...' : 'Restore Last Stable Weights'}
                </Button>
                
                {isReset && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded">
                    <div className="flex items-center gap-2 text-green-800">
                      <Badge variant="secondary">✅</Badge>
                      Context weights restored to last stable snapshot
                    </div>
                  </div>
                )}
                
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>Last snapshot: 2 days ago</div>
                  <div>Drift since snapshot: 3.1%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Weight Changes (Last 7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-medium">Priority Weighting</div>
                  <div className="flex items-center gap-2">
                    <span>0.42 → 0.45</span>
                    <Badge variant="outline">+7%</Badge>
                  </div>
                </div>
                <div>
                  <div className="font-medium">Urgency Factor</div>
                  <div className="flex items-center gap-2">
                    <span>0.38 → 0.35</span>
                    <Badge variant="outline">-8%</Badge>
                  </div>
                </div>
                <div>
                  <div className="font-medium">Context Relevance</div>
                  <div className="flex items-center gap-2">
                    <span>0.28 → 0.31</span>
                    <Badge variant="outline">+11%</Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Drift Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span>Current drift level</span>
                <Badge variant="secondary">Normal (8.2%)</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Alert threshold</span>
                <Badge variant="outline">15%</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Auto-rollback threshold</span>
                <Badge variant="outline">25%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}