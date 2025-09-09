import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  BarChart3, 
  Zap, 
  AlertTriangle, 
  Play, 
  RotateCcw,
  Eye,
  TestTube,
  Activity,
  Bell
} from 'lucide-react';
import { metricsService, MetricType } from '@/services/metricsService';
import { alertingService } from '@/services/alertingService';
import { MetricsDashboard } from '@/components/MetricsDashboard';

interface MetricGenerator {
  type: MetricType;
  label: string;
  description: string;
  valueRange: [number, number];
  defaultValue: number;
}

const METRIC_GENERATORS: MetricGenerator[] = [
  {
    type: 'auto_write_rate',
    label: 'Auto-Write Success',
    description: 'Simulate auto-write attempts with varying success rates',
    valueRange: [0, 1],
    defaultValue: 0.8
  },
  {
    type: 'undo_rate', 
    label: 'User Undos',
    description: 'Generate undo events to test spike detection',
    valueRange: [0, 10],
    defaultValue: 1
  },
  {
    type: 'edit_distance',
    label: 'Edit Distance',
    description: 'Simulate how much users modify AI output',
    valueRange: [0, 1],
    defaultValue: 0.3
  },
  {
    type: 'watch_channel_health',
    label: 'Channel Health',
    description: 'Simulate webhook channel status',
    valueRange: [0, 1],
    defaultValue: 0.9
  },
  {
    type: 'webhook_error',
    label: 'Webhook Errors',
    description: 'Generate webhook failure events',
    valueRange: [0, 5],
    defaultValue: 0
  },
  {
    type: 'scope_decay_action',
    label: 'Scope Decay',
    description: 'Simulate OAuth permission reductions',
    valueRange: [0, 3],
    defaultValue: 0
  }
];

const ALERT_SCENARIOS = [
  {
    id: 'undo_spike',
    name: 'Undo Spike',
    description: 'Simulate multiple undos in rapid succession'
  },
  {
    id: 'channel_health_degradation',
    name: 'Channel Health Drop',
    description: 'Simulate degrading webhook channel health'
  },
  {
    id: 'auto_write_failure',
    name: 'Auto-Write Failures',
    description: 'Simulate consistent auto-write failures'
  },
  {
    id: 'webhook_retry_storm',
    name: 'Webhook Retry Storm',
    description: 'Simulate multiple webhook retry attempts'
  }
];

