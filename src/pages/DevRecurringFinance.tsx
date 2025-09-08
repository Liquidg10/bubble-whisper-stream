import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play,
  Database,
  TrendingUp,
  Calendar,
  Settings,
  RefreshCw,
  TestTube
} from 'lucide-react';
import { FinancialInsightsPanel } from '@/components/FinancialInsightsPanel';
import { recurringTransactionService } from '@/services/recurringTransactionService';
import { financialContextService } from '@/services/financialContextService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function DevRecurringFinance() {
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    initializeUser();
  }, []);

  const initializeUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
    }
  };

  const generateMockTransactions = async () => {
    if (!userId) {
      toast({
        title: "Please sign in",
        description: "User authentication required for testing",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // Generate mock recurring transactions for testing
      const mockTransactions = [
        // Netflix - Monthly subscription
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_netflix_1',
          name: 'NETFLIX.COM',
          merchant_name: 'Netflix',
          amount: 15.99,
          date: '2024-01-15',
          category: ['Entertainment', 'Subscription'],
          plaid_item_id: 'test_item_1'
        },
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_netflix_2',
          name: 'NETFLIX.COM',
          merchant_name: 'Netflix',
          amount: 15.99,
          date: '2024-02-15',
          category: ['Entertainment', 'Subscription'],
          plaid_item_id: 'test_item_1'
        },
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_netflix_3',
          name: 'NETFLIX.COM',
          merchant_name: 'Netflix',
          amount: 15.99,
          date: '2024-03-15',
          category: ['Entertainment', 'Subscription'],
          plaid_item_id: 'test_item_1'
        },
        // Rent - Monthly
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_rent_1',
          name: 'PROPERTY MANAGEMENT LLC',
          merchant_name: 'Property Management',
          amount: 1200,
          date: '2024-01-01',
          category: ['Housing'],
          plaid_item_id: 'test_item_1'
        },
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_rent_2',
          name: 'PROPERTY MANAGEMENT LLC',
          merchant_name: 'Property Management',
          amount: 1200,
          date: '2024-02-01',
          category: ['Housing'],
          plaid_item_id: 'test_item_1'
        },
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_rent_3',
          name: 'PROPERTY MANAGEMENT LLC',
          merchant_name: 'Property Management',
          amount: 1200,
          date: '2024-03-01',
          category: ['Housing'],
          plaid_item_id: 'test_item_1'
        },
        // Spotify - Monthly with slight variation
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_spotify_1',
          name: 'SPOTIFY PREMIUM',
          merchant_name: 'Spotify',
          amount: 9.99,
          date: '2024-01-10',
          category: ['Entertainment', 'Music'],
          plaid_item_id: 'test_item_1'
        },
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_spotify_2',
          name: 'SPOTIFY PREMIUM',
          merchant_name: 'Spotify',
          amount: 10.99, // Price change
          date: '2024-02-10',
          category: ['Entertainment', 'Music'],
          plaid_item_id: 'test_item_1'
        },
        {
          user_id: userId,
          account_id: 'test_account_1',
          transaction_id: 'mock_spotify_3',
          name: 'SPOTIFY PREMIUM',
          merchant_name: 'Spotify',
          amount: 10.99,
          date: '2024-03-10',
          category: ['Entertainment', 'Music'],
          plaid_item_id: 'test_item_1'
        }
      ];

      // Insert mock transactions
      const { error } = await supabase
        .from('plaid_transactions')
        .upsert(mockTransactions, { onConflict: 'transaction_id' });

      if (error) throw error;

      toast({
        title: "Mock data generated",
        description: "Test transactions have been created",
      });
    } catch (error) {
      console.error('Failed to generate mock data:', error);
      toast({
        title: "Mock data generation failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runPatternDetection = async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      await recurringTransactionService.detectRecurringPatterns(userId);
      
      // Get results for display
      const [recurring, insights, context] = await Promise.all([
        recurringTransactionService.getRecurringTransactions(userId),
        recurringTransactionService.getUpcomingRecurringInsights(userId),
        financialContextService.generateFinancialContext(userId)
      ]);

      setTestResults({
        recurringCount: recurring.length,
        insightsCount: insights.length,
        overallPressure: context.overallPressure,
        budgetStatus: context.budgetStatus,
        detectedPatterns: recurring.map(r => ({
          merchant: r.normalized_merchant,
          amount: r.amount_average,
          frequency: r.frequency_days,
          confidence: r.confidence_score
        }))
      });

      toast({
        title: "Pattern detection complete",
        description: `Found ${recurring.length} recurring patterns`,
      });
    } catch (error) {
      console.error('Pattern detection failed:', error);
      toast({
        title: "Pattern detection failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testCalendarSuggestions = async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const suggestions = await financialContextService.generateCalendarSuggestions(userId);
      
      setTestResults({
        ...testResults,
        calendarSuggestions: suggestions.length,
        suggestions: suggestions.slice(0, 5).map(s => ({
          title: s.title,
          date: s.start_time,
          type: s.type,
          confidence: s.confidence
        }))
      });

      toast({
        title: "Calendar suggestions generated",
        description: `Created ${suggestions.length} calendar suggestions`,
      });
    } catch (error) {
      console.error('Calendar suggestion failed:', error);
      toast({
        title: "Calendar suggestion failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearTestData = async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      // Delete test transactions and recurring patterns
      await Promise.all([
        supabase.from('plaid_transactions').delete().eq('user_id', userId).like('transaction_id', 'mock_%'),
        supabase.from('recurring_transactions').delete().eq('user_id', userId)
      ]);

      setTestResults(null);
      toast({
        title: "Test data cleared",
        description: "All test data has been removed",
      });
    } catch (error) {
      console.error('Failed to clear test data:', error);
      toast({
        title: "Clear failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Recurring Finance Development</h1>
        <p className="text-muted-foreground">
          Test and develop recurring transaction detection and financial context features
        </p>
      </div>

      <Tabs defaultValue="testing" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="testing">Testing Controls</TabsTrigger>
          <TabsTrigger value="insights">Live Insights</TabsTrigger>
          <TabsTrigger value="results">Test Results</TabsTrigger>
        </TabsList>

        <TabsContent value="testing" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mock Data Generation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Mock Data Generation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate test transactions for Netflix, Spotify, and rent payments to test pattern detection.
                </p>
                <Button
                  onClick={generateMockTransactions}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Generate Mock Transactions
                </Button>
              </CardContent>
            </Card>

            {/* Pattern Detection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Pattern Detection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Run the recurring transaction detection algorithm on available transaction data.
                </p>
                <Button
                  onClick={runPatternDetection}
                  disabled={isLoading}
                  className="w-full"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Detect Patterns
                </Button>
              </CardContent>
            </Card>

            {/* Calendar Integration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Calendar Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate calendar event suggestions based on recurring payment patterns.
                </p>
                <Button
                  onClick={testCalendarSuggestions}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Generate Suggestions
                </Button>
              </CardContent>
            </Card>

            {/* Cleanup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Data Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Clear all test data and recurring transaction patterns.
                </p>
                <Button
                  onClick={clearTestData}
                  disabled={isLoading}
                  variant="destructive"
                  className="w-full"
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  Clear Test Data
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="insights">
          <FinancialInsightsPanel />
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {testResults ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Test Results Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{testResults.recurringCount}</p>
                      <p className="text-sm text-muted-foreground">Recurring Patterns</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{testResults.insightsCount}</p>
                      <p className="text-sm text-muted-foreground">Upcoming Insights</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">
                        {Math.round(testResults.overallPressure * 100)}%
                      </p>
                      <p className="text-sm text-muted-foreground">Financial Pressure</p>
                    </div>
                    <div className="text-center">
                      <Badge variant={testResults.budgetStatus === 'healthy' ? 'default' : 'destructive'}>
                        {testResults.budgetStatus.toUpperCase()}
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">Budget Status</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {testResults.detectedPatterns && (
                <Card>
                  <CardHeader>
                    <CardTitle>Detected Patterns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {testResults.detectedPatterns.map((pattern: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-2 border rounded">
                          <div>
                            <span className="font-medium">{pattern.merchant}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              Every {pattern.frequency} days
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">${pattern.amount.toFixed(2)}</div>
                            <div className="text-sm text-muted-foreground">
                              {Math.round(pattern.confidence * 100)}% confidence
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {testResults.suggestions && (
                <Card>
                  <CardHeader>
                    <CardTitle>Calendar Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {testResults.suggestions.map((suggestion: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-2 border rounded">
                          <div>
                            <span className="font-medium">{suggestion.title}</span>
                            <div className="text-sm text-muted-foreground">
                              {new Date(suggestion.date).toLocaleDateString()}
                            </div>
                          </div>
                          <Badge variant="outline">{suggestion.type}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                No test results available. Run the testing procedures to see results.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}