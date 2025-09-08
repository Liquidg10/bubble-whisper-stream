-- Add missing fields to oauth_accounts table
ALTER TABLE public.oauth_accounts 
ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS account_email TEXT;

-- Update existing records to have empty scopes array if null
UPDATE public.oauth_accounts SET scopes = '{}' WHERE scopes IS NULL;