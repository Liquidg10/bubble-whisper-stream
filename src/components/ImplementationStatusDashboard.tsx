/**
 * Implementation Status Dashboard - P0-P20 Bible Features Monitoring
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Settings,
  Database,
  Shield,
  Brain,
  Zap,
  Eye,
  RefreshCw
} from 'lucide-react';
import { isFeatureEnabled, updateFlag } from '@/config/flags';
import { enhancedCalendarService } from '@/services/enhancedCalendarService';
import { enhancedGmailService } from '@/services/enhancedGmailService';
import { crisisDetectionService } from '@/services/crisisDetectionService';
import { cognitiveLoadGovernor } from '@/services/cognitiveLoadGovernor';
import { enhancedReceiptService } from '@/services/enhancedReceiptService';

interface P0Feature {
  id: string;
  name: string;
  description: string;
  status: 'complete' | 'partial' | 'missing' | 'error';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'core' | 'integration' | 'intelligence' | 'safety' | 'ux';
  flagKey?: string;
  healthCheck?: () => Promise<boolean>;
}

const BIBLE_FEATURES: P0Feature[] = [
  // P0 Core Features
  {
    id: 'unified-task-system',
    name: 'Unified Task System',
    description: 'Single Task entity with view adapters',
    status: 'complete',
    priority: 'P0',
    category: 'core'
  },
  {
    id: 'decision-trace',
    name: 'Decision Trace & Undo',
    description: 'Explainable AI with undo capabilities',
    status: 'complete',
    priority: 'P0',
    category: 'core'
  },
  {
    id: 'view-sdk',
    name: 'View SDK',
    description: 'Multiple view paradigms (Bubble, List, Kanban, Matrix)',
    status: 'complete',
    priority: 'P0',
    category: 'core'
  },

  // P1 Safety & Privacy
  {
    id: 'crisis-detection',
    name: 'Crisis Detection',
    description: 'Language pattern crisis detection with safety protocols',
    status: 'complete',
    priority: 'P0',
    category: 'safety',
    flagKey: 'cbtCrisisEnabled',
    healthCheck: async () => {
      const state = crisisDetectionService.getCurrentState();
      return typeof state === 'object' && state !== null;
    }
  },
  {
    id: 'privacy-layers',
    name: 'Privacy Layers',
    description: 'Surface/Context/Deep privacy controls',
    status: 'partial',
    priority: 'P0',
    category: 'safety'
  },
  {
    id: 'cognitive-load-governor',
    name: 'Cognitive Load Governor',
    description: 'Nudge fatigue prevention and timing',
    status: 'complete',
    priority: 'P1',
    category: 'intelligence'
  },

  // P1 Integrations
  {
    id: 'calendar-integration',
    name: 'Enhanced Calendar Integration',
    description: 'Bounded sync, watch renewal, 410 handling',
    status: 'complete',
    priority: 'P1',
    category: 'integration',
    healthCheck: async () => {
      try {
        const health = enhancedCalendarService.getHealthStatus([]);
        return typeof health === 'object';
      } catch {
        return false;
      }
    }
  },
  {
    id: 'gmail-integration',
    name: 'Enhanced Gmail Integration',
    description: 'Draft composition, label guards, history handling',
    status: 'complete',
    priority: 'P1',
    category: 'integration',
    healthCheck: async () => {
      try {
        // Simple health check for Gmail service
        return typeof enhancedGmailService === 'object';
      } catch {
        return false;
      }
    }
  },
  {
    id: 'receipt-processing',
    name: 'Enhanced Receipt Processing',
    description: 'Line-item extraction and financial categorization',
    status: 'complete',
    priority: 'P2',
    category: 'integration',
    healthCheck: async () => {
          try {
            const file = new File(['test'], 'test-image.jpg', { type: 'image/jpeg' });
            const result = await enhancedReceiptService.processReceipt(file);
            return result && typeof result === 'object';
          } catch {
            return false;
          }
    }
  },

  // P2 Intelligence
  {
    id: 'auto-write-ladder',
    name: 'Auto-Write Ladder',
    description: 'Suggest/Draft/Auto with confidence gating',
    status: 'partial',
    priority: 'P1',
    category: 'intelligence'
  },
  {
    id: 'mood-engine',
    name: 'Mood & Behavior Engine',
    description: 'Timeline ribbons and contextual insights',
    status: 'partial',
    priority: 'P2',
    category: 'intelligence',
    flagKey: 'moodEngine'
  },
  {
    id: 'planning-mode',
    name: 'Planning Mode',
    description: 'WOOP/Implementation intentions with micro-chips',
    status: 'partial',
    priority: 'P2',
    category: 'ux'
  },

  // P3 Advanced Features
  {
    id: 'voice-unified',
    name: 'Unified Voice Engine',
    description: 'Single hotkey, session locking, intent classification',
    status: 'partial',
    priority: 'P3',
    category: 'ux',
    flagKey: 'voiceEngineUnified'
  },
  {
    id: 'timeline-v2',
    name: 'Timeline 2.0',
    description: 'Mood ribbons with Because explanations',
    status: 'partial',
    priority: 'P3',
    category: 'ux',
    flagKey: 'timelineV2'
  }
];

export function ImplementationStatusDashboard() {
  const [features, setFeatures] = useState<P0Feature[]>(BIBLE_FEATURES);
  const [healthChecking, setHealthChecking] = useState(false);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);

  const runHealthChecks = async () => {
    setHealthChecking(true);
    
    try {
            const updatedFeatures = await Promise.all(
              features.map(async (feature) => {
                if (!feature.healthCheck) return feature;
                
                try {
                  const isHealthy = await feature.healthCheck();
                  return {
                    ...feature,
                    status: (isHealthy ? 'complete' : 'error') as P0Feature['status']
                  };
                } catch (error) {
                  console.error(`Health check failed for ${feature.id}:`, error);
                  return {
                    ...feature,
                    status: 'error' as P0Feature['status']
                  };
                }
              })
            );
      
      setFeatures(updatedFeatures);
      setLastHealthCheck(new Date());
    } catch (error) {
      console.error('Health check batch failed:', error);
    } finally {
      setHealthChecking(false);
    }
  };

  useEffect(() => {
    runHealthChecks();
  }, []);

  const getStatusIcon = (status: P0Feature['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'partial':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'missing':
        return <AlertTriangle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getCategoryIcon = (category: P0Feature['category']) => {
    switch (category) {
      case 'core':
        return <Database className="h-4 w-4" />;
      case 'safety':
        return <Shield className="h-4 w-4" />;
      case 'intelligence':
        return <Brain className="h-4 w-4" />;
      case 'integration':
        return <Zap className="h-4 w-4" />;
      case 'ux':
        return <Eye className="h-4 w-4" />;
    }
  };

  const getCompletionStats = () => {
    const total = features.length;
    const complete = features.filter(f => f.status === 'complete').length;
    const partial = features.filter(f => f.status === 'partial').length;
    const error = features.filter(f => f.status === 'error').length;
    
    const percentage = Math.round((complete / total) * 100);
    
    return { total, complete, partial, error, percentage };
  };

  const stats = getCompletionStats();
  const featuresByCategory = features.reduce((acc, feature) => {
    if (!acc[feature.category]) acc[feature.category] = [];
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, P0Feature[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Implementation Bible Status
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={runHealthChecks}
                disabled={healthChecking}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${healthChecking ? 'animate-spin' : ''}`} />
                Health Check
              </Button>
            </div>
          </div>
          {lastHealthCheck && (
            <p className="text-sm text-muted-foreground">
              Last checked: {lastHealthCheck.toLocaleTimeString()}
            </p>
          )}
        </CardHeader>
        
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Completion</span>
                <span className="text-sm text-muted-foreground">
                  {stats.complete}/{stats.total} features
                </span>
              </div>
              <Progress value={stats.percentage} className="h-2" />
            </div>
            
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.complete}</div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{stats.partial}</div>
                <div className="text-xs text-muted-foreground">Partial</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.error}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.percentage}%</div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Details */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4">
            {Object.entries(featuresByCategory).map(([category, categoryFeatures]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {getCategoryIcon(category as P0Feature['category'])}
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                    <Badge variant="secondary">
                      {categoryFeatures.filter(f => f.status === 'complete').length}/{categoryFeatures.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {categoryFeatures.map((feature) => (
                      <div key={feature.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(feature.status)}
                          <div>
                            <div className="font-medium text-sm">{feature.name}</div>
                            <div className="text-xs text-muted-foreground">{feature.description}</div>
                          </div>
                        </div>
                        <Badge variant={feature.priority === 'P0' ? 'destructive' : 'secondary'}>
                          {feature.priority}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>All Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {features.map((feature) => (
                  <div key={feature.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(feature.status)}
                      {getCategoryIcon(feature.category)}
                      <div className="flex-1">
                        <div className="font-medium">{feature.name}</div>
                        <div className="text-sm text-muted-foreground">{feature.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={feature.priority === 'P0' ? 'destructive' : 'secondary'}>
                        {feature.priority}
                      </Badge>
                      <Badge variant="outline">
                        {feature.category}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flags">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flag Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {features
                  .filter(f => f.flagKey)
                  .map((feature) => (
                    <div key={feature.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <div className="font-medium">{feature.name}</div>
                        <div className="text-sm text-muted-foreground">{feature.description}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Flag: {feature.flagKey}
                        </div>
                      </div>
                      <Switch
                        checked={isFeatureEnabled(feature.flagKey! as any)}
                        onCheckedChange={(checked) => updateFlag(feature.flagKey! as any, checked)}
                      />
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}