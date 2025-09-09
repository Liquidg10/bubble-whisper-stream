-- Update oauth_accounts table to match the new schema requirements
-- Add provider type constraints and space-delimited scopes

-- First, let's backup the existing data and update the schema
ALTER TABLE oauth_accounts 
  ADD COLUMN IF NOT EXISTS token_type text DEFAULT 'Bearer';

-- Update provider column to use more specific provider names
-- We'll need to handle this carefully to avoid breaking existing data
UPDATE oauth_accounts 
SET provider = CASE 
  WHEN provider = 'google' AND scopes @> ARRAY['https://www.googleapis.com/auth/calendar']::text[] THEN 'google-calendar'
  WHEN provider = 'google' AND scopes @> ARRAY['https://www.googleapis.com/auth/gmail.metadata']::text[] THEN 'gmail'
  ELSE provider
END;

-- Add scopes_string column for space-delimited scopes (this will replace the array)
ALTER TABLE oauth_accounts 
  ADD COLUMN IF NOT EXISTS scopes_string text DEFAULT '';

-- Migrate existing array scopes to space-delimited string
UPDATE oauth_accounts 
SET scopes_string = array_to_string(scopes, ' ')
WHERE scopes IS NOT NULL AND scopes != '{}';

-- Create function to encrypt tokens (we'll handle this server-side now)
CREATE OR REPLACE FUNCTION encrypt_oauth_token(token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For now, return the token as-is. In production, we'd use actual encryption
  -- This is a placeholder for the encryption implementation
  RETURN token;
END;
$$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user 
  ON oauth_accounts(provider, provider_user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_expires_at 
  ON oauth_accounts(expires_at);

-- Add constraint to ensure provider is one of our supported types
ALTER TABLE oauth_accounts 
  DROP CONSTRAINT IF EXISTS oauth_accounts_provider_check;

ALTER TABLE oauth_accounts 
  ADD CONSTRAINT oauth_accounts_provider_check 
  CHECK (provider IN ('google-calendar', 'gmail', 'google', 'microsoft', 'apple', 'github'));

-- Update RLS policies to be more granular
DROP POLICY IF EXISTS "Users can view their own OAuth accounts" ON oauth_accounts;
DROP POLICY IF EXISTS "Users can update their own OAuth accounts" ON oauth_accounts;
DROP POLICY IF EXISTS "Users can delete their own OAuth accounts" ON oauth_accounts;

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

-- Service role should be able to manage OAuth accounts for token refresh
CREATE POLICY "Service role can manage OAuth accounts"
  ON oauth_accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);