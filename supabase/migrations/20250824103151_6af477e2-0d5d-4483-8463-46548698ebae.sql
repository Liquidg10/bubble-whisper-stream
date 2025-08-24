-- Create sync infrastructure tables
CREATE TABLE public.sync_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  public_key TEXT NOT NULL,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_devices ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own devices" 
ON public.sync_devices 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own devices" 
ON public.sync_devices 
FOR ALL 
USING (auth.uid() = user_id);

-- Create sync data table
CREATE TABLE public.sync_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  data_encrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  version TEXT NOT NULL,
  device_id TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_data ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own sync data" 
ON public.sync_data 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync data" 
ON public.sync_data 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create sync conflicts table
CREATE TABLE public.sync_conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_data TEXT NOT NULL,
  remote_data TEXT NOT NULL,
  local_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  remote_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  resolution TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own conflicts" 
ON public.sync_conflicts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own conflicts" 
ON public.sync_conflicts 
FOR ALL 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_sync_devices_user_id ON public.sync_devices(user_id);
CREATE INDEX idx_sync_data_user_entity ON public.sync_data(user_id, entity_type, entity_id);
CREATE INDEX idx_sync_data_timestamp ON public.sync_data(timestamp);
CREATE INDEX idx_sync_conflicts_user_id ON public.sync_conflicts(user_id, status);

-- Create triggers for updated_at
CREATE TRIGGER update_sync_devices_updated_at
BEFORE UPDATE ON public.sync_devices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER TABLE public.sync_devices REPLICA IDENTITY FULL;
ALTER TABLE public.sync_data REPLICA IDENTITY FULL;
ALTER TABLE public.sync_conflicts REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_data;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_conflicts;