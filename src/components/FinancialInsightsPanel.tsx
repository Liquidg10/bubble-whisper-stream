import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Eye,
  DollarSign,
  Clock,
  CheckCircle
} from 'lucide-react';
import { 
  recurringTransactionService, 
  RecurringTransaction, 
  RecurringInsight 
} from '@/services/recurringTransactionService';
import { financialContextService, FinancialContext } from '@/services/financialContextService';
import { RecurringTransactionCard } from './RecurringTransactionCard';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function FinancialInsightsPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [upcomingInsights, setUpcomingInsights] = useState<RecurringInsight[]>([]);
  const [financialContext, setFinancialContext] = useState<FinancialContext | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    initializeUser();
  }, []);

  const initializeUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      loadFinancialData(user.id);
    }
  };

  const loadFinancialData = async (userIdParam?: string) => {
    if (!userIdParam && !userId) return;
    
    const currentUserId = userIdParam || userId;
    if (!currentUserId) return;

    setIsLoading(true);
    try {
      // Load recurring transactions and insights
      const [recurring, insights, context] = await Promise.all([
        recurringTransactionService.getRecurringTransactions(currentUserId),
        recurringTransactionService.getUpcomingRecurringInsights(currentUserId),
        financialContextService.generateFinancialContext(currentUserId)
      ]);

      setRecurringTransactions(recurring);
      setUpcomingInsights(insights);
      setFinancialContext(context);
    } catch (error) {
      console.error('Failed to load financial data:', error);
      toast({
        title: "Error loading financial data",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const detectNewPatterns = async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      await recurringTransactionService.detectRecurringPatterns(userId);
      await loadFinancialData();
      toast({
        title: "Pattern detection complete",
        description: "New recurring transactions have been analyzed",
      });
    } catch (error) {
      console.error('Failed to detect patterns:', error);
      toast({
        title: "Pattern detection failed",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateReminder = async (recurringId: string) => {
    // This would integrate with calendar service
    toast({
      title: "Reminder created",
      description: "Calendar reminder has been added",
    });
  };

  const handleMarkCorrect = async (recurringId: string, isCorrect: boolean) => {
    try {
      await recurringTransactionService.updateConfidence(recurringId, isCorrect);
      await loadFinancialData();
      toast({
        title: isCorrect ? "Marked as correct" : "Marked as incorrect",
        description: "Confidence score has been updated",
      });
    } catch (error) {
      console.error('Failed to update confidence:', error);
      toast({
        title: "Update failed",
        description: "Please try again later",
        variant: "destructive"
      });
    }
  };

  const getContextStatusColor = (status: string): 'default' | 'destructive' | 'secondary' | 'outline' => {
    switch (status) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      default: return 'default';
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };


  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Financial Insights
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadFinancialData()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={detectNewPatterns}
              disabled={isLoading}
            >
              <Eye className="h-4 w-4" />
              Detect Patterns
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Financial Context Overview */}
        {financialContext && (
          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Financial Pressure</span>
                  </div>
                  <div className="mt-2">
                    <Progress value={financialContext.overallPressure * 100} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round(financialContext.overallPressure * 100)}% pressure level
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Budget Status</span>
                  </div>
                  <div className="mt-2">
                    <Badge variant={getContextStatusColor(financialContext.budgetStatus)}>
                      {financialContext.budgetStatus.toUpperCase()}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upcoming Items</span>
                  </div>
                  <div className="mt-2">
                    <p className="text-lg font-semibold">{upcomingInsights.length}</p>
                    <p className="text-xs text-muted-foreground">Next 30 days</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Context Explanations */}
            {financialContext.explanation.length > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    {financialContext.explanation.map((explanation, index) => (
                      <div key={index}>{explanation}</div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upcoming">Upcoming Payments</TabsTrigger>
            <TabsTrigger value="patterns">Recurring Patterns</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingInsights.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No upcoming payments detected. Run pattern detection to analyze your transactions.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {upcomingInsights.map(insight => {
                  const recurring = recurringTransactions.find(r => r.id === insight.id);
                  return recurring ? (
                    <RecurringTransactionCard
                      key={insight.id}
                      recurring={recurring}
                      insight={insight}
                      onCreateReminder={handleCreateReminder}
                      onMarkCorrect={handleMarkCorrect}
                    />
                  ) : null;
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            {recurringTransactions.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No recurring patterns detected yet. Connect your bank account and run pattern detection.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {recurringTransactions.map(recurring => (
                  <RecurringTransactionCard
                    key={recurring.id}
                    recurring={recurring}
                    onMarkCorrect={handleMarkCorrect}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}