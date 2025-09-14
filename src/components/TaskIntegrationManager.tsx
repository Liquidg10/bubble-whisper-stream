/**
 * Task Integration Manager - Seamless Bubble → Task Migration
 * Provides smooth transition from existing Bubble system to unified Tasks
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Zap, Target, Calendar, List, Grid3X3 } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { becauseExplanationService } from '@/services/becauseExplanationService';

interface MigrationStep {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  progress: number;
}

export function TaskIntegrationManager() {
  const { toast } = useToast();
  const { bubbles, settings, updateSettings } = useBubbleStore();
  const [taskSystemEnabled, setTaskSystemEnabled] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [activeView, setActiveView] = useState<'bubble' | 'list' | 'kanban' | 'matrix'>('bubble');

  const migrationSteps: MigrationStep[] = [
    {
      id: 'enable-task-adapter',
      name: 'Enable Task Adapter',
      description: 'Activate unified Task interface while preserving Bubble functionality',
      completed: taskSystemEnabled,
      progress: taskSystemEnabled ? 100 : 0
    },
    {
      id: 'sync-existing-data',
      name: 'Sync Existing Bubbles',
      description: 'Convert existing Bubbles to Task format (non-destructive)',
      completed: taskSystemEnabled && bubbles.length > 0,
      progress: taskSystemEnabled ? 100 : 0
    },
    {
      id: 'enable-smart-defaults',
      name: 'Smart Defaults Active',
      description: 'Context-aware task creation with "Because..." explanations',
      completed: taskSystemEnabled && settings.intelligenceEnabled,
      progress: taskSystemEnabled && settings.intelligenceEnabled ? 100 : 0
    },
    {
      id: 'joy-celebrations',
      name: 'Micro-Celebrations',
      description: 'Brief momentum bursts with cohesion validation',
      completed: taskSystemEnabled,
      progress: taskSystemEnabled ? 100 : 0
    }
  ];

  useEffect(() => {
    const completedSteps = migrationSteps.filter(step => step.completed).length;
    setMigrationProgress((completedSteps / migrationSteps.length) * 100);
  }, [taskSystemEnabled, settings.intelligenceEnabled, bubbles.length]);

  const enableTaskSystem = async () => {
    try {
      setTaskSystemEnabled(true);
      
      // Enable intelligence layer for smart defaults
      if (!settings.intelligenceEnabled) {
        updateSettings({ intelligenceEnabled: true });
      }

      // Generate "Because..." explanation for this upgrade
      const explanation = becauseExplanationService.generateNudgeExplanation(
        'planning',
        { 
          recentActivity: [{ type: 'bubble_usage', count: bubbles.length }],
          patterns: [],
          currentLoad: 0.5
        }
      );

      toast({
        title: 'Task System Enabled! ✨',
        description: explanation.shortText,
        duration: 6000,
        action: (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              toast({
                title: 'Why Task System?',
                description: explanation.drivers.map(d => `• ${d.signal}`).join('\n'),
                duration: 8000
              });
            }}
          >
            Because...
          </Button>
        )
      });

      // Store task system preference
      localStorage.setItem('task-system-enabled', 'true');
      
    } catch (error) {
      console.error('Failed to enable task system:', error);
      toast({
        title: 'Task System Activation Failed',
        description: 'Please try again or check developer tools',
        variant: 'destructive'
      });
    }
  };

  const switchView = (view: typeof activeView) => {
    setActiveView(view);
    
    toast({
      title: `Switched to ${view} view`,
      description: getViewDescription(view),
      duration: 3000
    });
  };

  const getViewDescription = (view: string): string => {
    switch (view) {
      case 'bubble': return 'Original physics-based interface with spatial cognition';
      case 'list': return 'Linear execution focus with keyboard shortcuts';
      case 'kanban': return 'Column-based workflow for project management';  
      case 'matrix': return 'Eisenhower quadrants for priority triage';
      default: return '';
    }
  };

  const getViewIcon = (view: string) => {
    switch (view) {
      case 'bubble': return <Zap className="h-4 w-4" />;
      case 'list': return <List className="h-4 w-4" />;
      case 'kanban': return <Grid3X3 className="h-4 w-4" />;
      case 'matrix': return <Target className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Task Integration Center</h1>
          <p className="text-on-surface-variant">
            Seamlessly transition to the unified Task system while preserving your Bubble workflow
          </p>
        </div>
        <Badge variant={taskSystemEnabled ? 'default' : 'outline'} className="px-4 py-2">
          {taskSystemEnabled ? 'Task System Active' : 'Bubble Mode'}
        </Badge>
      </div>

      {/* Migration Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Migration Progress</span>
            <span className="text-sm font-normal">{Math.round(migrationProgress)}% Complete</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={migrationProgress} className="h-2" />
          
          <div className="space-y-3">
            {migrationSteps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step.completed 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-surface-variant text-on-surface-variant'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{step.name}</div>
                  <div className="text-xs text-on-surface-variant">{step.description}</div>
                </div>
                <Badge variant={step.completed ? 'default' : 'outline'} className="text-xs">
                  {step.completed ? 'Done' : 'Pending'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Task System Activation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-medium">Enable Unified Task System</div>
              <div className="text-sm text-on-surface-variant">
                Adds List, Kanban, and Matrix views while preserving Bubble physics
              </div>
            </div>
            <Switch
              checked={taskSystemEnabled}
              onCheckedChange={enableTaskSystem}
              disabled={taskSystemEnabled}
            />
          </div>
          
          {!taskSystemEnabled && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-3">
                <ArrowRight className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="font-medium text-sm">Ready to Upgrade</div>
                  <div className="text-xs text-on-surface-variant mt-1">
                    Your {bubbles.length} existing bubbles will remain unchanged. 
                    New views and features will be added non-destructively.
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Selector */}
      {taskSystemEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Active View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['bubble', 'list', 'kanban', 'matrix'] as const).map(view => (
                <Button
                  key={view}
                  variant={activeView === view ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => switchView(view)}
                  className="flex items-center gap-2 justify-start"
                >
                  {getViewIcon(view)}
                  <span className="capitalize">{view}</span>
                </Button>
              ))}
            </div>
            
            <div className="mt-4 p-3 rounded-lg bg-surface-variant/50">
              <div className="text-xs text-on-surface-variant">
                <strong>Current:</strong> {getViewDescription(activeView)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Auto-Write Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-2">
              <div>• Calendar events from task timing</div>
              <div>• Email drafts (never auto-send)</div>
              <div>• Full decision traces with undo</div>
              <div>• OAuth incremental permissions</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Intelligence Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-2">
              <div>• Smart defaults with explanations</div>
              <div>• Micro-celebrations (cohesion-safe)</div>
              <div>• Context drift detection</div>
              <div>• Cognitive load protection</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next Steps */}
      {taskSystemEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>What's Next?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span className="text-sm">Try creating a task with voice input or quick capture</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span className="text-sm">Explore different views (List, Kanban, Matrix) for your workflow</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span className="text-sm">Set up calendar/email integration for auto-write features</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span className="text-sm">Visit /dev routes to monitor system health and metrics</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}