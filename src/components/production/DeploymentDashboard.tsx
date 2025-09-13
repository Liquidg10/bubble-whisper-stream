/**
 * Deployment Dashboard - P20 Phase 3
 * Production rollout monitoring and control
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  SkipForward, 
  RotateCcw, 
  Activity, 
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Users
} from 'lucide-react';
import { productionPipelineService } from '@/services/productionPipeline';
import { telemetryService } from '@/services/telemetryService';
import { taskCanaryService } from '@/services/taskCanaryService';

interface DeploymentDashboardProps {
  className?: string;
}

export function DeploymentDashboard({ className }: DeploymentDashboardProps) {
  const [deployments, setDeployments] = useState<Record<string, any>>({});
  const [metrics, setMetrics] = useState<any>(null);
  const [canaryStats, setCanaryStats] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>('main');

  useEffect(() => {
    const updateData = () => {
      setDeployments(productionPipelineService.getAllDeployments());
      setMetrics(telemetryService.calculateStabilityMetrics());
      setCanaryStats(taskCanaryService.getCanaryStats());
    };

    updateData();
    const interval = setInterval(updateData, 10000); // Update every 10s

    return () => clearInterval(interval);
  }, []);

  const currentDeployment = deployments[selectedPlan];
  const readinessScore = telemetryService.getProductionReadinessScore();

  const handleCreatePlan = () => {
    productionPipelineService.createDeploymentPlan('main');
    setDeployments(productionPipelineService.getAllDeployments());
  };

  const handleStartDeployment = async () => {
    if (currentDeployment) {
      await productionPipelineService.startDeployment(selectedPlan);
      setDeployments(productionPipelineService.getAllDeployments());
    }
  };

  const handleAdvanceStage = async () => {
    if (currentDeployment) {
      await productionPipelineService.advanceStage(selectedPlan);
      setDeployments(productionPipelineService.getAllDeployments());
    }
  };

  const handleRollback = async () => {
    if (currentDeployment) {
      await productionPipelineService.rollbackDeployment(selectedPlan, 'Manual rollback');
      setDeployments(productionPipelineService.getAllDeployments());
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      case 'rolled_back': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Activity className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'paused': return <Pause className="h-4 w-4" />;
      case 'failed': return <AlertTriangle className="h-4 w-4" />;
      case 'rolled_back': return <RotateCcw className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (!currentDeployment) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Production Deployment Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground mb-4">No deployment plan found</p>
            <Button onClick={handleCreatePlan}>
              Create Deployment Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Production Deployment Dashboard
            </div>
            <Badge className={`${getStatusColor(currentDeployment.status)} text-white`}>
              {getStatusIcon(currentDeployment.status)}
              <span className="ml-1 capitalize">{currentDeployment.status}</span>
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deployment Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Deployment Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentDeployment.stages.map((stage: any, index: number) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{stage.name}</span>
                  <Badge variant={index <= currentDeployment.currentStage ? 'default' : 'secondary'}>
                    {stage.percentage}%
                  </Badge>
                </div>
                <Progress 
                  value={index <= currentDeployment.currentStage ? 100 : 0}
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {(readinessScore * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Readiness Score</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {metrics ? (metrics.errorRate * 100).toFixed(2) : '0.00'}%
                </div>
                <div className="text-sm text-muted-foreground">Error Rate</div>
              </div>
            </div>
            
            {metrics && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Performance</span>
                  <span className="text-sm">{(metrics.performanceScore * 100).toFixed(1)}%</span>
                </div>
                <Progress value={metrics.performanceScore * 100} />
                
                <div className="flex justify-between">
                  <span className="text-sm">User Satisfaction</span>
                  <span className="text-sm">{(metrics.userSatisfaction * 100).toFixed(1)}%</span>
                </div>
                <Progress value={metrics.userSatisfaction * 100} />
                
                <div className="flex justify-between">
                  <span className="text-sm">Completion Rate</span>
                  <span className="text-sm">{(metrics.completionRate * 100).toFixed(1)}%</span>
                </div>
                <Progress value={metrics.completionRate * 100} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Canary Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Canary Rollout
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canaryStats ? (
              <>
                <div className="text-center">
                  <div className="text-lg font-semibold">
                    Phase {canaryStats.currentPhase || 'Planning'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {canaryStats.activeUsers || 0} active users
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Stability Score</span>
                    <span className="text-sm">{(canaryStats.stabilityScore * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={canaryStats.stabilityScore * 100} />
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground">
                Canary not active
              </div>
            )}
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Deployment Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {currentDeployment.status === 'planning' && (
                <Button onClick={handleStartDeployment} className="w-full">
                  <Play className="h-4 w-4 mr-2" />
                  Start Deployment
                </Button>
              )}
              
              {currentDeployment.status === 'paused' && (
                <Button onClick={handleAdvanceStage} className="w-full">
                  <SkipForward className="h-4 w-4 mr-2" />
                  Advance Stage
                </Button>
              )}
              
              {['active', 'paused'].includes(currentDeployment.status) && (
                <Button onClick={handleRollback} variant="destructive" className="w-full">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Rollback
                </Button>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground">
              Current Stage: {currentDeployment.stages[currentDeployment.currentStage]?.name || 'Not Started'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}