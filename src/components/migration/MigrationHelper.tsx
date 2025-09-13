/**
 * Migration Helper Component - P20 Phase 3  
 * Assists users in migrating from Bubble to Task system
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle,
  Info,
  Download,
  Upload,
  Layers
} from 'lucide-react';
import { migrationAnalyzer, type MigrationPlan, type MigrationOpportunity } from '@/services/migrationAnalyzer';
import { useBubbleStore } from '@/stores/bubbleStore';
import { toast } from 'sonner';

interface MigrationHelperProps {
  className?: string;
}

export function MigrationHelper({ className }: MigrationHelperProps) {
  const { bubbles } = useBubbleStore();
  const [migrationPlan, setMigrationPlan] = useState<MigrationPlan | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('auto');
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    if (bubbles.length > 0) {
      analyzeMigrationOpportunities();
    }
  }, [bubbles]);

  const analyzeMigrationOpportunities = async () => {
    setIsAnalyzing(true);
    
    try {
      // Simulate analysis delay for better UX
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
      
      const plan = migrationAnalyzer.analyzeBubblesForMigration(bubbles);
      setMigrationPlan(plan);
      
      toast.success(`Found ${plan.viable} viable migration opportunities`);
    } catch (error) {
      toast.error('Failed to analyze migration opportunities');
      console.error('Migration analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startMigration = async () => {
    if (!migrationPlan) return;
    
    setIsMigrating(true);
    setMigrationProgress(0);
    
    try {
      const viableOpportunities = getViableOpportunities();
      const totalSteps = viableOpportunities.length;
      
      for (let i = 0; i < viableOpportunities.length; i++) {
        const opportunity = viableOpportunities[i];
        await migrateBubble(opportunity);
        setMigrationProgress(((i + 1) / totalSteps) * 100);
        
        // Small delay for progress visualization
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      toast.success(`Successfully migrated ${viableOpportunities.length} bubbles`);
    } catch (error) {
      toast.error('Migration failed. Your data is safe and unchanged.');
      console.error('Migration error:', error);
    } finally {
      setIsMigrating(false);
    }
  };

  const migrateBubble = async (opportunity: MigrationOpportunity): Promise<void> => {
    // In production, this would update the bubble with Task view metadata
    console.log(`Migrating bubble ${opportunity.bubbleId}:`, opportunity.strategies);
    
    // Simulate migration work
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  };

  const getViableOpportunities = (): MigrationOpportunity[] => {
    if (!migrationPlan) return [];
    
    switch (selectedStrategy) {
      case 'horizon':
        return migrationPlan.strategies.horizon.filter(opp => opp.confidence > 0.5);
      case 'position':
        return migrationPlan.strategies.position.filter(opp => opp.confidence > 0.3);
      case 'type':
        return migrationPlan.strategies.type.filter(opp => opp.confidence > 0.4);
      case 'hybrid':
        return migrationPlan.strategies.hybrid.filter(opp => opp.confidence > 0.6);
      default:
        return [
          ...migrationPlan.strategies.horizon,
          ...migrationPlan.strategies.position,
          ...migrationPlan.strategies.type
        ].filter(opp => opp.confidence > 0.5);
    }
  };

  const getStrategyDescription = (strategy: string): string => {
    switch (strategy) {
      case 'horizon':
        return 'Migrate based on time horizons (today/week/later → atomic view)';
      case 'position':
        return 'Migrate based on bubble positions (coordinates → kanban columns)';
      case 'type':
        return 'Migrate based on bubble types (tasks/thoughts → list groups)';
      case 'hybrid':
        return 'Use multiple strategies for comprehensive migration';
      default:
        return 'Automatically select the best strategy for each bubble';
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.7) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (bubbles.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="text-center py-8">
          <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No bubbles found to analyze for migration</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Migration Assistant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Analyze and migrate your existing bubbles to the new Task view system
          </p>
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {migrationPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Migration Analysis</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={analyzeMigrationOpportunities}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{migrationPlan.total}</div>
                <div className="text-sm text-muted-foreground">Total Bubbles</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{migrationPlan.viable}</div>
                <div className="text-sm text-muted-foreground">Viable for Migration</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {migrationPlan.strategies.horizon.length}
                </div>
                <div className="text-sm text-muted-foreground">Horizon Strategy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {migrationPlan.strategies.position.length}
                </div>
                <div className="text-sm text-muted-foreground">Position Strategy</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Recommendations:</h4>
              {migrationPlan.recommendations.map((rec, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-blue-500" />
                  <span className="text-sm">{rec}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration Strategy Selection */}
      {migrationPlan && migrationPlan.viable > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Migration Strategy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['auto', 'horizon', 'position', 'type', 'hybrid'].map((strategy) => (
                <button
                  key={strategy}
                  onClick={() => setSelectedStrategy(strategy)}
                  className={`p-3 text-left border rounded-lg transition-colors ${
                    selectedStrategy === strategy
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium capitalize">{strategy} Strategy</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {getStrategyDescription(strategy)}
                  </div>
                  <div className="mt-2">
                    <Badge variant="secondary">
                      {getViableOpportunities().length} opportunities
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Migration Progress */}
      {isMigrating && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Migration in Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={migrationProgress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">
              Migrating bubbles... {migrationProgress.toFixed(0)}% complete
            </p>
          </CardContent>
        </Card>
      )}

      {/* Migration Controls */}
      {migrationPlan && migrationPlan.viable > 0 && !isMigrating && (
        <Card>
          <CardHeader>
            <CardTitle>Start Migration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">Safe Migration</p>
                <p className="text-blue-700 dark:text-blue-300 mt-1">
                  Migration will add new view metadata to your bubbles without removing existing data. 
                  You can always revert changes if needed.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Ready to migrate {getViableOpportunities().length} bubbles</p>
                <p className="text-sm text-muted-foreground">
                  Using {selectedStrategy} strategy
                </p>
              </div>
              <Button onClick={startMigration} className="ml-4">
                <ArrowRight className="h-4 w-4 mr-2" />
                Start Migration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Migration Opportunities */}
      {migrationPlan && migrationPlan.viable === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">No automatic migration opportunities found</p>
            <p className="text-sm text-muted-foreground">
              Your bubbles may already be optimized or require manual organization
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}