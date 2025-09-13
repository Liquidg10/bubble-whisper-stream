/**
 * Dev Production Dashboard - P20 Phase 3
 * Central hub for production monitoring and deployment
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeploymentDashboard } from '@/components/production/DeploymentDashboard';
import { MigrationHelper } from '@/components/migration/MigrationHelper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  Database, 
  Activity, 
  Shield,
  Gauge,
  Users,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { isFeatureEnabled } from '@/config/flags';
import { telemetryService } from '@/services/telemetryService';
import { productionActivationManager } from '@/utils/productionActivation';
import { useToast } from '@/hooks/use-toast';

export default function DevProductionDashboard() {
  const [isActivating, setIsActivating] = React.useState(false);
  const [activationResults, setActivationResults] = React.useState<any[]>([]);
  const { toast } = useToast();
  
  const activationStatus = productionActivationManager.getActivationStatus();
  const { isReady, readinessScore, enabledFlags, totalFlags } = activationStatus;

  const handleActivateProduction = async () => {
    setIsActivating(true);
    try {
      const results = await productionActivationManager.executeActivationSequence();
      setActivationResults(results);
      
      const allSuccessful = results.every(r => r.success);
      toast({
        title: allSuccessful ? "Production Activated" : "Activation Issues",
        description: allSuccessful 
          ? "All production systems are now active" 
          : "Some activation steps failed - check results",
        variant: allSuccessful ? "default" : "destructive"
      });
    } catch (error) {
      toast({
        title: "Activation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Dashboard</h1>
          <p className="text-muted-foreground">P20 Phase 3 - Production Rollout Control</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={isReady ? 'default' : 'destructive'} className="px-3 py-1">
            {isReady ? (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Production Ready
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 mr-1" />
                Not Ready
              </>
            )}
          </Badge>
          <Button 
            onClick={handleActivateProduction} 
            disabled={isActivating || isReady}
            size="sm"
          >
            {isActivating ? 'Activating...' : isReady ? 'Activated' : 'Activate Production'}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Gauge className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Readiness Score</p>
                <p className="text-2xl font-bold">{(readinessScore * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Feature Flags</p>
                <p className="text-2xl font-bold">{enabledFlags}/{totalFlags}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">System Health</p>
                <p className="text-2xl font-bold">Stable</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard */}
      <Tabs defaultValue="deployment" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="deployment" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Deployment
          </TabsTrigger>
          <TabsTrigger value="migration" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Migration
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Validation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deployment">
          <DeploymentDashboard />
        </TabsContent>

        <TabsContent value="migration">
          <MigrationHelper />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Monitoring
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Performance Metrics</h4>
                  <div className="text-sm text-muted-foreground">
                    <p>FPS Target: ≥55 FPS</p>
                    <p>Memory Usage: &lt;100MB</p>
                    <p>Response Time: &lt;200ms</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Error Tracking</h4>
                  <div className="text-sm text-muted-foreground">
                    <p>Error Rate: 0.01%</p>
                    <p>Crash Rate: 0.00%</p>
                    <p>User Satisfaction: 85%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Production Activation Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activationResults.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Run production activation to see detailed results
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activationResults.map((result, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        {result.success ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        )}
                        <h4 className="font-medium">{result.phase}</h4>
                        <Badge variant={result.success ? 'default' : 'destructive'}>
                          {result.success ? 'PASS' : 'FAIL'}
                        </Badge>
                      </div>
                      
                      {result.details.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {result.details.map((detail, idx) => (
                            <p key={idx} className="text-sm text-muted-foreground">
                              {detail}
                            </p>
                          ))}
                        </div>
                      )}
                      
                      {result.errors.length > 0 && (
                        <div className="space-y-1">
                          {result.errors.map((error, idx) => (
                            <p key={idx} className="text-sm text-red-600">
                              ❌ {error}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}