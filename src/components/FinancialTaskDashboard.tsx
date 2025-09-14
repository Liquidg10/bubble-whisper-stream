/**
 * Financial Task Dashboard - Unified financial task management experience
 * Shows financial-related tasks, insights, and action items
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign,
  Receipt,
  AlertTriangle,
  TrendingUp,
  Calendar,
  PiggyBank,
  CreditCard,
  Target,
  Plus,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled } from '@/config/flags';
import { financialTaskCreationService } from '@/services/financialTaskCreationService';
import { budgetService } from '@/services/budgetService';
import { financialContextService } from '@/services/financialContextService';
import { recurringTransactionService } from '@/services/recurringTransactionService';
import { enhancedReceiptService } from '@/services/enhancedReceiptService';
import type { Task } from '@/types/task';
import type { ReceiptData } from '@/services/enhancedReceiptService';
import type { BudgetPaceAlert } from '@/services/budgetService';
import type { FinancialContext } from '@/services/financialContextService';

interface FinancialTaskDashboardProps {
  className?: string;
}

export function FinancialTaskDashboard({ className }: FinancialTaskDashboardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [financialTasks, setFinancialTasks] = useState<Task[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetPaceAlert[]>([]);
  const [financialContext, setFinancialContext] = useState<FinancialContext | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<ReceiptData[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (isFeatureEnabled('budget')) {
      loadFinancialData();
    }
  }, []);

  const loadFinancialData = async () => {
    setIsLoading(true);
    try {
      // Load budget alerts
      const alerts = await budgetService.getPaceAlerts();
      setBudgetAlerts(alerts);

      // Load financial context
      const context = await financialContextService.generateFinancialContext('user-id');
      setFinancialContext(context);

      // Load existing financial tasks (would integrate with task management system)
      // For now, simulate some tasks
      setFinancialTasks([]);

    } catch (error) {
      console.error('Failed to load financial data:', error);
      toast({
        title: "Failed to load financial data",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTasksFromReceipt = async (file: File) => {
    if (!file) return;

    try {
      setIsLoading(true);
      const receiptData = await enhancedReceiptService.processReceipt(file);
      const tasks = await financialTaskCreationService.createTasksFromReceipt(receiptData);
      
      setFinancialTasks(prev => [...prev, ...tasks]);
      setRecentReceipts(prev => [receiptData, ...prev.slice(0, 4)]);
      
      toast({
        title: "Receipt processed",
        description: `Created ${tasks.length} task${tasks.length !== 1 ? 's' : ''} from receipt`
      });
    } catch (error) {
      console.error('Receipt processing failed:', error);
      toast({
        title: "Receipt processing failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBudgetTasks = async () => {
    if (!budgetAlerts.length) return;

    try {
      const tasks = await financialTaskCreationService.createTasksFromBudgetAlerts(budgetAlerts);
      setFinancialTasks(prev => [...prev, ...tasks]);
      
      toast({
        title: "Budget tasks created",
        description: `Created ${tasks.length} task${tasks.length !== 1 ? 's' : ''} from budget alerts`
      });
    } catch (error) {
      console.error('Failed to create budget tasks:', error);
      toast({
        title: "Failed to create budget tasks",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleCreateContextTasks = async () => {
    if (!financialContext) return;

    try {
      const tasks = await financialTaskCreationService.createTasksFromFinancialContext(financialContext);
      setFinancialTasks(prev => [...prev, ...tasks]);
      
      toast({
        title: "Financial planning tasks created",
        description: `Created ${tasks.length} task${tasks.length !== 1 ? 's' : ''} from financial analysis`
      });
    } catch (error) {
      console.error('Failed to create context tasks:', error);
      toast({
        title: "Failed to create planning tasks",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      case 'healthy': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 80) return <Badge variant="destructive">Critical</Badge>;
    if (priority >= 60) return <Badge variant="secondary">High</Badge>;
    if (priority >= 40) return <Badge variant="outline">Medium</Badge>;
    return <Badge variant="secondary">Low</Badge>;
  };

  if (!isFeatureEnabled('budget')) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Budget features are not enabled. Enable them in settings to use financial task management.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Financial Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financial Task Management
              <Button
                variant="outline"
                size="sm"
                onClick={loadFinancialData}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Financial Status */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Financial Status</p>
                      <p className={`text-lg font-bold ${getStatusColor(financialContext?.budgetStatus || 'unknown')}`}>
                        {financialContext?.budgetStatus || 'Loading...'}
                      </p>
                    </div>
                    <PiggyBank className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* Active Tasks */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Financial Tasks</p>
                      <p className="text-lg font-bold">{financialTasks.length}</p>
                    </div>
                    <Target className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* Budget Alerts */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Budget Alerts</p>
                      <p className="text-lg font-bold text-yellow-600">{budgetAlerts.length}</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tasks">Financial Tasks</TabsTrigger>
            <TabsTrigger value="receipts">Receipt Processing</TabsTrigger>
            <TabsTrigger value="budget">Budget Alerts</TabsTrigger>
            <TabsTrigger value="insights">Smart Insights</TabsTrigger>
          </TabsList>

          {/* Financial Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Financial Tasks</h3>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCreateBudgetTasks}
                  disabled={!budgetAlerts.length}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  From Budget Alerts
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCreateContextTasks}
                  disabled={!financialContext}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  From Analysis
                </Button>
              </div>
            </div>

            {financialTasks.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No financial tasks yet. Process receipts or create tasks from budget alerts to get started.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {financialTasks.map((task) => (
                  <Card key={task.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium">{task.title}</h4>
                            {getPriorityBadge(task.priority)}
                            <Badge variant="outline">
                              finance
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {task.metadata?.finance?.amount && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                ${task.metadata.finance.amount.toFixed(2)}
                              </span>
                            )}
                            {task.due && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(task.due).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                          <Button variant="default" size="sm">
                            Complete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Receipt Processing Tab */}
          <TabsContent value="receipts" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Receipt Processing</h3>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCreateTasksFromReceipt(file);
                }}
                className="hidden"
                id="receipt-upload"
              />
              <Button asChild>
                <label htmlFor="receipt-upload" className="cursor-pointer">
                  <Receipt className="h-4 w-4 mr-2" />
                  Upload Receipt
                </label>
              </Button>
            </div>

            {recentReceipts.length === 0 ? (
              <Alert>
                <Receipt className="h-4 w-4" />
                <AlertDescription>
                  No receipts processed yet. Upload a receipt to automatically create financial tasks.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentReceipts.map((receipt) => (
                  <Card key={receipt.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{receipt.merchant.name}</h4>
                          <p className="text-lg font-bold text-green-600">
                            ${receipt.totals.total.toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {receipt.categories.primary} • {receipt.lineItems.length} items
                          </p>
                        </div>
                        <Badge variant="outline">
                          {Math.round(receipt.categories.confidence * 100)}% confidence
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Budget Alerts Tab */}
          <TabsContent value="budget" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Budget Alerts</h3>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCreateBudgetTasks}
                disabled={!budgetAlerts.length}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Tasks
              </Button>
            </div>

            {budgetAlerts.length === 0 ? (
              <Alert>
                <PiggyBank className="h-4 w-4" />
                <AlertDescription>
                  No budget alerts. Your spending is on track!
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {budgetAlerts.map((alert, index) => (
                  <Alert key={index} variant={alert.severity === 'high' ? 'destructive' : 'default'}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{alert.envelopeName}</strong>: {alert.message}
                        <Progress 
                          value={alert.percentSpent} 
                          className="mt-2"
                        />
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Smart Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Smart Financial Insights</h3>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCreateContextTasks}
                disabled={!financialContext}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Planning Tasks
              </Button>
            </div>

            {financialContext ? (
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium">Financial Pressure</h4>
                      <Badge variant={financialContext.overallPressure > 0.7 ? 'destructive' : 'secondary'}>
                        {Math.round(financialContext.overallPressure * 100)}%
                      </Badge>
                    </div>
                    <Progress value={financialContext.overallPressure * 100} className="mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Based on upcoming payments, budget status, and spending patterns
                    </p>
                  </CardContent>
                </Card>

                    {financialContext.explanation && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Key Insights</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm flex items-start gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            {financialContext.explanation}
                          </div>
                        </CardContent>
                      </Card>
                    )}
              </div>
            ) : (
              <Alert>
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  Connect your bank accounts to enable smart financial insights and automated task creation.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}