-- Update oauth_accounts table schema - Phase 1: Core updates
-- Add provider type constraints and space-delimited scopes

-- Add new columns if they don't exist
ALTER TABLE oauth_accounts 
  ADD COLUMN IF NOT EXISTS token_type text DEFAULT 'Bearer';

ALTER TABLE oauth_accounts 
  ADD COLUMN IF NOT EXISTS scopes_string text DEFAULT '';

-- Migrate existing array scopes to space-delimited string
UPDATE oauth_accounts 
SET scopes_string = array_to_string(scopes, ' ')
WHERE scopes IS NOT NULL AND scopes != '{}' AND (scopes_string IS NULL OR scopes_string = '');

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user 
  ON oauth_accounts(provider, provider_user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_expires_at 
  ON oauth_accounts(expires_at);

-- Update RLS policies (drop existing first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own OAuth accounts" ON oauth_accounts;
DROP POLICY IF EXISTS "Users can update their own OAuth accounts" ON oauth_accounts;
DROP POLICY IF EXISTS "Users can delete their own OAuth accounts" ON oauth_accounts;
DROP POLICY IF EXISTS "Service role can manage OAuth accounts" ON oauth_accounts;

-- Create updated policies
CREATE POLICY "Users can view their own OAuth accounts"
  ON oauth_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own OAuth accounts"
  ON oauth_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OAuth accounts"
  ON oauth_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OAuth accounts"
  ON oauth_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage OAuth tokens"
  ON oauth_accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);