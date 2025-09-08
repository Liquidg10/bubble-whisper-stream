-- Create email recipients table for allowlist management
CREATE TABLE public.email_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  first_contacted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_contacted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  interaction_count INTEGER NOT NULL DEFAULT 0,
  is_allowlisted BOOLEAN NOT NULL DEFAULT false,
  trust_score REAL NOT NULL DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, email)
);

-- Enable RLS
ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own email recipients" 
ON public.email_recipients 
FOR ALL 
USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_email_recipients_user_email ON public.email_recipients(user_id, email);
CREATE INDEX idx_email_recipients_allowlisted ON public.email_recipients(user_id, is_allowlisted);
CREATE INDEX idx_email_recipients_trust_score ON public.email_recipients(user_id, trust_score DESC);

-- Create trigger for timestamps
CREATE TRIGGER update_email_recipients_updated_at
BEFORE UPDATE ON public.email_recipients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();