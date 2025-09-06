-- Create OAuth tokens table for secure token storage
CREATE TABLE public.oauth_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL, -- 'google', 'microsoft'
  service_type TEXT NOT NULL, -- 'calendar', 'email'
  account_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create calendar accounts table
CREATE TABLE public.calendar_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  oauth_token_id UUID NOT NULL REFERENCES public.oauth_tokens(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google', 'microsoft', 'ical'
  account_name TEXT NOT NULL,
  account_email TEXT NOT NULL,
  calendar_id TEXT, -- External calendar ID
  calendar_name TEXT,
  is_primary BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_token TEXT, -- For incremental sync
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create email accounts table
CREATE TABLE public.email_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  oauth_token_id UUID NOT NULL REFERENCES public.oauth_tokens(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'gmail', 'outlook'
  account_email TEXT NOT NULL,
  account_name TEXT,
  sync_enabled BOOLEAN DEFAULT true,
  filters JSONB DEFAULT '{"keywords": [], "senders": [], "importance_threshold": 0.7}'::jsonb,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_token TEXT, -- For incremental sync
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create calendar events cache table
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  calendar_account_id UUID NOT NULL REFERENCES public.calendar_accounts(id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT,
  attendees JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'confirmed',
  bubble_created BOOLEAN DEFAULT false,
  reminder_created BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create email messages cache table
CREATE TABLE public.email_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL,
  thread_id TEXT,
  subject TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  body_preview TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  importance_score REAL DEFAULT 0.5,
  labels JSONB DEFAULT '[]'::jsonb,
  bubble_created BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sync logs table
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service_type TEXT NOT NULL, -- 'calendar', 'email'
  provider TEXT NOT NULL,
  account_id UUID, -- References calendar_accounts or email_accounts
  operation TEXT NOT NULL, -- 'full_sync', 'incremental_sync', 'webhook'
  status TEXT NOT NULL, -- 'success', 'error', 'partial'
  items_processed INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create webhook subscriptions table
CREATE TABLE public.webhook_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  service_type TEXT NOT NULL,
  account_id UUID,
  external_subscription_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for oauth_tokens
CREATE POLICY "Users can manage their own tokens" 
ON public.oauth_tokens 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for calendar_accounts
CREATE POLICY "Users can manage their own calendar accounts" 
ON public.calendar_accounts 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for email_accounts
CREATE POLICY "Users can manage their own email accounts" 
ON public.email_accounts 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for calendar_events
CREATE POLICY "Users can manage their own calendar events" 
ON public.calendar_events 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for email_messages
CREATE POLICY "Users can manage their own email messages" 
ON public.email_messages 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for sync_logs
CREATE POLICY "Users can view their own sync logs" 
ON public.sync_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service can insert sync logs" 
ON public.sync_logs 
FOR INSERT 
WITH CHECK (true);

-- Create RLS policies for webhook_subscriptions
CREATE POLICY "Users can manage their own webhook subscriptions" 
ON public.webhook_subscriptions 
FOR ALL 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_oauth_tokens_user_provider ON public.oauth_tokens(user_id, provider, service_type);
CREATE INDEX idx_calendar_accounts_user ON public.calendar_accounts(user_id);
CREATE INDEX idx_email_accounts_user ON public.email_accounts(user_id);
CREATE INDEX idx_calendar_events_user_time ON public.calendar_events(user_id, start_time);
CREATE INDEX idx_email_messages_user_received ON public.email_messages(user_id, received_at DESC);
CREATE INDEX idx_sync_logs_user_created ON public.sync_logs(user_id, created_at DESC);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_oauth_tokens_updated_at
BEFORE UPDATE ON public.oauth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_accounts_updated_at
BEFORE UPDATE ON public.calendar_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_accounts_updated_at
BEFORE UPDATE ON public.email_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_messages_updated_at
BEFORE UPDATE ON public.email_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_subscriptions_updated_at
BEFORE UPDATE ON public.webhook_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();