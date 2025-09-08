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

  async getAccounts(): Promise<PlaidAccount[]> {
    try {
      const { data, error } = await supabase.functions.invoke('plaid-get-accounts');
      if (error) throw error;
      return data.accounts || [];
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      return [];
    }
  }

  async getTransactions(accountId?: string, startDate?: string, endDate?: string): Promise<PlaidTransaction[]> {
    try {
      const { data, error } = await supabase.functions.invoke('plaid-get-transactions', {
        body: {
          account_id: accountId,
          start_date: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: endDate || new Date().toISOString().split('T')[0]
        }
      });

      if (error) throw error;
      return data.transactions || [];
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      return [];
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

  async disconnectAccount(itemId: string): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('plaid-disconnect', {
        body: { item_id: itemId }
      });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to disconnect Plaid account:', error);
      throw new Error('Failed to disconnect bank account');
    }
  }
}

export const plaidService = new PlaidService();