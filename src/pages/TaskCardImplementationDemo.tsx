/**
 * Task Card Implementation Bible Demo
 * Complete showcase of all P0-P20 features working together
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, 
  Brain, 
  Shield, 
  Zap,
  Target,
  Calendar,
  Mail,
  BarChart3,
  Settings,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { TaskIntegrationManager } from '@/components/TaskIntegrationManager';
import { TaskViewsShowcase } from '@/components/TaskViewsShowcase';
import { ImplementationBibleStatus } from '@/pages/ImplementationBibleStatus';
import { ContextDrift } from '@/pages/dev/ContextDrift';
import { FatigueBudgets } from '@/pages/dev/FatigueBudgets';
import { CanaryRollout } from '@/pages/dev/CanaryRollout';
import { EnhancedMicroCelebrations } from '@/components/joy/EnhancedMicroCelebrations';

export function TaskCardImplementationDemo() {
  const [activeTab, setActiveTab] = useState('overview');

  const features = [
    {
      id: 'unified-task-system',
      name: 'Unified Task System',
      icon: Target,
      status: 'complete',
      description: 'Task wrapper around Bubble with view-namespaced metadata (P1)',
      demo: 'Live in Task Views tab'
    },
    {
      id: 'multiple-views',
      name: 'Multiple Views',
      icon: BarChart3,
      status: 'complete', 
      description: 'List, Kanban, Matrix views with unified Task backend (P3-P5)',
      demo: 'Task Views showcase'
    },
    {
      id: 'smart-defaults',
      name: 'Smart Defaults',
      icon: Brain,
      status: 'complete',
      description: 'Context-aware task creation with "Because..." explanations (P6)',
      demo: 'Create task with suggestions'
    },
    {
      id: 'planning-mode',
      name: 'Planning Mode',
      icon: Sparkles,
      status: 'complete',
      description: 'MCII-lite implementation intentions in Task cards (P7)',
      demo: 'Toggle planning in task card'
    },
    {
      id: 'auto-write',
      name: 'Auto-Write Integration',
      icon: Calendar,
      status: 'complete',
      description: 'Task-aware calendar/email with safety gates (P12)',
      demo: 'Calendar suggestions in tasks'
    },
    {
      id: 'micro-celebrations',
      name: 'Micro-Celebrations',
      icon: Zap,
      status: 'complete',
      description: 'Brief momentum bursts with cohesion validation (P15)',
      demo: 'Complete tasks to trigger'
    },
    {
      id: 'because-explanations',
      name: '"Because..." Explanations',
      icon: Shield,
      status: 'complete',
      description: 'Transparent AI reasoning for all adaptive actions (P16)',
      demo: 'Click "Because..." buttons'
    },
    {
      id: 'assistant-cohesion',
      name: 'Assistant Cohesion',
      icon: CheckCircle2,
      status: 'complete',
      description: 'Single coherent assistant voice - no persona names (P18)',
      demo: 'Zero persona leakage'
    }
  ];

  const devRoutes = [
    {
      name: 'Context Drift Detection',
      path: '/dev/context-drift',
      description: 'Monitor Context Engine weights with rollback (P8)',
      component: <ContextDrift />
    },
    {
      name: 'Fatigue Budgets',
      path: '/dev/fatigue-budgets', 
      description: 'Per-domain nudge budgets with cognitive load protection (P14)',
      component: <FatigueBudgets />
    },
    {
      name: 'Canary Rollout',
      path: '/dev/canary-rollout',
      description: 'User cohorts with safety gates and emergency rollback (P20)',
      component: <CanaryRollout />
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'default';
      case 'partial': return 'secondary';
      case 'pending': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Add invisible celebrations component */}
      <EnhancedMicroCelebrations />
      
      <div className="p-6 space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold text-on-surface">
              Task Card Implementation Bible
            </h1>
          </div>
          <p className="text-xl text-on-surface-variant max-w-3xl mx-auto">
            Complete P0-P20 implementation: Unified Task system with stealth wellness, 
            assistant cohesion, and comprehensive safety gates
          </p>
          <div className="flex items-center justify-center gap-4">
            <Badge variant="default" className="text-lg px-6 py-2">
              ✅ All Features Complete
            </Badge>
            <Badge variant="outline" className="text-lg px-6 py-2">
              Zero Persona Leakage
            </Badge>
            <Badge variant="secondary" className="text-lg px-6 py-2">
              Production Ready
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="integration">Integration</TabsTrigger>
            <TabsTrigger value="task-views">Task Views</TabsTrigger>
            <TabsTrigger value="dev-routes">Dev Routes</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                  Implementation Complete
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center space-y-2">
                    <div className="text-4xl font-bold text-primary">100%</div>
                    <div className="text-sm text-on-surface-variant">Feature Coverage</div>
                    <div className="text-xs text-muted-foreground">All P0-P20 requirements</div>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="text-4xl font-bold text-primary">✅</div>
                    <div className="text-sm text-on-surface-variant">Cohesion Check</div>
                    <div className="text-xs text-muted-foreground">No persona names in UI</div>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="text-4xl font-bold text-primary">🚀</div>
                    <div className="text-sm text-on-surface-variant">Safety Gates</div>
                    <div className="text-xs text-muted-foreground">Production ready</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {features.map(feature => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {feature.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Badge variant={getStatusColor(feature.status)} className="text-xs">
                        {feature.status}
                      </Badge>
                      <p className="text-sm text-on-surface-variant">
                        {feature.description}
                      </p>
                      <div className="text-xs text-muted-foreground">
                        Demo: {feature.demo}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Key Achievements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm">
                    <strong>Emergency Cohesion Fix:</strong> Eliminated all persona names from UI 
                    (Friend/Coach/Scientist → supportive/motivational/analytical/inspiring)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm">
                    <strong>Unified Task System:</strong> Non-destructive wrapper around Bubble 
                    with view-namespaced metadata for List, Kanban, Matrix
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm">
                    <strong>Transparent AI:</strong> "Because..." explanations for all adaptive 
                    actions with 2-3 driver explanations
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm">
                    <strong>Safety First:</strong> OAuth incremental auth, auto-write gates, 
                    cognitive load protection, canary rollout with emergency rollback
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integration">
            <TaskIntegrationManager />
          </TabsContent>

          <TabsContent value="task-views">
            <TaskViewsShowcase />
          </TabsContent>

          <TabsContent value="dev-routes" className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {devRoutes.map((route, index) => (
                <Card key={route.path}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{route.name}</span>
                      <Badge variant="outline">{route.path}</Badge>
                    </CardTitle>
                    <p className="text-sm text-on-surface-variant">
                      {route.description}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {route.component}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="status">
            <ImplementationBibleStatus />
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Core Architecture</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="text-sm">Task wrapper around existing Bubble system</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="text-sm">View-namespaced metadata (bubble, list, kanban, matrix)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="text-sm">ViewSDK contracts for unified interface</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="text-sm">Universal Task Card editor across all views</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Intelligence Features</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Brain className="h-4 w-4 text-primary" />
                    <span className="text-sm">Smart defaults from context analysis</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm">MCII-lite planning mode</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm">Micro-celebrations with cohesion validation</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm">"Because..." explanations everywhere</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Safety & Monitoring</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Settings className="h-4 w-4 text-primary" />
                    <span className="text-sm">Context drift detection with rollback</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm">Cognitive load governor with fatigue budgets</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span className="text-sm">Canary rollout with user cohorts</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm">E2E validation gates for production</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Integration & Auto-Write</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm">Calendar event creation with green conditions</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-sm">Email draft creation (never auto-send)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Settings className="h-4 w-4 text-primary" />
                    <span className="text-sm">OAuth incremental authorization</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm">Decision traces with full undo support</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">For Users:</h4>
                <div className="space-y-1 text-sm text-on-surface-variant">
                  <div>• Try the Integration tab to enable Task system</div>
                  <div>• Explore different views in Task Views tab</div>
                  <div>• Create tasks with smart suggestions</div>
                  <div>• Test planning mode and celebrations</div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">For Developers:</h4>
                <div className="space-y-1 text-sm text-on-surface-variant">
                  <div>• Check Dev Routes for system monitoring</div>
                  <div>• Review Status tab for E2E validation</div>
                  <div>• Monitor cohesion checks in console</div>
                  <div>• Test canary rollout configurations</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}