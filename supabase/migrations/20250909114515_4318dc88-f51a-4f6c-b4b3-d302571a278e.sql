-- Phase 1b: Add only missing fields to existing tables

-- Add missing fields to email_accounts for watch tracking (only if they don't exist)
DO $$
BEGIN
  -- Add history_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_accounts' AND column_name = 'history_id') THEN
    ALTER TABLE email_accounts ADD COLUMN history_id text;
  END IF;
  
  -- Add watch_resource_id if it doesn't exist  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_accounts' AND column_name = 'watch_resource_id') THEN
    ALTER TABLE email_accounts ADD COLUMN watch_resource_id text;
  END IF;
  
  -- Add watch_channel_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_accounts' AND column_name = 'watch_channel_id') THEN
    ALTER TABLE email_accounts ADD COLUMN watch_channel_id text;
  END IF;
  
  -- Add watch_expiration if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_accounts' AND column_name = 'watch_expiration') THEN
    ALTER TABLE email_accounts ADD COLUMN watch_expiration timestamp with time zone;
  END IF;
  
  -- Add labels_cache if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_accounts' AND column_name = 'labels_cache') THEN
    ALTER TABLE email_accounts ADD COLUMN labels_cache jsonb DEFAULT '{}';
  END IF;
  
  -- Add context_cache_enabled if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_accounts' AND column_name = 'context_cache_enabled') THEN
    ALTER TABLE email_accounts ADD COLUMN context_cache_enabled boolean DEFAULT false;
  END IF;
END $$;