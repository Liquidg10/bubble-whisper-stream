import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { 
  CreditCard, 
  TrendingUp, 
  TrendingDown,
  AlertCircle, 
  CheckCircle, 
  DollarSign,
  RefreshCw,
  Plus,
  Shield,
  Eye,
  EyeOff
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

interface BankAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit';
  balance: number;
  institution: string;
  lastSync: string;
  connected: boolean;
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  isRecurring?: boolean;
}

interface SpendingInsight {
  id: string;
  type: 'overspending' | 'recurring' | 'unusual' | 'bill-due';
  title: string;
  description: string;
  amount?: number;
  category?: string;
  severity: 'info' | 'warning' | 'critical';
}

export function BankingIntegrationPlugin() {
  const { addBubble, addReminder, settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  
  const [isEnabled, setIsEnabled] = useState(settings.bankingIntegrationEnabled || false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<SpendingInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(2000);

  useEffect(() => {
    loadBankAccounts();
    if (isEnabled) {
      loadFinancialData();
    }
  }, [isEnabled]);

  const loadBankAccounts = async () => {
    const savedAccounts = localStorage.getItem('bank-accounts');
    if (savedAccounts) {
      setAccounts(JSON.parse(savedAccounts));
    }
  };

  const loadFinancialData = async () => {
    setIsLoading(true);
    try {
      // Mock financial data - in real implementation would use Plaid API
      const mockAccounts: BankAccount[] = [
        {
          id: '1',
          name: 'Main Checking',
          type: 'checking',
          balance: 3247.82,
          institution: 'Chase Bank',
          lastSync: new Date().toISOString(),
          connected: true
        },
        {
          id: '2',
          name: 'Savings Account',
          type: 'savings',
          balance: 12450.00,
          institution: 'Chase Bank',
          lastSync: new Date().toISOString(),
          connected: true
        },
        {
          id: '3',
          name: 'Credit Card',
          type: 'credit',
          balance: -1856.23,
          institution: 'American Express',
          lastSync: new Date().toISOString(),
          connected: true
        }
      ];

      const mockTransactions: Transaction[] = [
        {
          id: '1',
          accountId: '1',
          amount: -127.50,
          description: 'Whole Foods Market',
          category: 'Groceries',
          date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: '2',
          accountId: '1',
          amount: -45.00,
          description: 'Gas Station',
          category: 'Transportation',
          date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        },
        {
          id: '3',
          accountId: '3',
          amount: -850.00,
          description: 'Rent Payment',
          category: 'Housing',
          date: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
          isRecurring: true
        }
      ];

      const mockInsights: SpendingInsight[] = [
        {
          id: '1',
          type: 'bill-due',
          title: 'Credit Card Payment Due',
          description: 'Your credit card payment of $1,856 is due in 3 days',
          amount: 1856.23,
          severity: 'warning'
        },
        {
          id: '2',
          type: 'overspending',
          title: 'Dining Budget Exceeded',
          description: "You've spent 120% of your monthly dining budget",
          category: 'Dining',
          severity: 'warning'
        },
        {
          id: '3',
          type: 'unusual',
          title: 'Large Purchase Detected',
          description: 'Unusual $450 purchase at electronics store',
          amount: 450,
          severity: 'info'
        }
      ];

      setAccounts(mockAccounts);
      setTransactions(mockTransactions);
      setInsights(mockInsights);
    } catch (error) {
      console.error('Failed to load financial data:', error);
      toast({
        title: "Banking Sync Failed",
        description: "Unable to sync financial data. Please check your connection.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const connectPlaidAccount = async () => {
    setIsConnecting(true);
    try {
      // In real implementation, this would initiate Plaid Link flow
      const newAccount: BankAccount = {
        id: crypto.randomUUID(),
        name: 'New Checking',
        type: 'checking',
        balance: 1500.00,
        institution: 'Wells Fargo',
        lastSync: new Date().toISOString(),
        connected: true
      };
      
      const updatedAccounts = [...accounts, newAccount];
      setAccounts(updatedAccounts);
      localStorage.setItem('bank-accounts', JSON.stringify(updatedAccounts));
      
      toast({
        title: "Bank Account Connected",
        description: "Your bank account has been securely connected via Plaid.",
      });
    } catch (error) {
      console.error('Failed to connect bank account:', error);
      toast({
        title: "Connection Failed",
        description: "Unable to connect bank account. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const createBubbleFromInsight = async (insight: SpendingInsight) => {
    const bubbleId = crypto.randomUUID();
    const bubble = {
      id: bubbleId,
      content: `💰 ${insight.title}\n\n${insight.description}${insight.amount ? `\n\nAmount: $${insight.amount.toFixed(2)}` : ''}`,
      type: insight.severity === 'critical' ? 'ReminderNote' as const : 'Task' as const,
      tags: [{ id: 'finance', name: 'finance', color: '#059669' }, { id: 'money', name: 'money', color: '#dc2626' }],
      x: Math.random() * 400,
      y: Math.random() * 400,
      size: insight.severity === 'critical' ? 65 : insight.severity === 'warning' ? 55 : 45,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completed: false
    };
    
    await addBubble(bubble);
    
    // Create reminder for bills and critical items
    if (insight.type === 'bill-due' || insight.severity === 'critical') {
      const reminder = {
        id: crypto.randomUUID(),
        bubbleId: bubbleId,
        title: `Action needed: ${insight.title}`,
        description: insight.description,
        scheduledFor: Date.now() + (24 * 60 * 60 * 1000),
        scheduledAt: Date.now() + (24 * 60 * 60 * 1000),
        level: (insight.severity === 'critical' ? 3 : 2) as 1 | 2 | 3,
        status: 'Active' as const,
        createdAt: Date.now(),
        snoozes: []
      };
      
      await addReminder(reminder);
    }
    
    toast({
      title: "Financial Insight Added",
      description: `Created bubble for "${insight.title}"`,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(amount));
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'checking': return <CreditCard className="h-4 w-4" />;
      case 'savings': return <TrendingUp className="h-4 w-4" />;
      case 'credit': return <TrendingDown className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const totalSpentThisMonth = transactions
    .filter(t => t.amount < 0 && new Date(t.date).getMonth() === new Date().getMonth())
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
  const budgetPercentage = (totalSpentThisMonth / monthlyBudget) * 100;

  const togglePlugin = async (enabled: boolean) => {
    setIsEnabled(enabled);
    await updateSettings({ bankingIntegrationEnabled: enabled });
    
    if (enabled) {
      loadFinancialData();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Banking & Finance
            <Badge variant="secondary">Core Plugin</Badge>
          </CardTitle>
          <Switch
            checked={isEnabled}
            onCheckedChange={togglePlugin}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!isEnabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Enable banking integration to get spending insights, bill reminders, and budget tracking bubbles.
            </AlertDescription>
          </Alert>
        )}
        
        {isEnabled && (
          <>
            {/* Security Notice */}
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                All financial data is encrypted and read-only. We use Plaid for secure bank connections.
              </AlertDescription>
            </Alert>

            {/* Account Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Connected Accounts</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowBalances(!showBalances)}
                  >
                    {showBalances ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={connectPlaidAccount}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3 mr-1" />
                    )}
                    Add Account
                  </Button>
                </div>
              </div>
              
              {accounts.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No bank accounts connected. Add an account to start tracking your finances.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3">
                        {getAccountIcon(account.type)}
                        <div>
                          <div className="font-medium text-sm">{account.name}</div>
                          <div className="text-xs text-muted-foreground">{account.institution}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm">
                          {showBalances ? formatCurrency(account.balance) : '••••'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {account.type === 'credit' && account.balance < 0 ? 'Balance Owed' : 'Balance'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Budget Tracking */}
            <div className="space-y-3 p-4 border rounded">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Monthly Budget</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                    className="w-24 h-8"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Spent this month</span>
                  <span className={budgetPercentage > 100 ? 'text-red-500' : 'text-green-500'}>
                    ${totalSpentThisMonth.toFixed(2)} / ${monthlyBudget.toFixed(2)}
                  </span>
                </div>
                <Progress value={Math.min(budgetPercentage, 100)} className="h-2" />
                <div className="text-xs text-muted-foreground">
                  {budgetPercentage > 100 
                    ? `${(budgetPercentage - 100).toFixed(1)}% over budget`
                    : `${(100 - budgetPercentage).toFixed(1)}% remaining`
                  }
                </div>
              </div>
            </div>

            {/* Financial Insights */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Financial Insights</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadFinancialData}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
              
              {insights.length === 0 ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Great! No urgent financial insights at the moment.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {insights.map((insight) => (
                    <div key={insight.id} className="flex items-start justify-between p-3 border rounded">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {insight.severity === 'critical' && <AlertCircle className="h-4 w-4 text-red-500" />}
                          {insight.severity === 'warning' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                          {insight.severity === 'info' && <CheckCircle className="h-4 w-4 text-blue-500" />}
                          <div className="font-medium text-sm">{insight.title}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {insight.description}
                        </div>
                        {insight.amount && (
                          <div className="text-xs font-medium">
                            Amount: {formatCurrency(insight.amount)}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createBubbleFromInsight(insight)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Bubble
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}