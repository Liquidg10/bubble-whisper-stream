-- Enhance calendar_accounts table for watch channels and incremental sync
ALTER TABLE calendar_accounts 
ADD COLUMN IF NOT EXISTS watch_channel_id text,
ADD COLUMN IF NOT EXISTS watch_resource_id text,
ADD COLUMN IF NOT EXISTS watch_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS watch_status text DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS next_sync_token text,
ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS last_sync_error text,
ADD COLUMN IF NOT EXISTS sync_cursor text;

-- Add index for efficient watch channel queries
CREATE INDEX IF NOT EXISTS idx_calendar_accounts_watch_expires 
ON calendar_accounts(watch_expires_at) 
WHERE watch_status = 'active';

-- Add index for sync status queries
CREATE INDEX IF NOT EXISTS idx_calendar_accounts_sync_status 
ON calendar_accounts(sync_status, user_id);

-- Add constraint for watch_status values
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'calendar_accounts_watch_status_check'
    ) THEN
        ALTER TABLE calendar_accounts 
        ADD CONSTRAINT calendar_accounts_watch_status_check 
        CHECK (watch_status IN ('inactive', 'active', 'expired', 'failed'));
    END IF;
END $$;

-- Add constraint for sync_status values
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'calendar_accounts_sync_status_check'
    ) THEN
        ALTER TABLE calendar_accounts 
        ADD CONSTRAINT calendar_accounts_sync_status_check 
        CHECK (sync_status IN ('idle', 'syncing', 'error', 'complete'));
    END IF;
END $$;

-- Create function to check for expiring watch channels
CREATE OR REPLACE FUNCTION get_expiring_watch_channels(hours_ahead integer DEFAULT 24)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    calendar_id text,
    watch_channel_id text,
    watch_resource_id text,
    watch_expires_at timestamp with time zone,
    account_email text
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        ca.id,
        ca.user_id,
        ca.calendar_id,
        ca.watch_channel_id,
        ca.watch_resource_id,
        ca.watch_expires_at,
        ca.account_email
    FROM calendar_accounts ca
    WHERE ca.watch_status = 'active'
    AND ca.watch_expires_at IS NOT NULL
    AND ca.watch_expires_at <= (now() + (hours_ahead || ' hours')::interval);
$$;