export default function DevMetricsAlerts() {
  const [selectedGenerator, setSelectedGenerator] = useState<MetricType>('auto_write_rate');
  const [generatorValue, setGeneratorValue] = useState<number>(0.8);
  const [generatorCount, setGeneratorCount] = useState<number>(10);
  const [autoGenerate, setAutoGenerate] = useState<boolean>(false);
  const [generationInterval, setGenerationInterval] = useState<number>(5000);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (autoGenerate) {
      interval = setInterval(() => {
        generateRandomMetrics();
      }, generationInterval);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoGenerate, generationInterval]);

  const generateMetrics = () => {
    const generator = METRIC_GENERATORS.find(g => g.type === selectedGenerator);
    if (!generator) return;

    for (let i = 0; i < generatorCount; i++) {
      // Add some randomness around the base value
      const variance = (Math.random() - 0.5) * 0.2; // ±10% variance
      let value = Math.max(generator.valueRange[0], 
        Math.min(generator.valueRange[1], generatorValue + variance));

      // Generate realistic metadata based on metric type
      let metadata: Record<string, any> = {};
      
      switch (generator.type) {
        case 'auto_write_rate':
          metadata = {
            confidence: 0.6 + Math.random() * 0.4,
            type: Math.random() > 0.5 ? 'calendar' : 'email',
            success: value > 0.5
          };
          value = value > 0.5 ? 1 : 0; // Convert to success/failure
          break;
          
        case 'edit_distance':
          metadata = {
            originalLength: Math.floor(50 + Math.random() * 200),
            finalLength: Math.floor(40 + Math.random() * 180),
            type: Math.random() > 0.5 ? 'email' : 'calendar'
          };
          break;
          
        case 'watch_channel_health':
          const status = value > 0.8 ? 'healthy' : value > 0.5 ? 'expiring' : 'expired';
          metadata = {
            channelId: `channel_${Math.floor(Math.random() * 1000)}`,
            status,
            expiresIn: status === 'expiring' ? Math.floor(Math.random() * 3600000) : undefined
          };
          break;
          
        case 'webhook_error':
          metadata = {
            endpoint: '/webhook/calendar',
            errorCode: Math.random() > 0.5 ? 500 : 429,
            errorMessage: 'Simulated webhook error',
            retryCount: Math.floor(Math.random() * 3)
          };
          break;
          
        case 'scope_decay_action':
          metadata = {
            service: Math.random() > 0.5 ? 'gmail' : 'calendar',
            oldScopes: ['read', 'write', 'modify'],
            newScopes: ['read'],
            reason: 'User permission revoked'
          };
          break;
      }

      metricsService.emit(generator.type, value, metadata);
      
      // Small delay between emissions
      if (i < generatorCount - 1) {
        setTimeout(() => {}, 100);
      }
    }
  };

  const generateRandomMetrics = () => {
    // Generate a random selection of metrics
    const generators = METRIC_GENERATORS.slice(0, 3 + Math.floor(Math.random() * 3));
    
    generators.forEach(generator => {
      const value = generator.valueRange[0] + 
        Math.random() * (generator.valueRange[1] - generator.valueRange[0]);
      metricsService.emit(generator.type, value, { automated: true });
    });
  };

  const runAlertScenario = async () => {
    if (!selectedScenario) return;
    
    setIsGenerating(true);
    
    try {
      switch (selectedScenario) {
        case 'undo_spike':
          // Generate 8 undos in rapid succession
          for (let i = 0; i < 8; i++) {
            metricsService.emit('undo_rate', 1, {
              action: 'merge_undo',
              timeAfterAction: Math.random() * 5000
            });
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          break;
          
        case 'channel_health_degradation':
          // Gradually degrade channel health
          for (let i = 0; i < 5; i++) {
            const health = 0.9 - (i * 0.2);
            metricsService.emit('watch_channel_health', health, {
              channelId: 'test_channel_123',
              status: health > 0.8 ? 'healthy' : health > 0.5 ? 'expiring' : 'expired',
              expiresIn: health > 0.5 ? (health * 3600000) : undefined
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          break;
          
        case 'auto_write_failure':
          // Generate consistent failures
          for (let i = 0; i < 10; i++) {
            metricsService.emit('auto_write_rate', 0, {
              confidence: 0.3 + Math.random() * 0.2,
              type: Math.random() > 0.5 ? 'calendar' : 'email',
              success: false,
              error: 'Simulated failure'
            });
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          break;
          
        case 'webhook_retry_storm':
          // Generate webhook errors with high retry counts
          for (let i = 0; i < 6; i++) {
            const retryCount = 3 + Math.floor(Math.random() * 5);
            metricsService.emit('webhook_error', 1, {
              endpoint: '/webhook/test',
              errorCode: 500,
              errorMessage: 'Service temporarily unavailable',
              retryCount
            });
            
            metricsService.emit('webhook_retry', retryCount, {
              endpoint: '/webhook/test',
              errorCode: 500
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          break;
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const clearAllData = () => {
    metricsService.clear();
    alertingService.clearAlerts();
  };

  const simulateAlert = (ruleId: string) => {
    alertingService.simulateAlert(ruleId);
  };

  const currentGenerator = METRIC_GENERATORS.find(g => g.type === selectedGenerator);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Metrics & Alerts Test Harness</h1>
        <Badge variant="outline">QA Tool</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Metric Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Metric Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="metric-type">Metric Type</Label>
              <Select value={selectedGenerator} onValueChange={(value) => setSelectedGenerator(value as MetricType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_GENERATORS.map(generator => (
                    <SelectItem key={generator.type} value={generator.type}>
                      {generator.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentGenerator && (
                <p className="text-xs text-muted-foreground mt-1">
                  {currentGenerator.description}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="metric-value">Value</Label>
              <Input
                id="metric-value"
                type="number"
                value={generatorValue}
                onChange={(e) => setGeneratorValue(parseFloat(e.target.value))}
                min={currentGenerator?.valueRange[0] || 0}
                max={currentGenerator?.valueRange[1] || 1}
                step="0.1"
              />
            </div>

            <div>
              <Label htmlFor="metric-count">Count</Label>
              <Input
                id="metric-count"
                type="number"
                value={generatorCount}
                onChange={(e) => setGeneratorCount(parseInt(e.target.value))}
                min="1"
                max="100"
              />
            </div>

            <Button onClick={generateMetrics} className="w-full">
              <Zap className="h-4 w-4 mr-2" />
              Generate Metrics
            </Button>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-generate">Auto Generate</Label>
                <Switch
                  id="auto-generate"
                  checked={autoGenerate}
                  onCheckedChange={setAutoGenerate}
                />
              </div>
              
              {autoGenerate && (
                <div>
                  <Label htmlFor="interval">Interval (ms)</Label>
                  <Input
                    id="interval"
                    type="number"
                    value={generationInterval}
                    onChange={(e) => setGenerationInterval(parseInt(e.target.value))}
                    min="1000"
                    max="60000"
                    step="1000"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alert Scenarios */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alert Scenarios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="scenario">Test Scenario</Label>
              <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                <SelectTrigger>
                  <SelectValue placeholder="Select scenario" />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_SCENARIOS.map(scenario => (
                    <SelectItem key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedScenario && (
                <p className="text-xs text-muted-foreground mt-1">
                  {ALERT_SCENARIOS.find(s => s.id === selectedScenario)?.description}
                </p>
              )}
            </div>

            <Button 
              onClick={runAlertScenario} 
              disabled={!selectedScenario || isGenerating}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              {isGenerating ? 'Running Scenario...' : 'Run Scenario'}
            </Button>

            <Separator />

            <div>
              <Label>Manual Alert Triggers</Label>
              <div className="space-y-2 mt-2">
                {alertingService.getRules().slice(0, 4).map(rule => (
                  <Button
                    key={rule.id}
                    variant="outline"
                    size="sm"
                    onClick={() => simulateAlert(rule.id)}
                    className="w-full text-left justify-start"
                  >
                    <Bell className="h-3 w-3 mr-2" />
                    {rule.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Control Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Test Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Quick Actions</Label>
              <Button variant="outline" onClick={clearAllData} className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" />
                Clear All Data
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Realistic Data Sets</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Generate a realistic day's worth of data
                  for (let i = 0; i < 50; i++) {
                    setTimeout(() => {
                      // Realistic auto-write success rate (85%)
                      metricsService.emit('auto_write_rate', Math.random() > 0.15 ? 1 : 0, {
                        confidence: 0.7 + Math.random() * 0.3,
                        type: Math.random() > 0.6 ? 'calendar' : 'email'
                      });
                      
                      // Occasional edit distance
                      if (Math.random() > 0.7) {
                        metricsService.emit('edit_distance', Math.random() * 0.4, {
                          type: 'email'
                        });
                      }
                      
                      // Periodic channel health checks
                      if (Math.random() > 0.8) {
                        metricsService.emit('watch_channel_health', 0.9 + Math.random() * 0.1, {
                          status: 'healthy'
                        });
                      }
                      
                      // Rare errors
                      if (Math.random() > 0.95) {
                        metricsService.emit('webhook_error', 1, {
                          errorCode: 500,
                          retryCount: 1
                        });
                      }
                    }, i * 100);
                  }
                }}
                className="w-full"
              >
                Generate Realistic Day
              </Button>
              
              <Button
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Generate stress test data
                  for (let i = 0; i < 20; i++) {
                    setTimeout(() => {
                      // High undo rate
                      metricsService.emit('undo_rate', 1, { action: 'stress_test' });
                      
                      // Poor auto-write success
                      metricsService.emit('auto_write_rate', Math.random() > 0.7 ? 1 : 0);
                      
                      // High edit distance
                      metricsService.emit('edit_distance', 0.6 + Math.random() * 0.4);
                      
                      // Multiple webhook errors
                      if (Math.random() > 0.5) {
                        metricsService.emit('webhook_error', 1, {
                          retryCount: 2 + Math.floor(Math.random() * 4)
                        });
                      }
                    }, i * 200);
                  }
                }}
                className="w-full"
              >
                Generate Stress Test
              </Button>
            </div>

            <Separator />

            <div className="text-sm text-muted-foreground space-y-1">
              <p>• Metrics persist in localStorage</p>
              <p>• Alerts trigger browser notifications</p>
              <p>• Dashboard updates every 30s</p>
              <p>• Use realistic scenarios for QA</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Dashboard */}
      <MetricsDashboard />
    </div>
  );
}