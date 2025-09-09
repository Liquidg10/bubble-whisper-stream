-- Phase 1: Enhance database schema for Gmail triage model

-- Add missing fields to email_accounts for watch tracking
ALTER TABLE email_accounts 
ADD COLUMN IF NOT EXISTS history_id text,
ADD COLUMN IF NOT EXISTS watch_resource_id text,
ADD COLUMN IF NOT EXISTS watch_channel_id text,
ADD COLUMN IF NOT EXISTS watch_expiration timestamp with time zone,
ADD COLUMN IF NOT EXISTS labels_cache jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS context_cache_enabled boolean DEFAULT false;

-- Create gmail_threads table for proper thread management
CREATE TABLE IF NOT EXISTS gmail_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id text NOT NULL,
  history_id text,
  label_ids text[] DEFAULT '{}',
  snippet text,
  message_count integer DEFAULT 0,
  last_message_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create gmail_messages table with proper schema
CREATE TABLE IF NOT EXISTS gmail_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email_account_id uuid NOT NULL,
  thread_id text NOT NULL,
  external_message_id text NOT NULL,
  gmail_thread_id text,
  internal_date timestamp with time zone,
  subject text NOT NULL,
  sender_email text NOT NULL,
  sender_name text,
  to_emails text[] DEFAULT '{}',
  label_ids text[] DEFAULT '{}',
  payload_metadata jsonb DEFAULT '{}',
  body_preview text,
  importance_score real DEFAULT 0.5,
  bubble_created boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create gmail_actionables table for triage candidates
CREATE TABLE IF NOT EXISTS gmail_actionables (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  message_id uuid NOT NULL,
  actionable_type text NOT NULL,
  due_date timestamp with time zone,
  priority_score real DEFAULT 0.5,
  action_required boolean DEFAULT true,
  action_completed boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE gmail_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_actionables ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for gmail_threads
CREATE POLICY "Users can manage their own gmail threads"
  ON gmail_threads FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Create RLS policies for gmail_messages  
CREATE POLICY "Users can manage their own gmail messages"
  ON gmail_messages FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Create RLS policies for gmail_actionables
CREATE POLICY "Users can manage their own gmail actionables"
  ON gmail_actionables FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_gmail_threads_user_thread ON gmail_threads(user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_gmail_threads_history ON gmail_threads(history_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_thread ON gmail_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_external ON gmail_messages(external_message_id);
CREATE INDEX IF NOT EXISTS idx_gmail_actionables_user ON gmail_actionables(user_id, actionable_type);
CREATE INDEX IF NOT EXISTS idx_gmail_actionables_due ON gmail_actionables(due_date);

-- Add triggers for updated_at
CREATE TRIGGER update_gmail_threads_updated_at
  BEFORE UPDATE ON gmail_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gmail_messages_updated_at
  BEFORE UPDATE ON gmail_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gmail_actionables_updated_at
  BEFORE UPDATE ON gmail_actionables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();