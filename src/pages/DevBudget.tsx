import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Receipt } from 'lucide-react';
import { budgetService, BudgetEnvelope, BudgetPaceAlert } from '@/services/budgetService';
import { BudgetEnvelopeManager } from '@/components/BudgetEnvelopeManager';
import { BudgetPaceAlerts } from '@/components/BudgetPaceAlerts';
import { DevPerformanceMonitor } from '@/components/DevPerformanceMonitor';
import { isFeatureEnabled } from '@/config/flags';

const SAMPLE_RECEIPTS = [
  {
    id: 'grocery1',
    merchant: 'Whole Foods Market',
    total: 127.43,
    date: '2024-01-15',
    currency: 'USD',
    items: ['Organic Bananas', 'Greek Yogurt', 'Sourdough Bread', 'Avocados']
  },
  {
    id: 'restaurant1',
    merchant: 'The Local Bistro',
    total: 68.50,
    date: '2024-01-14',
    currency: 'USD',
    items: ['Dinner for 2', 'Wine', 'Dessert']
  },
  {
    id: 'gas1',
    merchant: 'Shell Station',
    total: 45.20,
    date: '2024-01-13',
    currency: 'USD',
    items: ['Regular Gas - 12.5 gallons']
  }
];

export function DevBudget() {
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [alerts, setAlerts] = useState<BudgetPaceAlert[]>([]);
  const [isCreatingTestData, setIsCreatingTestData] = useState(false);

  const loadData = async () => {
    const envelopeData = await budgetService.getEnvelopes();
    const alertData = await budgetService.getPaceAlerts();
    setEnvelopes(envelopeData);
    setAlerts(alertData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const createTestEnvelopes = async () => {
    setIsCreatingTestData(true);
    try {
      // Create sample budget envelopes
      await budgetService.saveEnvelope({
        name: 'Groceries',
        monthlyLimit: 400,
        currency: 'USD',
        color: '#10b981',
        spent: 0
      });

      await budgetService.saveEnvelope({
        name: 'Dining Out',
        monthlyLimit: 200,
        currency: 'USD',
        color: '#f59e0b',
        spent: 0
      });

      await budgetService.saveEnvelope({
        name: 'Transportation',
        monthlyLimit: 150,
        currency: 'USD',
        color: '#3b82f6',
        spent: 0
      });

      await loadData();
    } catch (error) {
      console.error('Error creating test envelopes:', error);
    } finally {
      setIsCreatingTestData(false);
    }
  };

  const simulateSpending = async () => {
    const transactions = [
      { merchant: 'Whole Foods', amount: 127.43, envelope: 'Groceries' },
      { merchant: 'The Local Bistro', amount: 68.50, envelope: 'Dining Out' },
      { merchant: 'Shell Station', amount: 45.20, envelope: 'Transportation' },
      { merchant: 'Trader Joes', amount: 89.32, envelope: 'Groceries' },
      { merchant: 'Coffee Shop', amount: 25.75, envelope: 'Dining Out' }
    ];

    for (const transaction of transactions) {
      const envelope = envelopes.find(e => e.name === transaction.envelope);
      if (envelope) {
        await budgetService.addTransaction({
          envelopeId: envelope.id,
          bubbleId: `test-${Date.now()}-${Math.random()}`,
          amount: transaction.amount,
          merchant: transaction.merchant,
          date: new Date(),
          description: `Sample transaction from ${transaction.merchant}`
        });
      }
    }

    await loadData();
  };

  const clearAllData = async () => {
    const allEnvelopes = await budgetService.getEnvelopes();
    for (const envelope of allEnvelopes) {
      await budgetService.deleteEnvelope(envelope.id);
    }
    await loadData();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  if (!isFeatureEnabled('budget')) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Budget Feature Disabled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>The budget feature flag is not enabled. Enable it in flags.ts to test this functionality.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <DevPerformanceMonitor />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Budget Companion Development
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={createTestEnvelopes}
              disabled={isCreatingTestData}
              variant="outline"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              {isCreatingTestData ? 'Creating...' : 'Create Test Envelopes'}
            </Button>
            
            <Button 
              onClick={simulateSpending}
              disabled={envelopes.length === 0}
              variant="outline"
            >
              <Receipt className="w-4 h-4 mr-2" />
              Simulate Spending
            </Button>
            
            <Button 
              onClick={clearAllData}
              variant="destructive"
              size="sm"
            >
              Clear All Data
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">{envelopes.length}</div>
              <div className="text-sm text-muted-foreground">Budget Envelopes</div>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">
                {alerts.filter(a => a.severity === 'high').length}
              </div>
              <div className="text-sm text-muted-foreground">High Priority Alerts</div>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="text-2xl font-bold">
                ${envelopes.reduce((sum, e) => sum + e.spent, 0).toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">Total Spent This Month</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Envelopes */}
      {envelopes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current Budget Envelopes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {envelopes.map((envelope) => (
                <div
                  key={envelope.id}
                  className="border rounded-lg p-4"
                  style={{ borderLeftColor: envelope.color, borderLeftWidth: '4px' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{envelope.name}</h3>
                    <Badge variant="outline">
                      {envelope.currency} {envelope.spent.toFixed(2)} / {envelope.monthlyLimit.toFixed(2)}
                    </Badge>
                  </div>
                  <Progress
                    value={envelope.monthlyLimit > 0 ? (envelope.spent / envelope.monthlyLimit) * 100 : 0}
                    className="h-2 mb-2"
                  />
                  <div className="text-sm text-muted-foreground">
                    {envelope.monthlyLimit > 0 
                      ? `${Math.round((envelope.spent / envelope.monthlyLimit) * 100)}% spent this month`
                      : 'No limit set'
                    }
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pace Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pace Alerts Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.envelopeId} className="flex items-center gap-3 p-3 border rounded-lg">
                  {alert.severity === 'high' ? (
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  ) : alert.severity === 'medium' ? (
                    <TrendingUp className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-green-500" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{alert.message}</div>
                    <div className="text-sm text-muted-foreground">
                      {alert.percentSpent}% spent • {alert.percentThroughMonth}% through month
                    </div>
                  </div>
                  <Badge variant={alert.isOnPace ? "outline" : "destructive"}>
                    {alert.isOnPace ? 'On Pace' : 'Over Pace'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sample Receipt Data */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Receipt Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {SAMPLE_RECEIPTS.map((receipt) => (
              <div key={receipt.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{receipt.merchant}</div>
                  <div className="font-mono text-green-600">
                    {receipt.currency} {receipt.total.toFixed(2)}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {receipt.date} • {receipt.items.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Integration Components */}
      <BudgetPaceAlerts />
      <BudgetEnvelopeManager />
    </div>
  );
}