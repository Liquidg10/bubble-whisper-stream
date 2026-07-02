import { supabase } from '@/integrations/supabase/client';

export interface PlaidAccount {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  balances: {
    available: number | null;
    current: number | null;
    iso_currency_code: string | null;
  };
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string;
  category: string[];
  iso_currency_code: string;
}

export interface PlaidLinkResult {
  public_token: string;
  metadata: {
    institution: {
      name: string;
      institution_id: string;
    };
    accounts: Array<{
      id: string;
      name: string;
      type: string;
      subtype: string;
    }>;
  };
}

class PlaidService {
  private linkHandler: any = null;

  async initializePlaidLink(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Load Plaid Link script dynamically
      if ((window as any).Plaid) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Plaid Link'));
      document.head.appendChild(script);
    });
  }

  async createLinkToken(): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke('plaid-create-link-token', {
        body: {
          products: ['transactions'],
          country_codes: ['US'],
          language: 'en'
        }
      });

      if (error) throw error;
      return data.link_token;
    } catch (error) {
      console.error('Failed to create Plaid link token:', error);
      throw new Error('Unable to initialize bank connection');
    }
  }

  async openLinkFlow(): Promise<PlaidLinkResult> {
    await this.initializePlaidLink();
    
    const linkToken = await this.createLinkToken();

    return new Promise((resolve, reject) => {
      this.linkHandler = (window as any).Plaid.create({
        token: linkToken,
        onSuccess: (public_token: string, metadata: any) => {
          resolve({ public_token, metadata });
        },
        onLoad: () => {
          console.log('Plaid Link loaded');
        },
        onExit: (err: any, metadata: any) => {
          if (err != null) {
            reject(err);
          }
        },
        onEvent: (eventName: string, metadata: any) => {
          console.log('Plaid Link event:', eventName, metadata);
        }
      });

      this.linkHandler.open();
    });
  }

  async exchangePublicToken(publicToken: string, institutionName: string): Promise<void> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase.functions.invoke('plaid-exchange-token', {
        body: {
          public_token: publicToken,
          institution_name: institutionName
        }
      });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to exchange public token:', error);
      throw new Error('Failed to connect bank account');
    }
  }

  // Get accounts from local database (synced from Plaid)
  async getAccounts(): Promise<PlaidAccount[]> {
    try {
      const { data, error } = await supabase
        .from('plaid_accounts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(account => ({
        account_id: account.account_id,
        name: account.name,
        type: account.type,
        subtype: account.subtype || '',
        balances: account.balances as any
      }));
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      throw error;
    }
  }

  // Get transactions from local database (synced from Plaid)
  async getTransactions(accountId?: string, startDate?: string, endDate?: string): Promise<PlaidTransaction[]> {
    try {
      let query = supabase
        .from('plaid_transactions')
        .select('*')
        .order('date', { ascending: false });

      // Apply filters
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      
      if (startDate) {
        query = query.gte('date', startDate);
      }
      
      if (endDate) {
        query = query.lte('date', endDate);
      }

      const { data, error } = await query.limit(1000); // Limit to prevent large payloads

      if (error) throw error;

      return data.map(transaction => ({
        transaction_id: transaction.transaction_id,
        account_id: transaction.account_id,
        amount: transaction.amount,
        date: transaction.date,
        name: transaction.name,
        merchant_name: transaction.merchant_name || undefined,
        category: Array.isArray(transaction.category) ? transaction.category as string[] : [],
        iso_currency_code: transaction.iso_currency_code || 'USD'
      }));
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      throw error;
    }
  }

  async generateSpendingInsights(transactions: PlaidTransaction[]): Promise<{
    categories: Record<string, number>;
    monthlySpend: number;
    topMerchants: Array<{ name: string; amount: number }>;
    trends: Array<{ date: string; amount: number }>;
  }> {
    const categories: Record<string, number> = {};
    const merchants: Record<string, number> = {};
    const dailySpend: Record<string, number> = {};

    let totalSpend = 0;

    transactions.forEach(transaction => {
      // Only count positive amounts (debits)
      if (transaction.amount > 0) {
        totalSpend += transaction.amount;

        // Categorize spending
        const primaryCategory = transaction.category[0] || 'Other';
        categories[primaryCategory] = (categories[primaryCategory] || 0) + transaction.amount;

        // Track merchant spending
        const merchantName = transaction.merchant_name || transaction.name;
        merchants[merchantName] = (merchants[merchantName] || 0) + transaction.amount;

        // Daily trends
        const date = transaction.date;
        dailySpend[date] = (dailySpend[date] || 0) + transaction.amount;
      }
    });

    const topMerchants = Object.entries(merchants)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));

    const trends = Object.entries(dailySpend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    return {
      categories,
      monthlySpend: totalSpend,
      topMerchants,
      trends
    };
  }

  // Disconnect a Plaid account
  async disconnectAccount(itemId: string): Promise<void> {
    try {
      // Mark the item as inactive in our database
      const { error } = await supabase
        .from('plaid_items')
        .update({ is_active: false })
        .eq('item_id', itemId);

      if (error) throw error;

      // Also mark associated accounts as inactive
      // plaid_items direct SELECT is revoked (migration 30); id is still
      // exposed via the plaid_items_safe view.
      // TODO(post-migration): remove the `as any` once `supabase gen types typescript`
      // is re-run against the live DB and plaid_items_safe appears in the generated types.
      const { data: itemData } = await supabase
        .from('plaid_items_safe' as any)
        .select('id')
        .eq('item_id', itemId)
        .single();

      if (itemData) {
        await supabase
          .from('plaid_accounts')
          .update({ is_active: false })
          .eq('plaid_item_id', (itemData as unknown as { id: string }).id);
      }
    } catch (error) {
      console.error('Failed to disconnect account:', error);
      throw error;
    }
  }

  // Get sync status for all connections
  async getSyncStatuses(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('plaid_sync_status')
        .select(`
          *,
          plaid_items (
            item_id,
            institution_name
          )
        `);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch sync statuses:', error);
      throw error;
    }
  }

  // Trigger manual sync for accounts
  async triggerAccountsSync(itemId: string): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('plaid-get-accounts', {
        body: { item_id: itemId }
      });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to trigger accounts sync:', error);
      throw error;
    }
  }

  // Trigger manual sync for transactions  
  async triggerTransactionsSync(itemId: string, startDate?: string, endDate?: string): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('plaid-get-transactions', {
        body: { 
          item_id: itemId,
          start_date: startDate,
          end_date: endDate
        }
      });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to trigger transactions sync:', error);
      throw error;
    }
  }
}

export const plaidService = new PlaidService();