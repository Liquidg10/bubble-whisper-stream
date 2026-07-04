import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Wallet, 
  TrendingUp, 
  DollarSign, 
  PieChart,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2
} from 'lucide-react';
import { plaidService, PlaidAccount, PlaidTransaction } from '@/services/plaidService';
import { PlaidStatusPanel } from '@/components/PlaidStatusPanel';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function PlaidIntegrationPlugin() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const loadBankConnections = async () => {
    try {
      // Migration 30 excludes access_token/key_id from client reads via a
      // security-barrier view; the base table's direct SELECT is revoked.
      // TODO(post-migration): remove the `as any` once `supabase gen types typescript`
      // is re-run against the live DB and plaid_items_safe appears in the generated types.
      const { data, error } = await supabase
        .from('plaid_items_safe' as any)
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setConnections(data || []);
      return data || [];
    } catch (error) {
      console.error('Failed to load connections:', error);
      toast({
        title: "Connection Error",
        description: "Failed to load bank connections",
        variant: "destructive"
      });
      return [];
    }
  };

  useEffect(() => {
    loadBankConnections();
  }, []);

  useEffect(() => {
    if (isEnabled) {
      loadBankAccounts();
    }
  }, [isEnabled]);

  const loadBankAccounts = async () => {
    setIsLoading(true);
    try {
      const [accountsData, transactionsData] = await Promise.all([
        plaidService.getAccounts(),
        plaidService.getTransactions()
      ]);

      setAccounts(accountsData);
      setTransactions(transactionsData);

      if (transactionsData.length > 0) {
        const insightsData = await plaidService.generateSpendingInsights(transactionsData);
        setInsights(insightsData);
      }
    } catch (error) {
      console.error('Failed to load bank data:', error);
      toast({
        title: "Bank Sync Failed",
        description: "Unable to sync bank accounts. Please check your connection.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const connectBankAccount = async () => {
    setIsConnecting(true);
    try {
      const linkResult = await plaidService.openLinkFlow();
      await plaidService.exchangePublicToken(
        linkResult.public_token,
        linkResult.metadata.institution.name
      );
      
      toast({
        title: "Bank Connected",
        description: `${linkResult.metadata.institution.name} has been connected successfully.`,
      });

      await loadBankConnections();
      await loadBankAccounts();
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

  const togglePlugin = async (enabled: boolean) => {
    setIsEnabled(enabled);
    
    if (enabled) {
      await loadBankConnections();
      await loadBankAccounts();
    }
  };

  const handleRefresh = async () => {
    await loadBankConnections();
    await loadBankAccounts();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Banking Integration (Plaid)
            <Badge variant="secondary">Read-Only</Badge>
          </CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!isEnabled && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Banking integration provides read-only access to your financial data for insights and budgeting.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Enable Banking Features</h4>
            <p className="text-xs text-muted-foreground">
              Connect your bank for spending insights and budget tracking
            </p>
          </div>
          <Button
            variant={isEnabled ? "outline" : "default"}
            onClick={() => togglePlugin(!isEnabled)}
          >
            {isEnabled ? "Disable" : "Enable"}
          </Button>
        </div>
        
        {isEnabled && (
          <>
            <Separator />

            {/* Status Panel */}
            {connections.length > 0 && (
              <PlaidStatusPanel 
                connections={connections} 
                onRefresh={handleRefresh}
              />
            )}
            
            {connections.length > 0 && <Separator />}
            
            {/* Account Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Connected Accounts</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={connectBankAccount}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Add Bank
                </Button>
              </div>
              
              {accounts.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No bank accounts connected. Add a bank account to start tracking your finances.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div key={account.account_id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <div className="font-medium text-sm">{account.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {account.type} • {account.subtype}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ${account.balances.current?.toFixed(2) || '0.00'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Available: ${account.balances.available?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Spending Insights */}
            {insights && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Spending Insights (Last 30 Days)</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border rounded">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Total Spent</span>
                      </div>
                      <div className="text-lg font-semibold">
                        ${insights.monthlySpend.toFixed(2)}
                      </div>
                    </div>
                    
                    <div className="p-3 border rounded">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Transactions</span>
                      </div>
                      <div className="text-lg font-semibold">
                        {transactions.length}
                      </div>
                    </div>
                  </div>

                  {/* Top Categories */}
                  <div>
                    <h5 className="text-xs font-medium text-muted-foreground mb-2">Top Spending Categories</h5>
                    <div className="space-y-2">
                      {Object.entries(insights.categories)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .slice(0, 3)
                        .map(([category, amount]) => (
                          <div key={category} className="flex items-center justify-between text-sm">
                            <span>{category}</span>
                            <span className="font-medium">${(amount as number).toFixed(2)}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Top Merchants */}
                  {insights.topMerchants.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-2">Top Merchants</h5>
                      <div className="space-y-2">
                        {insights.topMerchants.slice(0, 3).map((merchant: any) => (
                          <div key={merchant.name} className="flex items-center justify-between text-sm">
                            <span className="truncate">{merchant.name}</span>
                            <span className="font-medium">${merchant.amount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}