-- Create oauth_state table for temporary OAuth state storage
CREATE TABLE IF NOT EXISTS oauth_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  service text,
  origin text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- Enable RLS
ALTER TABLE oauth_state ENABLE ROW LEVEL SECURITY;

-- Create policy for service role to manage oauth state
CREATE POLICY "Service role can manage oauth state"
  ON oauth_state FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add index for cleanup
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires_at 
  ON oauth_state(expires_at);

-- Create function to cleanup expired state
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_state()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM oauth_state WHERE expires_at < now();
$$;