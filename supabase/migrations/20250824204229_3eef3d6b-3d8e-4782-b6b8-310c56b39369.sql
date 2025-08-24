-- Create voice samples table for personal voice training
CREATE TABLE public.voice_samples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sample_index INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, sample_index)
);

-- Enable Row Level Security
ALTER TABLE public.voice_samples ENABLE ROW LEVEL SECURITY;

-- Create policies for voice samples
CREATE POLICY "Users can view their own voice samples" 
ON public.voice_samples 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own voice samples" 
ON public.voice_samples 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voice samples" 
ON public.voice_samples 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voice samples" 
ON public.voice_samples 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create storage bucket for voice samples
INSERT INTO storage.buckets (id, name, public) VALUES ('voice-samples', 'voice-samples', false);

-- Create policies for voice sample storage
CREATE POLICY "Users can upload their own voice samples" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'voice-samples' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own voice samples" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'voice-samples' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own voice samples" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'voice-samples' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own voice samples" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'voice-samples' AND auth.uid()::text = (storage.foldername(name))[1]);