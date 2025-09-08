-- Create plaid_accounts table for storing account data locally
CREATE TABLE public.plaid_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  plaid_item_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  official_name TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  balances JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (plaid_item_id) REFERENCES public.plaid_items(id) ON DELETE CASCADE
);

-- Create plaid_transactions table for mirroring transactions locally
CREATE TABLE public.plaid_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  plaid_item_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  merchant_name TEXT,
  category JSONB DEFAULT '[]',
  iso_currency_code TEXT DEFAULT 'USD',
  account_owner TEXT,
  authorized_date DATE,
  location JSONB,
  payment_meta JSONB,
  pending BOOLEAN DEFAULT false,
  pending_transaction_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (plaid_item_id) REFERENCES public.plaid_items(id) ON DELETE CASCADE
);

-- Create plaid_sync_status table for tracking sync health
CREATE TABLE public.plaid_sync_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plaid_item_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  last_accounts_sync TIMESTAMP WITH TIME ZONE,
  last_transactions_sync TIMESTAMP WITH TIME ZONE,
  last_webhook_received TIMESTAMP WITH TIME ZONE,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  webhook_url TEXT,
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (plaid_item_id) REFERENCES public.plaid_items(id) ON DELETE CASCADE
);

-- Create plaid_webhooks table for logging webhook events
CREATE TABLE public.plaid_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  plaid_item_id UUID,
  user_id UUID,
  webhook_type TEXT NOT NULL,
  webhook_code TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on all tables
ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_webhooks ENABLE ROW LEVEL SECURITY;

-- RLS policies for plaid_accounts
CREATE POLICY "Users can manage their own plaid accounts" 
ON public.plaid_accounts 
FOR ALL 
USING (auth.uid() = user_id);

-- RLS policies for plaid_transactions
CREATE POLICY "Users can manage their own plaid transactions" 
ON public.plaid_transactions 
FOR ALL 
USING (auth.uid() = user_id);

-- RLS policies for plaid_sync_status
CREATE POLICY "Users can manage their own plaid sync status" 
ON public.plaid_sync_status 
FOR ALL 
USING (auth.uid() = user_id);

-- RLS policies for plaid_webhooks
CREATE POLICY "Users can view their own plaid webhooks" 
ON public.plaid_webhooks 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service can manage all plaid webhooks" 
ON public.plaid_webhooks 
FOR ALL 
USING (auth.role() = 'service_role');

-- Add indexes for performance
CREATE INDEX idx_plaid_accounts_user_id ON public.plaid_accounts(user_id);
CREATE INDEX idx_plaid_accounts_plaid_item_id ON public.plaid_accounts(plaid_item_id);
CREATE INDEX idx_plaid_transactions_user_id ON public.plaid_transactions(user_id);
CREATE INDEX idx_plaid_transactions_account_id ON public.plaid_transactions(account_id);
CREATE INDEX idx_plaid_transactions_date ON public.plaid_transactions(date DESC);
CREATE INDEX idx_plaid_transactions_plaid_item_id ON public.plaid_transactions(plaid_item_id);
CREATE INDEX idx_plaid_sync_status_user_id ON public.plaid_sync_status(user_id);
CREATE INDEX idx_plaid_webhooks_plaid_item_id ON public.plaid_webhooks(plaid_item_id);
CREATE INDEX idx_plaid_webhooks_processed ON public.plaid_webhooks(processed);

-- Add triggers for updating timestamps
CREATE TRIGGER update_plaid_accounts_updated_at
BEFORE UPDATE ON public.plaid_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plaid_transactions_updated_at
BEFORE UPDATE ON public.plaid_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plaid_sync_status_updated_at
BEFORE UPDATE ON public.plaid_sync_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();